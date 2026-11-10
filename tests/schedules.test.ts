import { eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { approveScan } from "@/lib/capture/batch";
import { PROVIDER_IDS } from "@/lib/capture/registry";
import type { ProviderAdapter } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import {
  alerts,
  auditLog,
  organizations,
  prompts,
  providerAccounts,
  scans,
  schedules,
} from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import {
  advanceNextRun,
  createSchedule,
  deleteSchedule,
  disableSchedule,
  estimateExceedsApproved,
  formatNextRunNy,
  isLateCatchUp,
  listSchedules,
  monthlyProjectionUsd,
  pauseAllSchedules,
  periodKey,
  scheduleOwned,
  tickSchedules,
  updateSchedule,
} from "@/lib/schedules";
import { QUEUES } from "@/lib/queues";
import { assertScanOrg } from "../worker/jobs";
import { POST as schedulesPost, GET as schedulesGet } from "@/app/api/schedules/route";
import { DELETE as scheduleDeleteRoute, PATCH as schedulePatchRoute } from "@/app/api/schedules/[id]/route";
import { cookieFor, req, resetDatabase } from "./helpers";

const approvedCreate = {
  estimate_approved: true as const,
  approved_estimate_usd: 100,
};

/** Prices every draw at a known fixed amount. Never touches the network. */
function fakeAdapters(usd: number | null = 0.01): Record<string, ProviderAdapter> {
  const make = (id: string): ProviderAdapter =>
    ({
      id,
      supports: () => true,
      missingConfig: () => [],
      estimate: () => ({ units: 1, usd }),
      capture: async () => {
        throw new Error("a scheduling test must never capture");
      },
    }) as unknown as ProviderAdapter;
  return Object.fromEntries(PROVIDER_IDS.map((p) => [p, make(p)]));
}

async function seed() {
  const db = getDb();
  const { orgId, campaignId } = await legacyContext(db);
  await ensureCaptureProviders(db, orgId);
  await db.insert(prompts).values({ campaignId, text: "best engineering schools in North Carolina", provenance: "custom", status: "approved" });
  const { set } = await freezePromptSet(db, orgId, campaignId);
  return { db, orgId, campaignId, promptSetId: set.id };
}

describe("periodKey", () => {
  it("monthly is YYYY-MM in UTC", () => {
    expect(periodKey("monthly", new Date("2026-11-06T03:00:00Z"))).toBe("2026-11");
    expect(periodKey("monthly", new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    expect(periodKey("monthly", new Date("2027-01-01T00:00:00Z"))).toBe("2027-01");
  });
  it("biweekly is the ISO week, including year boundaries", () => {
    expect(periodKey("biweekly", new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(periodKey("biweekly", new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
    expect(periodKey("biweekly", new Date("2021-01-03T12:00:00Z"))).toBe("2020-W53");
    expect(periodKey("biweekly", new Date("2026-11-06T03:00:00Z"))).toBe("2026-W45");
  });
  it("manual has no period", () => {
    expect(periodKey("manual", new Date())).toBeNull();
  });
});

describe("advanceNextRun", () => {
  it("biweekly adds 14 days", () => {
    expect(advanceNextRun("biweekly", new Date("2026-11-06T10:00:00Z")).toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });
  it("monthly keeps the day, clamps to month end, and rolls the year", () => {
    expect(advanceNextRun("monthly", new Date("2026-11-06T10:00:00Z")).toISOString()).toBe("2026-12-06T10:00:00.000Z");
    expect(advanceNextRun("monthly", new Date("2027-01-31T10:00:00Z")).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(advanceNextRun("monthly", new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2027-01-15T10:00:00.000Z");
  });
  it("manual has no next run", () => {
    expect(() => advanceNextRun("manual", new Date())).toThrow();
  });
});

describe("schedule CRUD", () => {
  beforeEach(resetDatabase);

  it("requires a frozen prompt set of this campaign in this org", async () => {
    const { db, orgId, campaignId, promptSetId } = await seed();
    const [p] = await db.insert(prompts).values({ campaignId, text: "unfrozen later", provenance: "custom", status: "draft" }).returning();
    expect(p).toBeTruthy();
    const ok = await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: promptSetId,
      cadence: "monthly",
      budget_cap_usd: 5,
      ...approvedCreate,
    });
    expect(ok.enabled).toBe(true);
    expect(ok.nextRunAt).not.toBeNull();
    expect(ok.budgetCapUsd).toBe("5");

    await expect(
      createSchedule(db, orgId, {
        campaign_id: campaignId,
        prompt_set_id: promptSetId,
        cadence: "monthly",
        approved_estimate_usd: 1,
      }),
    ).rejects.toThrow(/expected true|estimate/i);
    await expect(
      createSchedule(db, orgId, {
        campaign_id: campaignId,
        prompt_set_id: "00000000-0000-4000-8000-000000000000",
        cadence: "monthly",
        ...approvedCreate,
      }),
    ).rejects.toThrow(/Prompt set not found/);
    await expect(
      createSchedule(db, orgId, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "weekly", ...approvedCreate }),
    ).rejects.toThrow();
    // Another org cannot see or schedule this campaign.
    const [other] = await db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    await expect(
      createSchedule(db, other.id, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "monthly", ...approvedCreate }),
    ).rejects.toThrow(/Campaign not found/);
    await expect(scheduleOwned(db, other.id, ok.id)).rejects.toThrow(/Schedule not found/);
    expect(await listSchedules(db, other.id, campaignId)).toEqual([]);
    expect(await listSchedules(db, orgId, campaignId)).toHaveLength(1);
  });

  it("update, disable, and delete", async () => {
    const { db, orgId, campaignId, promptSetId } = await seed();
    const s = await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: promptSetId,
      cadence: "biweekly",
      ...approvedCreate,
    });
    const u = await updateSchedule(db, orgId, s.id, { budget_cap_usd: 12.5 });
    expect(u.budgetCapUsd).toBe("12.5");
    const manual = await updateSchedule(db, orgId, s.id, { cadence: "manual" });
    expect(manual.nextRunAt).toBeNull();
    const off = await disableSchedule(db, orgId, s.id);
    expect(off.enabled).toBe(false);
    await expect(updateSchedule(db, orgId, s.id, {})).rejects.toThrow(/Nothing to update/);
    await deleteSchedule(db, orgId, s.id);
    expect(await listSchedules(db, orgId, campaignId)).toHaveLength(0);
  });
});

describe("schedule display helpers", () => {
  it("formats next run in America/New_York", () => {
    const label = formatNextRunNy(new Date("2026-11-06T15:00:00Z"));
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/EDT|EST/);
  });

  it("projects monthly cost from cadence", () => {
    expect(monthlyProjectionUsd(10, "monthly")).toBe(10);
    expect(monthlyProjectionUsd(12, "biweekly")).toBe(26);
    expect(monthlyProjectionUsd(null, "monthly")).toBeNull();
  });
});

describe("tickSchedules", () => {
  beforeEach(resetDatabase);
  const now = new Date("2026-11-06T09:00:00Z");

  async function dueSchedule(cap: number | null, approvedEstimateUsd = 100) {
    const ctx = await seed();
    const s = await createSchedule(ctx.db, ctx.orgId, {
      campaign_id: ctx.campaignId,
      prompt_set_id: ctx.promptSetId,
      cadence: "monthly",
      budget_cap_usd: cap,
      next_run_at: "2026-11-06T08:00:00Z",
      estimate_approved: true,
      approved_estimate_usd: approvedEstimateUsd,
    });
    return { ...ctx, schedule: s };
  }

  it("tick twice in the same period creates one scan and queues one run", async () => {
    const { db, orgId, schedule } = await dueSchedule(5);
    const sent: Array<{ queue: string; data: object }> = [];
    const sendJob = async (queue: string, data: object) => {
      sent.push({ queue, data });
      return "job-1";
    };
    const first = await tickSchedules(db, { now, sendJob, adapters: fakeAdapters() });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ action: "started", periodKey: "2026-11" });

    const rows = await db.select().from(scans).where(eq(scans.scheduleId, schedule.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "scan", status: "running", periodKey: "2026-11", promptSetId: schedule.promptSetId });
    expect(rows[0].name).toContain("2026-11");
    expect(rows[0].approvedBy).toBeNull();
    expect(rows[0].approvedAt).not.toBeNull();
    const est = rows[0].estimate as { spec: { draws: number; canary: boolean; routes: unknown[] }; totalUsd: number; approvedVia: string };
    expect(est.spec).toMatchObject({ draws: 3, canary: true });
    expect(est.approvedVia).toBe(`schedule:${schedule.id}`);
    expect(est.totalUsd).toBeGreaterThan(0);
    expect(sent).toEqual([{ queue: QUEUES.scanRun, data: { scan_id: rows[0].id, org_id: orgId } }]);

    // The schedule moved on, so an immediate second tick finds nothing due.
    const [moved] = await db.select().from(schedules).where(eq(schedules.id, schedule.id));
    expect(moved.nextRunAt!.toISOString()).toBe("2026-12-06T08:00:00.000Z");
    expect(await tickSchedules(db, { now, sendJob, adapters: fakeAdapters() })).toEqual([]);

    // Even if next_run_at is rewound into the same period, the period key stops a duplicate.
    await db.update(schedules).set({ nextRunAt: new Date("2026-11-06T08:00:00Z") }).where(eq(schedules.id, schedule.id));
    const again = await tickSchedules(db, { now, sendJob, adapters: fakeAdapters() });
    expect(again[0]).toMatchObject({ action: "skipped_existing", scanId: rows[0].id });
    expect(await db.select().from(scans).where(eq(scans.scheduleId, schedule.id))).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("over the cap: the scan waits for approval and a budget_threshold alert says why", async () => {
    const { db, orgId, campaignId, schedule } = await dueSchedule(0.01);
    const sent: object[] = [];
    const res = await tickSchedules(db, { now, sendJob: async (_q, d) => (sent.push(d), "j"), adapters: fakeAdapters() });
    expect(res[0].action).toBe("awaiting_approval");
    expect(res[0].detail).toMatch(/over the schedule cap/);
    expect(sent).toEqual([]);
    const [scan] = await db.select().from(scans).where(eq(scans.scheduleId, schedule.id));
    expect(scan.status).toBe("awaiting_approval");
    expect(scan.approvedAt).toBeNull();
    const rows = await db.select().from(alerts).where(eq(alerts.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "budget_threshold", status: "open", campaignId });
    expect(rows[0].payload).toMatchObject({ source: "schedule", state: "awaiting_approval", scan_id: scan.id, schedule_id: schedule.id, period_key: "2026-11", budget_cap_usd: 0.01 });
    // A person can still approve it, once.
    expect((await approveScan(db, scan.id, { userId: null, via: "ui" })).ok).toBe(true);
    const second = await approveScan(db, scan.id, { userId: null, via: "ui" });
    expect(second.ok).toBe(false);
  });

  it("no cap, unknown price, or refusals never auto-run", async () => {
    const noCap = await dueSchedule(null);
    const r1 = await tickSchedules(noCap.db, { now, sendJob: async () => "j", adapters: fakeAdapters() });
    expect(r1[0]).toMatchObject({ action: "awaiting_approval", detail: "schedule has no budget cap" });

    await resetDatabase();
    const unknown = await dueSchedule(100);
    const r2 = await tickSchedules(unknown.db, { now, sendJob: async () => "j", adapters: fakeAdapters(null) });
    expect(r2[0].action).toBe("awaiting_approval");
    const [scan] = await unknown.db.select().from(scans).where(eq(scans.scheduleId, unknown.schedule.id));
    expect((scan.estimate as { totalUsd: number | null; refusals: string[] }).totalUsd).toBeNull();
    expect((scan.estimate as { refusals: string[] }).refusals.join()).toMatch(/Price unknown/);
  });

  it("skips disabled and manual schedules, and leaves a failing schedule for the next tick", async () => {
    const { db, orgId, campaignId, promptSetId, schedule } = await dueSchedule(5);
    await disableSchedule(db, orgId, schedule.id);
    await db.insert(schedules).values({ campaignId, promptSetId, cadence: "manual", nextRunAt: new Date("2026-11-01T00:00:00Z") });
    expect(await tickSchedules(db, { now, sendJob: async () => "j", adapters: fakeAdapters() })).toEqual([]);
    expect(await db.select().from(scans).where(isNotNull(scans.scheduleId))).toHaveLength(0);

    // The queue being down is reported, never retried: the scan is approved but the run is not queued.
    await db.update(schedules).set({ enabled: true }).where(eq(schedules.id, schedule.id));
    const res = await tickSchedules(db, { now, sendJob: async () => { throw new Error("queue down"); }, adapters: fakeAdapters() });
    expect(res[0].action).toBe("error");
    expect(res[0].detail).toMatch(/not queued: queue down/);
  });

  it("laptop off across 3 due dates → exactly 1 late catch-up scan on wake", async () => {
    const ctx = await seed();
    // Biweekly dues at T0, T0+14d, T0+28d; wake after the third.
    const firstDue = new Date("2026-09-01T10:00:00Z");
    const wake = new Date("2026-10-20T12:00:00Z");
    expect(isLateCatchUp("biweekly", firstDue, wake)).toBe(true);
    const s = await createSchedule(ctx.db, ctx.orgId, {
      campaign_id: ctx.campaignId,
      prompt_set_id: ctx.promptSetId,
      cadence: "biweekly",
      budget_cap_usd: 50,
      next_run_at: firstDue.toISOString(),
      estimate_approved: true,
      approved_estimate_usd: 50,
    });
    const sent: object[] = [];
    const res = await tickSchedules(ctx.db, {
      now: wake,
      sendJob: async (_q, d) => (sent.push(d), "j"),
      adapters: fakeAdapters(),
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      action: "started",
      late: true,
      originalDueAt: firstDue.toISOString(),
      periodKey: periodKey("biweekly", firstDue),
    });
    const rows = await ctx.db.select().from(scans).where(eq(scans.scheduleId, s.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toMatch(/late/);
    expect((rows[0].estimate as { late?: boolean; originalDueAt?: string }).late).toBe(true);
    expect((rows[0].estimate as { originalDueAt?: string }).originalDueAt).toBe(firstDue.toISOString());
    const [moved] = await ctx.db.select().from(schedules).where(eq(schedules.id, s.id));
    expect(moved.nextRunAt!.getTime()).toBeGreaterThan(wake.getTime());
    // A second wake tick must not invent catch-ups for the skipped slots.
    expect(await tickSchedules(ctx.db, { now: wake, sendJob: async () => "j", adapters: fakeAdapters() })).toEqual([]);
    expect(await ctx.db.select().from(scans).where(eq(scans.scheduleId, s.id))).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("re-estimate >20% over approved pauses for editor re-approval", async () => {
    expect(estimateExceedsApproved(1.21, 1)).toBe(true);
    expect(estimateExceedsApproved(1.2, 1)).toBe(false);
    // Approved $0.01 but adapters price much higher → pause (not auto-start).
    const { db, orgId, schedule } = await dueSchedule(100, 0.01);
    const sent: object[] = [];
    const res = await tickSchedules(db, { now, sendJob: async (_q, d) => (sent.push(d), "j"), adapters: fakeAdapters(0.01) });
    expect(res[0].action).toBe("paused_reestimate");
    expect(res[0].detail).toMatch(/exceeds approved/);
    expect(sent).toEqual([]);
    const [scan] = await db.select().from(scans).where(eq(scans.scheduleId, schedule.id));
    expect(scan.status).toBe("paused");
    expect(scan.pausedReason).toMatch(/exceeds approved/);
    const rows = await db.select().from(alerts).where(eq(alerts.orgId, orgId));
    expect(rows.some((a) => (a.payload as { state?: string }).state === "paused_reestimate")).toBe(true);
  });

  it("re-estimate that would cross a provider per-scan cap pauses", async () => {
    const { db, orgId, schedule } = await dueSchedule(100, 100);
    await db
      .update(providerAccounts)
      .set({ perScanCapUsd: "0.001" })
      .where(eq(providerAccounts.orgId, orgId));
    const sent: object[] = [];
    const res = await tickSchedules(db, { now, sendJob: async (_q, d) => (sent.push(d), "j"), adapters: fakeAdapters(0.01) });
    expect(res[0].action).toBe("paused_reestimate");
    expect(res[0].detail).toMatch(/cap/);
    expect(sent).toEqual([]);
    const [scan] = await db.select().from(scans).where(eq(scans.scheduleId, schedule.id));
    expect(scan.status).toBe("paused");
  });
});

describe("schedule routes", () => {
  beforeEach(resetDatabase);

  it("viewers list, editors create/patch/delete, estimate gate, and every change is audited", async () => {
    const { db, campaignId, promptSetId } = await seed();
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const body = {
      campaign_id: campaignId,
      prompt_set_id: promptSetId,
      cadence: "biweekly" as const,
      budget_cap_usd: 3,
      ...approvedCreate,
    };

    expect((await schedulesPost(req("/api/schedules", { method: "POST", cookie: viewer, body }))).status).toBe(403);
    expect((await schedulesPost(req("/api/schedules", { method: "POST", cookie: editor, body: { ...body, campaign_id: "x" } }))).status).toBe(400);
    const noApprove = await schedulesPost(
      req("/api/schedules", {
        method: "POST",
        cookie: editor,
        body: { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "biweekly", budget_cap_usd: 3 },
      }),
    );
    expect(noApprove.status).toBe(400);

    const est = await schedulesPost(
      req("/api/schedules", {
        method: "POST",
        cookie: editor,
        body: { action: "estimate", campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "biweekly" },
      }),
    );
    expect(est.status).toBe(200);
    const estJson = (await est.json()) as { preview: { perRunUsd: number | null; monthlyProjectionUsd: number | null } };
    expect(estJson.preview).toMatchObject({ monthlyProjectionUsd: expect.anything() });

    const created = await schedulesPost(req("/api/schedules", { method: "POST", cookie: editor, body }));
    expect(created.status).toBe(201);
    const { schedule } = (await created.json()) as { schedule: { id: string; enabled: boolean; next_run_ny: string | null } };
    expect(schedule.next_run_ny).toBeTruthy();

    const list = (await (await schedulesGet(req(`/api/schedules?campaign_id=${campaignId}&include=form`, { cookie: viewer }))).json()) as {
      schedules: unknown[];
      frozen_prompt_sets: unknown[];
    };
    expect(list.schedules).toHaveLength(1);
    expect(list.frozen_prompt_sets.length).toBeGreaterThanOrEqual(1);
    expect((await schedulesGet(req("/api/schedules", { cookie: viewer }))).status).toBe(400);

    const patch = (id: string, cookie: string, b: unknown) =>
      schedulePatchRoute(req(`/api/schedules/${id}`, { method: "PATCH", cookie, body: b }), { params: { id } });
    const del = (id: string, cookie: string) =>
      scheduleDeleteRoute(req(`/api/schedules/${id}`, { method: "DELETE", cookie }), { params: { id } });
    expect((await patch(schedule.id, viewer, { enabled: false })).status).toBe(403);
    expect((await del(schedule.id, viewer)).status).toBe(403);
    expect((await patch("nope", editor, { enabled: false })).status).toBe(400);
    expect((await patch("00000000-0000-4000-8000-000000000000", editor, { enabled: false })).status).toBe(404);
    const off = await patch(schedule.id, editor, { enabled: false });
    expect(off.status).toBe(200);
    expect(((await off.json()) as { schedule: { enabled: boolean } }).schedule.enabled).toBe(false);
    const on = await patch(schedule.id, editor, { enabled: true });
    expect(on.status).toBe(200);
    const removed = await del(schedule.id, editor);
    expect(removed.status).toBe(200);
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityType, "schedule"));
    expect(audit.map((a) => a.action).sort()).toEqual([
      "schedule.create",
      "schedule.delete",
      "schedule.pause",
      "schedule.resume",
    ]);
  });

  it("pause all is admin-only and audited", async () => {
    const { db, orgId, campaignId, promptSetId } = await seed();
    await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: promptSetId,
      cadence: "monthly",
      budget_cap_usd: 5,
      ...approvedCreate,
    });
    await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: promptSetId,
      cadence: "biweekly",
      budget_cap_usd: 5,
      ...approvedCreate,
    });
    const editor = await cookieFor("editor-pause@charlotte.edu", "editor");
    const admin = await cookieFor("admin-pause@charlotte.edu", "admin");
    expect(
      (await schedulesPost(req("/api/schedules", { method: "POST", cookie: editor, body: { action: "pause_all" } }))).status,
    ).toBe(403);
    const paused = await schedulesPost(req("/api/schedules", { method: "POST", cookie: admin, body: { action: "pause_all" } }));
    expect(paused.status).toBe(200);
    const json = (await paused.json()) as { paused: number };
    expect(json.paused).toBe(2);
    expect((await listSchedules(db, orgId, campaignId)).every((s) => !s.enabled)).toBe(true);
    const lib = await pauseAllSchedules(db, orgId);
    expect(lib.paused).toBe(0);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "schedule.pause_all"));
    expect(audit).toHaveLength(1);
  });
});

describe("worker org check", () => {
  beforeEach(resetDatabase);

  it("derives the org from the scan's campaign and fails on a mismatch", async () => {
    const { db, orgId, campaignId } = await seed();
    const [scan] = await db.insert(scans).values({ campaignId, name: "w", kind: "scan", status: "complete" }).returning({ id: scans.id });
    expect(await assertScanOrg(db, scan.id, orgId)).toBe(orgId);
    await expect(assertScanOrg(db, scan.id, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/org_id mismatch/);
    await expect(assertScanOrg(db, "00000000-0000-4000-8000-000000000000", orgId)).rejects.toThrow(/not found/);
  });
});

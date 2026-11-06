import { eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { approveScan } from "@/lib/capture/batch";
import { PROVIDER_IDS } from "@/lib/capture/registry";
import type { ProviderAdapter } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { alerts, organizations, prompts, scans, schedules } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import { advanceNextRun, createSchedule, disableSchedule, listSchedules, periodKey, scheduleOwned, tickSchedules, updateSchedule } from "@/lib/schedules";
import { QUEUES } from "@/lib/queues";
import { assertScanOrg } from "../worker/jobs";
import { POST as schedulesPost, GET as schedulesGet } from "@/app/api/schedules/route";
import { PATCH as schedulePatchRoute } from "@/app/api/schedules/[id]/route";
import { auditLog } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "./helpers";

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
    const ok = await createSchedule(db, orgId, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "monthly", budget_cap_usd: 5 });
    expect(ok.enabled).toBe(true);
    expect(ok.nextRunAt).not.toBeNull();
    expect(ok.budgetCapUsd).toBe("5");

    await expect(createSchedule(db, orgId, { campaign_id: campaignId, prompt_set_id: "00000000-0000-4000-8000-000000000000", cadence: "monthly" })).rejects.toThrow(/Prompt set not found/);
    await expect(createSchedule(db, orgId, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "weekly" })).rejects.toThrow();
    // Another org cannot see or schedule this campaign.
    const [other] = await db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    await expect(createSchedule(db, other.id, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "monthly" })).rejects.toThrow(/Campaign not found/);
    await expect(scheduleOwned(db, other.id, ok.id)).rejects.toThrow(/Schedule not found/);
    expect(await listSchedules(db, other.id, campaignId)).toEqual([]);
    expect(await listSchedules(db, orgId, campaignId)).toHaveLength(1);
  });

  it("update and disable", async () => {
    const { db, orgId, campaignId, promptSetId } = await seed();
    const s = await createSchedule(db, orgId, { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "biweekly" });
    const u = await updateSchedule(db, orgId, s.id, { budget_cap_usd: 12.5 });
    expect(u.budgetCapUsd).toBe("12.5");
    const manual = await updateSchedule(db, orgId, s.id, { cadence: "manual" });
    expect(manual.nextRunAt).toBeNull();
    const off = await disableSchedule(db, orgId, s.id);
    expect(off.enabled).toBe(false);
    await expect(updateSchedule(db, orgId, s.id, {})).rejects.toThrow(/Nothing to update/);
  });
});

describe("tickSchedules", () => {
  beforeEach(resetDatabase);
  const now = new Date("2026-11-06T09:00:00Z");

  async function dueSchedule(cap: number | null) {
    const ctx = await seed();
    const s = await createSchedule(ctx.db, ctx.orgId, {
      campaign_id: ctx.campaignId,
      prompt_set_id: ctx.promptSetId,
      cadence: "monthly",
      budget_cap_usd: cap,
      next_run_at: "2026-11-06T08:00:00Z",
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
});

describe("schedule routes", () => {
  beforeEach(resetDatabase);

  it("viewers list, editors create and patch, ids are validated, and every change is audited", async () => {
    const { db, campaignId, promptSetId } = await seed();
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const body = { campaign_id: campaignId, prompt_set_id: promptSetId, cadence: "biweekly", budget_cap_usd: 3 };

    expect((await schedulesPost(req("/api/schedules", { method: "POST", cookie: viewer, body }))).status).toBe(403);
    expect((await schedulesPost(req("/api/schedules", { method: "POST", cookie: editor, body: { ...body, campaign_id: "x" } }))).status).toBe(400);
    const created = await schedulesPost(req("/api/schedules", { method: "POST", cookie: editor, body }));
    expect(created.status).toBe(201);
    const { schedule } = (await created.json()) as { schedule: { id: string; enabled: boolean } };

    const list = (await (await schedulesGet(req(`/api/schedules?campaign_id=${campaignId}`, { cookie: viewer }))).json()) as { schedules: unknown[] };
    expect(list.schedules).toHaveLength(1);
    expect((await schedulesGet(req("/api/schedules", { cookie: viewer }))).status).toBe(400);

    const patch = (id: string, cookie: string, b: unknown) => schedulePatchRoute(req(`/api/schedules/${id}`, { method: "PATCH", cookie, body: b }), { params: { id } });
    expect((await patch(schedule.id, viewer, { enabled: false })).status).toBe(403);
    expect((await patch("nope", editor, { enabled: false })).status).toBe(400);
    expect((await patch("00000000-0000-4000-8000-000000000000", editor, { enabled: false })).status).toBe(404);
    const off = await patch(schedule.id, editor, { enabled: false });
    expect(off.status).toBe(200);
    expect(((await off.json()) as { schedule: { enabled: boolean } }).schedule.enabled).toBe(false);
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityType, "schedule"));
    expect(audit.map((a) => a.action).sort()).toEqual(["schedule.create", "schedule.update"]);
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

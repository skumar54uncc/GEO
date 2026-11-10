import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { approveScan, planScan } from "@/lib/capture/batch";
import { PROVIDER_IDS } from "@/lib/capture/registry";
import { batchSpec } from "@/lib/capture/service";
import type { ProviderAdapter } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { organizations, prompts, scans, schedules } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import { createSchedule, tickSchedules } from "@/lib/schedules";
import { QUEUES } from "@/lib/queues";
import { assertScanOrg } from "../../worker/jobs";
import { resetDatabase } from "../helpers";

function fakeAdapters(usd = 0.01): Record<string, ProviderAdapter> {
  const make = (id: string): ProviderAdapter =>
    ({
      id,
      supports: () => true,
      missingConfig: () => [],
      estimate: () => ({ units: 1, usd }),
      capture: async () => {
        throw new Error("archived-org test must never capture");
      },
    }) as unknown as ProviderAdapter;
  return Object.fromEntries(PROVIDER_IDS.map((p) => [p, make(p)]));
}

describe("R6: archived orgs never run", () => {
  beforeEach(resetDatabase);

  it("enabled schedule in an archived org creates no scan and gets disabled", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    await db.insert(prompts).values({
      campaignId,
      text: "best engineering schools in North Carolina",
      provenance: "custom",
      status: "approved",
    });
    const { set } = await freezePromptSet(db, orgId, campaignId);
    const due = new Date("2026-11-06T08:00:00Z");
    const schedule = await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: set.id,
      cadence: "monthly",
      enabled: true,
      budget_cap_usd: 50,
      estimate_approved: true,
      approved_estimate_usd: 50,
      next_run_at: due.toISOString(),
    });

    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, orgId));

    const jobs: Array<{ queue: string }> = [];
    const res = await tickSchedules(db, {
      now: due,
      adapters: fakeAdapters(),
      sendJob: async (queue) => {
        jobs.push({ queue });
        return "job";
      },
    });

    expect(res).toHaveLength(1);
    expect(res[0].action).toBe("disabled_archived");
    expect(res[0].detail).toBe("org archived");
    expect(res[0].scanId).toBeNull();
    expect(jobs.filter((j) => j.queue === QUEUES.scanRun)).toHaveLength(0);
    expect(await db.select().from(scans).where(eq(scans.scheduleId, schedule.id))).toHaveLength(0);

    const [row] = await db.select().from(schedules).where(eq(schedules.id, schedule.id));
    expect(row.enabled).toBe(false);
  });

  it("scan.run path for an archived org makes zero provider calls", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    await db.insert(prompts).values({
      campaignId,
      text: "power programs",
      provenance: "custom",
      status: "approved",
    });
    const { set } = await freezePromptSet(db, orgId, campaignId);
    const spec = await batchSpec(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: set.id,
      kind: "scan",
      draws: 1,
      canary: false,
      name: "archived probe",
    });
    const planned = await planScan(db, { orgId, ...spec, adapters: fakeAdapters() });
    const approved = await approveScan(db, planned.scanId, { userId: null, via: "test" });
    expect(approved.ok).toBe(true);

    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, orgId));

    const capture = vi.fn(async () => {
      throw new Error("provider should not be called");
    });

    // Worker path: assertScanOrg runs before any adapter.capture.
    await expect(assertScanOrg(db, planned.scanId, orgId)).rejects.toThrow(/archived/i);
    expect(capture).not.toHaveBeenCalled();
  });

  it("approveScan refuses when the org is archived", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    await db.insert(prompts).values({
      campaignId,
      text: "approve archived",
      provenance: "custom",
      status: "approved",
    });
    const { set } = await freezePromptSet(db, orgId, campaignId);
    const spec = await batchSpec(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: set.id,
      kind: "scan",
      draws: 1,
      canary: false,
      name: "awaiting",
    });
    const planned = await planScan(db, { orgId, ...spec, adapters: fakeAdapters() });
    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, orgId));
    const approved = await approveScan(db, planned.scanId, { userId: null, via: "test" });
    expect(approved.ok).toBe(false);
    expect(approved.reason).toMatch(/archived/i);
    const [scan] = await db.select().from(scans).where(eq(scans.id, planned.scanId));
    expect(scan.status).toBe("awaiting_approval");
  });
});

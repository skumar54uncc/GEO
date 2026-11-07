import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { approveScan, planScan, runScan } from "@/lib/capture/batch";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import type { CaptureResult, ProviderAdapter, Region } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { alerts, auditLog, draws, prompts, scans } from "@/lib/db/pg/schema";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { resetDatabase } from "../helpers";

type Ctx = { orgId: string; campaignId: string; region: Region; promptId: string };

async function setup(): Promise<Ctx> {
  const db = getDb();
  const { orgId, campaignId } = await legacyContext(db);
  await ensureCaptureProviders(db, orgId);
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const [p] = await db
    .insert(prompts)
    .values({ campaignId, text: "best engineering schools in North Carolina", provenance: "custom", status: "approved" })
    .returning();
  return { orgId, campaignId, region, promptId: p.id };
}

function fakeAdapter(
  id: string,
  capture: Partial<CaptureResult> | ((n: number) => Partial<CaptureResult>),
  estimateUsd = 0.01,
): ProviderAdapter & { calls: number } {
  const a = {
    id,
    calls: 0,
    supports: () => true,
    missingConfig: () => [],
    estimate: () => ({ units: 1, usd: estimateUsd }),
    async capture() {
      a.calls++;
      const r = typeof capture === "function" ? capture(a.calls) : capture;
      return {
        status: "ok",
        answerText: `answer ${a.calls}`,
        citations: [],
        fanoutQueries: [],
        modelBuild: "m-1",
        regionHonored: "unknown",
        raw: { call: a.calls },
        costUnits: 1,
        costUsd: estimateUsd,
        latencyMs: 5,
        ...r,
      } as CaptureResult;
    },
  };
  return a;
}

describe("runScan stop-loss", () => {
  beforeEach(resetDatabase);

  it("pauses after 60 early errors with an alert and does not run the full plan", async () => {
    const db = getDb();
    const ctx = await setup();
    const plannedDraws = 120;
    const adapter = fakeAdapter("anthropic", { status: "error", answerText: "", error: "HTTP 503", costUsd: 0 });
    const { scanId, estimate } = await planScan(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      kind: "dry_run",
      name: "stop-loss errors",
      spec: {
        promptIds: [ctx.promptId],
        regionIds: [ctx.region.id],
        draws: plannedDraws,
        canary: false,
        routes: [{ engine: "claude", runner: "api_search", provider: "anthropic" }],
      },
      adapters: { anthropic: adapter },
    });
    expect(estimate.refusals).toEqual([]);
    await approveScan(db, scanId, { userId: null, via: "test" });

    const summary = await runScan(db, scanId, { orgId: ctx.orgId, adapters: { anthropic: adapter }, concurrencyPerProvider: 2 });
    expect(summary.status).toBe("partial");

    const rows = await db.select().from(draws).where(eq(draws.scanId, scanId));
    expect(rows.length).toBeLessThan(plannedDraws - 10);
    expect(rows.length).toBeGreaterThanOrEqual(60);

    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
    expect(scan.status).toBe("paused");
    expect(scan.pausedReason).toBe("first_60_error_or_blocked_rate");

    const scanAlerts = await db.select().from(alerts).where(and(eq(alerts.campaignId, ctx.campaignId), eq(alerts.kind, "provider_error_rate")));
    expect(scanAlerts).toHaveLength(1);
    const payload = scanAlerts[0]!.payload as { source?: string; triggers?: string[] };
    expect(payload.source).toBe("stop_loss");
    expect(payload.triggers).toContain("first_60_error_or_blocked_rate");

    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "scan.stop_loss_paused"));
    expect(audits.some((a) => a.entityId === scanId)).toBe(true);
  });

  it("pauses on estimate cost overrun", async () => {
    const db = getDb();
    const ctx = await setup();
    const adapter = fakeAdapter("anthropic", {}, 0.01);
    const billing = fakeAdapter("anthropic", { costUsd: 1 }, 0.01);
    const plannedDraws = 40;
    const { scanId, estimate } = await planScan(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      kind: "dry_run",
      name: "stop-loss cost",
      spec: {
        promptIds: [ctx.promptId],
        regionIds: [ctx.region.id],
        draws: plannedDraws,
        canary: false,
        routes: [{ engine: "claude", runner: "api_search", provider: "anthropic" }],
      },
      adapters: { anthropic: adapter },
    });
    expect(estimate.totalUsd).not.toBeNull();
    await approveScan(db, scanId, { userId: null, via: "test" });

    const summary = await runScan(db, scanId, { orgId: ctx.orgId, adapters: { anthropic: billing }, concurrencyPerProvider: 1 });
    expect(summary.status).toBe("partial");

    const rows = await db.select().from(draws).where(eq(draws.scanId, scanId));
    expect(rows.length).toBeLessThan(plannedDraws);

    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
    expect(scan.status).toBe("paused");
    expect(scan.pausedReason).toBe("estimate_cost_overrun");

    const scanAlerts = await db.select().from(alerts).where(and(eq(alerts.campaignId, ctx.campaignId), eq(alerts.kind, "budget_threshold")));
    expect(scanAlerts).toHaveLength(1);
    const payload = scanAlerts[0]!.payload as { source?: string; triggers?: string[] };
    expect(payload.source).toBe("stop_loss");
    expect(payload.triggers).toContain("estimate_cost_overrun");
  });
});

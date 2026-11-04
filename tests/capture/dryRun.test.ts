import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { planDryRun, runDryRun } from "@/lib/capture/dryRun";
import type { CaptureResult, ProviderAdapter } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { draws, prompts, scans } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

function fake(id: string, usd: number): ProviderAdapter & { calls: number } {
  const a = {
    id,
    calls: 0,
    supports: () => true,
    missingConfig: () => [],
    estimate: () => ({ units: 1, usd }),
    async capture() {
      a.calls++;
      return {
        status: "ok",
        answerText: `answer ${a.calls}`,
        citations: [],
        fanoutQueries: [],
        modelBuild: "m-1",
        regionHonored: "yes",
        raw: { call: a.calls },
        costUnits: 1,
        costUsd: usd,
        latencyMs: 5,
      } as CaptureResult;
    },
  };
  return a;
}

async function setup(n = 4) {
  const db = getDb();
  const { orgId, campaignId } = await legacyContext(db);
  await ensureCaptureProviders(db, orgId);
  for (let i = 0; i < n; i++) {
    await db.insert(prompts).values({ campaignId, text: `prompt ${i}`, provenance: "custom", status: i === n - 1 ? "approved" : "draft" });
  }
  return { db, orgId, campaignId };
}

describe("dry run", () => {
  beforeEach(resetDatabase);

  it("plans 3 prompts × 6 primary routes × 3 draws in Charlotte, approved prompts first, and calls nothing", async () => {
    const { db, orgId, campaignId } = await setup();
    const adapters = { dataforseo: fake("dataforseo", 0.004), anthropic: fake("anthropic", 0.02) };
    const { scanId, estimate } = await planDryRun(db, { orgId, campaignId, adapters });
    expect(estimate.cells).toHaveLength(6);
    expect(estimate.cells.find((c) => c.engine === "perplexity")?.provider).toBe("dataforseo");
    expect(estimate.cells.find((c) => c.engine === "perplexity")?.runner).toBe("api_search");
    expect(estimate.cells.every((c) => c.draws === 3 * 3 + 1)).toBe(true);
    expect(estimate.refusals).toEqual([]);
    const approved = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.status, "approved"));
    expect(estimate.spec.promptIds[0]).toBe(approved[0].id);
    expect(Object.values(adapters).every((a) => a.calls === 0)).toBe(true);
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
    expect(scan.kind).toBe("dry_run");
    expect(scan.status).toBe("awaiting_approval");
  });

  it("refuses a run whose approved amount differs from the estimate, then runs on the exact amount", async () => {
    const { db, orgId, campaignId } = await setup();
    const adapters = { dataforseo: fake("dataforseo", 0.004), anthropic: fake("anthropic", 0.02) };
    const { scanId, estimate } = await planDryRun(db, { orgId, campaignId, adapters });
    await expect(runDryRun(db, { orgId, scanId, approvedUsd: (estimate.totalUsd ?? 0) + 1, approver: "test", adapters })).rejects.toThrow(/does not match/);
    expect(adapters.dataforseo.calls).toBe(0);

    const summary = await runDryRun(db, { orgId, scanId, approvedUsd: estimate.totalUsd!, approver: "test", adapters });
    expect(summary.status).toBe("complete");
    expect(summary.byCell.every((c) => c.ok === 9)).toBe(true);
    const rows = await db.select().from(draws).where(eq(draws.scanId, scanId));
    expect(rows).toHaveLength(54);
    expect(new Set(rows.map((r) => `${r.engine}|${r.runner}|${r.fidelity}`)).size).toBe(6);
    expect(summary.actualUsd).toBe(estimate.totalUsd);
  });

  it("needs at least 3 prompts", async () => {
    const { db, orgId, campaignId } = await setup(2);
    await expect(planDryRun(db, { orgId, campaignId })).rejects.toThrow(/at least 3 prompts/);
  });
});

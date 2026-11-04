import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { approveScan, runScan } from "@/lib/capture/batch";
import { calibrationRoutes, computeCalibration, jaccard, meanJaccard, mentionAgreement, planCalibration, samplePrompts } from "@/lib/capture/calibration";
import { FANOUT_ENGINE, planFanout, runFanout } from "@/lib/capture/fanout";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import type { CaptureResult, ProviderAdapter } from "@/lib/capture/types";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { calibrationRuns, draws, fanoutQueries, prompts, scans, serpSnapshots } from "@/lib/db/pg/schema";
import type { AliasEntry } from "@/lib/judge/aliases";
import { resetDatabase } from "../helpers";

describe("calibration math", () => {
  it("jaccard", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 9);
    expect(jaccard(new Set(), new Set())).toBeNull();
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });

  it("mention agreement with n and a Wilson interval", () => {
    const a = mentionAgreement([
      [true, true],
      [false, false],
      [true, false],
      [false, false],
    ]);
    expect(a).toMatchObject({ n: 4, agree: 3, rate: 0.75 });
    expect(a.ciLow!).toBeLessThan(0.75);
    expect(a.ciHigh!).toBeGreaterThan(0.75);
    expect(mentionAgreement([])).toMatchObject({ n: 0, rate: null });
  });

  it("mean Jaccard excludes undefined pairs and reports n", () => {
    const m = meanJaccard([1, 0, null, 0.5]);
    expect(m.n).toBe(3);
    expect(m.mean).toBeCloseTo(0.5, 9);
    expect(m.ciLow).toBeGreaterThanOrEqual(0);
    expect(m.ciHigh).toBeLessThanOrEqual(1);
    expect(meanJaccard([null])).toMatchObject({ n: 0, mean: null });
  });

  it("stable sample and routes with a fallback only", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
    expect(samplePrompts(ids, 20, "2026-11")).toEqual(samplePrompts([...ids].reverse(), 20, "2026-11"));
    expect(samplePrompts(ids, 20, "2026-11")).not.toEqual(samplePrompts(ids, 20, "2026-12"));
    const routes = calibrationRoutes(["chatgpt", "claude", "google_ai_mode"]);
    // Claude primary and Anthropic fallback share api_search; they still calibrate by provider.
    expect(routes.map((r) => `${r.engine}:${r.runner}:${r.provider}`)).toEqual([
      "chatgpt:ui_provider:dataforseo",
      "chatgpt:api_search:openai",
      "claude:api_search:dataforseo",
      "claude:api_search:anthropic",
    ]);
  });
});

function fake(id: string, fn: (prompt: string) => Partial<CaptureResult>): ProviderAdapter {
  return {
    id,
    supports: () => true,
    missingConfig: () => [],
    estimate: () => ({ units: 1, usd: 0.001 }),
    async capture(req) {
      return { status: "ok", answerText: "", citations: [], fanoutQueries: [], modelBuild: "m", regionHonored: "unknown", raw: { p: req.prompt, d: req.drawIndex }, costUnits: 1, costUsd: 0.001, latencyMs: 1, ...fn(req.prompt) } as CaptureResult;
    },
  };
}

describe("calibration run and fan out", () => {
  beforeEach(resetDatabase);

  it("computes agreement and Jaccard for primary vs fallback and stores n", async () => {
    const db = getDb();
    const { orgId, campaignId, brandId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const ps = await db
      .insert(prompts)
      .values(["q1", "q2", "q3"].map((text) => ({ campaignId, text, provenance: "custom" as const, status: "approved" as const })))
      .returning();
    const aliases: AliasEntry[] = [{ alias: "UNC Charlotte", entityType: "brand", entityId: brandId, entityName: "UNC Charlotte", requiresContext: false }];
    // Primary mentions on q1 and q2; fallback only on q1. Citations: q1 same domain, q2 disjoint, q3 none.
    const primary = fake("dataforseo", (p) => ({
      answerText: p === "q3" ? "Charlotte is a city." : "UNC Charlotte is good.",
      citations: p === "q3" ? [] : [{ url: p === "q1" ? "https://charlotte.edu/a" : "https://ncsu.edu/b", position: 1, linked: true }],
    }));
    const fallback = fake("openai", (p) => ({
      answerText: p === "q1" ? "UNC Charlotte too." : "Other schools.",
      citations: p === "q3" ? [] : [{ url: p === "q1" ? "https://charlotte.edu/z" : "https://duke.edu/c", position: 1, linked: true }],
    }));
    const { scanId } = await planCalibration(db, { orgId, campaignId, promptSetId: null, promptIds: ps.map((p) => p.id), regionId: region.id, month: "2026-11", engines: ["chatgpt"], adapters: { dataforseo: primary, openai: fallback } });
    expect((await approveScan(db, scanId, { userId: null, via: "test" })).ok).toBe(true);
    await runScan(db, scanId, { orgId, adapters: { dataforseo: primary, openai: fallback } });
    const [res] = await computeCalibration(db, { orgId, scanId, month: "2026-11", aliases });
    expect(res.agreement).toMatchObject({ n: 3, agree: 2 });
    expect(res.jaccard.n).toBe(2);
    expect(res.jaccard.mean).toBeCloseTo(0.5, 9);
    const [row] = await db.select().from(calibrationRuns).where(eq(calibrationRuns.scanId, scanId));
    expect(row).toMatchObject({ engine: "chatgpt", primaryRunner: "ui_provider", fallbackRunner: "api_search", nPrompts: 3, mentionPairs: 3, jaccardPairs: 2 });
    expect(Number(row.mentionAgreement)).toBeCloseTo(2 / 3, 6);
  });

  it("fan out: plans only new queries, needs the shown cost, stores organic snapshots", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db.insert(prompts).values({ campaignId, text: "q", provenance: "custom", status: "approved" }).returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "f", kind: "scan", status: "complete" }).returning();
    const [d] = await db
      .insert(draws)
      .values({ scanId: s.id, promptId: p.id, engine: "chatgpt", runner: "ui_provider", fidelity: "high", provider: "dataforseo", regionId: region.id, drawIndex: 1, status: "ok", answerText: "x", capturedAt: new Date() })
      .returning();
    await db.insert(fanoutQueries).values([
      { drawId: d.id, query: "unc charlotte power engineering", source: "provider_field" },
      { drawId: d.id, query: "UNC Charlotte power engineering", source: "provider_field" },
      { drawId: d.id, query: "nc state grid", source: "provider_field" },
    ]);
    await db.insert(serpSnapshots).values({ query: "nc state grid", regionId: region.id, engine: FANOUT_ENGINE, fetchedAt: new Date(), organic: [] });

    const plan = await planFanout(db, s.id);
    expect(plan.items.map((i) => i.query)).toEqual(["unc charlotte power engineering"]);
    expect(plan.skippedExisting).toBe(1);
    expect(plan.usd).toBeCloseTo(0.002, 9);

    const organic = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/capture/dataforseo_google_organic_live_advanced.json"), "utf8")).response;
    const deps = { env: { DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }, fetch: async () => new Response(JSON.stringify(organic), { status: 200 }) };
    await expect(runFanout(db, plan, { orgId, approvedUsd: 1, deps })).rejects.toThrow(/changed/);
    const out = await runFanout(db, plan, { orgId, approvedUsd: plan.usd, deps });
    expect(out.fetched).toBe(1);
    const snaps = await db.select().from(serpSnapshots).where(eq(serpSnapshots.query, "unc charlotte power engineering"));
    expect((snaps[0].organic as unknown[]).length).toBeGreaterThan(0);
    expect((await planFanout(db, s.id)).items).toHaveLength(0);
  });
});

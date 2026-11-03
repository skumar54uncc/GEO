import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDataForSeoAdapter } from "@/lib/capture/adapters/dataforseo";
import { approveScan, planRetry, planScan, runRetry, runScan } from "@/lib/capture/batch";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { captureDraw, drawParams, type DrawPlan } from "@/lib/capture/run";
import { paramsHash } from "@/lib/site/providerCall";
import type { CaptureResult, ProviderAdapter, Region } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { alerts, canaryRuns, citations, costLedger, draws, fanoutQueries, prompts, providerAccounts, scans, serpSnapshots } from "@/lib/db/pg/schema";
import { getRawText } from "@/lib/rawstore";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { resetDatabase } from "../helpers";
import fs from "fs";
import path from "path";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/capture", name), "utf8"));

type Ctx = { orgId: string; campaignId: string; region: Region; promptId: string; scanId: string };

async function setup(): Promise<Ctx> {
  const db = getDb();
  const { orgId, campaignId } = await legacyContext(db);
  await ensureCaptureProviders(db, orgId);
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const [p] = await db.insert(prompts).values({ campaignId, text: "best engineering schools in North Carolina", provenance: "custom", status: "approved" }).returning();
  const [s] = await db.insert(scans).values({ campaignId, name: "t", kind: "capture_test", status: "running", approvedAt: new Date() }).returning();
  return { orgId, campaignId, region, promptId: p.id, scanId: s.id };
}

/** A fake adapter that returns a fixed result and counts calls. Never touches the network. */
function fakeAdapter(id: string, result: Partial<CaptureResult> | ((n: number) => Partial<CaptureResult>), usd = 0.01): ProviderAdapter & { calls: number } {
  const a = {
    id,
    calls: 0,
    supports: () => true,
    missingConfig: () => [],
    estimate: () => ({ units: 1, usd }),
    async capture() {
      a.calls++;
      const r = typeof result === "function" ? result(a.calls) : result;
      return {
        status: "ok",
        answerText: `answer ${a.calls}`,
        citations: [],
        fanoutQueries: [],
        modelBuild: "m-1",
        regionHonored: "unknown",
        raw: { call: a.calls },
        costUnits: 1,
        costUsd: usd,
        latencyMs: 5,
        ...r,
      } as CaptureResult;
    },
  };
  return a;
}

function plan(ctx: Ctx, over: Partial<DrawPlan> = {}): DrawPlan {
  return {
    orgId: ctx.orgId,
    scanId: ctx.scanId,
    promptId: ctx.promptId,
    promptSetId: null,
    promptText: "best engineering schools in North Carolina",
    engine: "claude",
    runner: "api_search",
    provider: "anthropic",
    region: ctx.region,
    drawIndex: 1,
    ...over,
  };
}

describe("captureDraw", () => {
  beforeEach(resetDatabase);

  it("draw index and attempt change the cache key", async () => {
    const ctx = await setup();
    const h1 = paramsHash(drawParams(plan(ctx, { drawIndex: 1 })));
    const h2 = paramsHash(drawParams(plan(ctx, { drawIndex: 2 })));
    const h3 = paramsHash(drawParams(plan(ctx, { drawIndex: 1, attempt: 2 })));
    expect(new Set([h1, h2, h3]).size).toBe(3);
  });

  it("three draws are three calls and three distinct raw payloads, with runner, fidelity, region, model", async () => {
    const db = getDb();
    const ctx = await setup();
    const a = fakeAdapter("anthropic", {});
    for (const d of [1, 2, 3]) await captureDraw(db, plan(ctx, { drawIndex: d }), { adapter: a });
    expect(a.calls).toBe(3);
    const rows = await db.select().from(draws).where(eq(draws.scanId, ctx.scanId));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.rawPayloadId)).size).toBe(3);
    for (const r of rows) {
      expect(r.runner).toBe("api_search");
      expect(r.fidelity).toBe("medium");
      expect(r.regionHonored).toBe("unknown");
      expect(r.modelBuild).toBe("m-1");
      expect(r.provider).toBe("anthropic");
    }
    const ledger = await db.select().from(costLedger).where(eq(costLedger.scanId, ctx.scanId));
    expect(ledger).toHaveLength(3);
    expect(Number(ledger[0].usd)).toBeCloseTo(0.01, 6);
  });

  it("a redelivered job reuses the draw and does not pay twice", async () => {
    const db = getDb();
    const ctx = await setup();
    const a = fakeAdapter("anthropic", {});
    const first = await captureDraw(db, plan(ctx), { adapter: a });
    const again = await captureDraw(db, plan(ctx), { adapter: a });
    expect(a.calls).toBe(1);
    expect(again.reused).toBe(true);
    expect(again.drawId).toBe(first.drawId);
  });

  it("the cost guard refuses over budget: blocked draw, no call", async () => {
    const db = getDb();
    const ctx = await setup();
    await db.update(providerAccounts).set({ monthlyBudgetUsd: "1", spentUsdMonth: "0.995" }).where(and(eq(providerAccounts.orgId, ctx.orgId), eq(providerAccounts.provider, "anthropic")));
    const a = fakeAdapter("anthropic", {}, 0.01);
    const out = await captureDraw(db, plan(ctx), { adapter: a });
    expect(a.calls).toBe(0);
    expect(out.status).toBe("blocked");
    expect(out.refused).toMatch(/monthly budget/);
  });

  it("the per scan cap refuses once the scan has spent it", async () => {
    const db = getDb();
    const ctx = await setup();
    await db.update(providerAccounts).set({ perScanCapUsd: "0.025" }).where(and(eq(providerAccounts.orgId, ctx.orgId), eq(providerAccounts.provider, "anthropic")));
    const a = fakeAdapter("anthropic", {}, 0.01);
    const results = [];
    for (const d of [1, 2, 3]) results.push(await captureDraw(db, plan(ctx, { drawIndex: d }), { adapter: a }));
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "blocked"]);
    expect(results[2].refused).toMatch(/per-scan cap/);
  });

  it("unknown price is refused rather than guessed", async () => {
    const db = getDb();
    const ctx = await setup();
    const a = { ...fakeAdapter("anthropic", {}), estimate: () => ({ units: 1, usd: null }) };
    const out = await captureDraw(db, plan(ctx), { adapter: a });
    expect(out.status).toBe("blocked");
    expect(out.refused).toMatch(/price unknown/);
  });

  it("a failed provider call becomes an error draw with its raw payload, and an adapter that throws does not crash", async () => {
    const db = getDb();
    const ctx = await setup();
    const failing = fakeAdapter("anthropic", { status: "error", answerText: "", error: "HTTP 500", raw: "Internal error", costUsd: 0 });
    const out = await captureDraw(db, plan(ctx), { adapter: failing });
    expect(out.status).toBe("error");
    const [row] = await db.select().from(draws).where(eq(draws.id, out.drawId));
    expect(row.error).toBe("HTTP 500");
    expect(await getRawText(db, row.rawPayloadId!)).toBe('"Internal error"');

    const throwing = { ...fakeAdapter("anthropic", {}), capture: async () => { throw new Error("boom"); } };
    const out2 = await captureDraw(db, plan(ctx, { drawIndex: 2 }), { adapter: throwing as unknown as ProviderAdapter });
    expect(out2.status).toBe("error");
    expect(out2.error).toContain("boom");
  });

  it("stores citations with class and spans, fan out queries, and organic snapshots", async () => {
    const db = getDb();
    const ctx = await setup();
    const adapter = createDataForSeoAdapter({
      env: { DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" },
      fetch: async () => new Response(JSON.stringify(fixture("dataforseo_google_organic_live_advanced.json").response), { status: 200 }),
    });
    const out = await captureDraw(db, plan(ctx, { engine: "google_aio", runner: "serp_provider", provider: "dataforseo" }), { adapter });
    expect(out.status).toBe("ok");
    const [row] = await db.select().from(draws).where(eq(draws.id, out.drawId));
    expect(row.fidelity).toBe("high");
    expect(row.regionHonored).toBe("yes");
    expect(Number(row.costUsd)).toBeCloseTo(0.003, 6);
    const cits = await db.select().from(citations).where(eq(citations.drawId, out.drawId));
    expect(cits.length).toBe(2);
    expect(cits.every((c) => c.domain && c.sourceClass)).toBe(true);
    const snaps = await db.select().from(serpSnapshots).where(eq(serpSnapshots.promptId, ctx.promptId));
    expect(snaps).toHaveLength(1);
    expect((snaps[0].organic as unknown[]).length).toBeGreaterThan(0);

    const chat = fakeAdapter("anthropic", { fanoutQueries: ["unc charlotte engineering", "unc charlotte engineering", " "], citations: [{ url: "https://www.charlotte.edu/x", position: 1, linked: true, spanStart: 0, spanEnd: 5 }] });
    const out2 = await captureDraw(db, plan(ctx, { drawIndex: 2 }), { adapter: chat });
    expect((await db.select().from(fanoutQueries).where(eq(fanoutQueries.drawId, out2.drawId))).map((f) => f.query)).toEqual(["unc charlotte engineering"]);
    const [c] = await db.select().from(citations).where(eq(citations.drawId, out2.drawId));
    expect(c).toMatchObject({ domain: "charlotte.edu", spanStart: 0, spanEnd: 5 });
  });

  it("missing keys give a blocked draw and no ledger row", async () => {
    const db = getDb();
    const ctx = await setup();
    const out = await captureDraw(db, plan(ctx, { provider: "anthropic" }), { adapter: { ...fakeAdapter("anthropic", {}), missingConfig: () => ["ANTHROPIC_API_KEY"] } });
    expect(out.status).toBe("blocked");
    expect(await db.select().from(costLedger)).toHaveLength(0);
  });
});

describe("scan batch: estimate, approve, run, retry", () => {
  beforeEach(resetDatabase);

  it("needs approval, runs canaries first, refuses a route whose canary fails, retries with cost shown", async () => {
    const db = getDb();
    const ctx = await setup();
    const good = fakeAdapter("anthropic", {});
    const broken = fakeAdapter("openai", { status: "empty", answerText: "" });
    const flaky = fakeAdapter("gemini", (n) => (n === 3 ? { status: "error", answerText: "", error: "HTTP 503", costUsd: 0 } : {}));
    const adapters = { anthropic: good, openai: broken, gemini: flaky };
    const { scanId, estimate } = await planScan(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      kind: "dry_run",
      name: "t",
      spec: {
        promptIds: [ctx.promptId],
        regionIds: [ctx.region.id],
        draws: 3,
        canary: true,
        routes: [
          { engine: "claude", runner: "api_search", provider: "anthropic" },
          { engine: "chatgpt", runner: "api_search", provider: "openai" },
          { engine: "gemini", runner: "api_search", provider: "gemini" },
        ],
      },
      adapters,
    });
    expect(estimate.refusals).toEqual([]);
    expect(estimate.totalDraws).toBe(12);
    expect(estimate.totalUsd).toBeCloseTo(0.12, 6);
    expect(good.calls).toBe(0);

    await expect(runScan(db, scanId, { orgId: ctx.orgId, adapters })).rejects.toThrow(/not approved/);
    expect((await approveScan(db, scanId, { userId: null, via: "test" })).ok).toBe(true);
    const summary = await runScan(db, scanId, { orgId: ctx.orgId, adapters });

    expect(summary.canaries.find((c) => c.route.provider === "openai")?.ok).toBe(false);
    expect(broken.calls).toBe(1);
    expect(good.calls).toBe(4);
    const claude = summary.byCell.find((c) => c.provider === "anthropic")!;
    expect(claude).toMatchObject({ ok: 3, fidelity: "medium" });
    expect(claude.costUsd).toBeCloseTo(0.04, 6);
    const gem = summary.byCell.find((c) => c.provider === "gemini")!;
    expect(gem.ok + gem.error).toBe(3);
    expect(gem.error).toBe(1);
    expect(summary.status).toBe("partial");
    expect(await db.select().from(canaryRuns).where(eq(canaryRuns.scanId, scanId))).toHaveLength(3);
    expect((await db.select().from(alerts)).map((a) => a.kind)).toEqual(["canary_failed"]);

    const retry = await planRetry(db, scanId, ctx.orgId, adapters);
    expect(retry.draws).toHaveLength(1);
    expect(retry.usd).toBeCloseTo(0.01, 6);
    const before = flaky.calls;
    await expect(runRetry(db, retry, { orgId: ctx.orgId, approvedUsd: 999, adapters })).rejects.toThrow(/changed/);
    const outs = await runRetry(db, retry, { orgId: ctx.orgId, approvedUsd: retry.usd, adapters });
    expect(flaky.calls).toBe(before + 1);
    expect(outs[0].status).toBe("ok");
    const rows = await db.select().from(draws).where(and(eq(draws.scanId, scanId), eq(draws.engine, "gemini")));
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.attempt === 2)).toHaveLength(1);
    expect((await planRetry(db, scanId, ctx.orgId, adapters)).draws).toHaveLength(0);
  });

  it("an estimate with missing keys or over budget cannot be approved", async () => {
    const db = getDb();
    const ctx = await setup();
    const { scanId, estimate } = await planScan(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      kind: "dry_run",
      name: "t",
      spec: { promptIds: [ctx.promptId], regionIds: [ctx.region.id], draws: 3, canary: false, routes: [{ engine: "claude", runner: "api_search", provider: "anthropic" }] },
      adapters: { anthropic: { ...fakeAdapter("anthropic", {}), missingConfig: () => ["ANTHROPIC_API_KEY"] } },
    });
    expect(estimate.refusals.join(" ")).toMatch(/ANTHROPIC_API_KEY/);
    expect((await approveScan(db, scanId, { userId: null, via: "test" })).ok).toBe(false);

    await db.update(providerAccounts).set({ monthlyBudgetUsd: "0.02" }).where(and(eq(providerAccounts.orgId, ctx.orgId), eq(providerAccounts.provider, "anthropic")));
    const over = await planScan(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      kind: "dry_run",
      name: "t2",
      spec: { promptIds: [ctx.promptId], regionIds: [ctx.region.id], draws: 3, canary: false, routes: [{ engine: "claude", runner: "api_search", provider: "anthropic" }] },
      adapters: { anthropic: fakeAdapter("anthropic", {}) },
    });
    expect(over.estimate.refusals.join(" ")).toMatch(/monthly budget/);
  });
});

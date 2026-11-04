import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { chargeUnits, checkBudget, getProviderAccount, recordCall, unitsToUsd } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { citations, draws, fanoutQueries, providerCache, serpSnapshots } from "@/lib/db/pg/schema";
import { registrableDomain } from "@/lib/domain";
import { getRawText, putRaw } from "@/lib/rawstore";
import { paramsHash } from "@/lib/site/providerCall";
import { createAdapter, type ProviderId } from "./registry";
import { sourceClassifier } from "./sources";
import { errorResult, fidelityFor, type CaptureRequest, type CaptureResult, type Engine, type ProviderAdapter, type Region, type Runner } from "./types";

export type DrawPlan = {
  orgId: string;
  scanId: string;
  promptId: string;
  promptSetId: string | null;
  promptText: string;
  engine: Engine;
  runner: Runner;
  provider: ProviderId;
  region: Region;
  drawIndex: number;
  attempt?: number;
  experimental?: boolean;
};

export type DrawOutcome = {
  drawId: string;
  status: CaptureResult["status"];
  costUsd: number | null;
  refused: string | null;
  reused: boolean;
  error: string | null;
  /** Organic rows returned with a Google draw; 0 when none or unknown. */
  organicCount: number;
};

/**
 * The cache key holds the scan, draw index and attempt, so repeated draws are never copies of one call.
 * It exists so a job redelivered after a crash does not pay twice.
 */
export function drawParams(plan: DrawPlan) {
  return {
    provider: plan.provider,
    engine: plan.engine,
    runner: plan.runner,
    prompt: plan.promptText,
    regionId: plan.region.id,
    serpLocation: plan.region.serpLocation,
    scanId: plan.scanId,
    drawIndex: plan.drawIndex,
    attempt: plan.attempt ?? 1,
  };
}

/** USD for the guard: the adapter's estimate, or units at the account's unit price, else unknown. */
export async function estimateUsd(db: Db, plan: DrawPlan, adapter: ProviderAdapter): Promise<{ units: number; usd: number | null; note?: string }> {
  const est = adapter.estimate(requestFor(plan, "estimate"));
  if (est.usd !== null) return est;
  const account = await getProviderAccount(db, plan.orgId, plan.provider);
  return { ...est, usd: unitsToUsd(est.units, account?.creditUnitUsd) };
}

function requestFor(plan: DrawPlan, drawId: string): CaptureRequest {
  return { drawId, engine: plan.engine, runner: plan.runner, prompt: plan.promptText, region: plan.region, drawIndex: plan.drawIndex };
}

type CachedEnvelope = Omit<CaptureResult, "raw"> & { rawPayloadId: string | null };

/**
 * One draw: idempotency check, guard, one provider call, raw payload, immutable draw row, ledger,
 * citations, fan out, organic snapshot. Never throws for provider failures; never retries.
 */
export async function captureDraw(db: Db, plan: DrawPlan, opts: { adapter?: ProviderAdapter } = {}): Promise<DrawOutcome> {
  const attempt = plan.attempt ?? 1;
  const [existing] = await db
    .select({ id: draws.id, status: draws.status, costUsd: draws.costUsd, error: draws.error })
    .from(draws)
    .where(
      and(
        eq(draws.scanId, plan.scanId),
        eq(draws.promptId, plan.promptId),
        eq(draws.engine, plan.engine),
        eq(draws.runner, plan.runner),
        eq(draws.regionId, plan.region.id),
        eq(draws.drawIndex, plan.drawIndex),
        eq(draws.attempt, attempt),
      ),
    );
  if (existing) {
    return { drawId: existing.id, status: existing.status, costUsd: existing.costUsd === null ? null : Number(existing.costUsd), refused: null, reused: true, error: existing.error, organicCount: 0 };
  }

  const adapter = opts.adapter ?? createAdapter(plan.provider);
  const drawId = crypto.randomUUID();
  const params = drawParams(plan);
  const hash = paramsHash(params);
  const req = requestFor(plan, drawId);

  if (!adapter.supports(plan.engine, plan.runner)) {
    return insertDraw(db, plan, drawId, hash, errorResult(`${plan.provider} does not support ${plan.engine} via ${plan.runner}`), null, { ledger: false });
  }
  const missing = adapter.missingConfig();
  if (missing.length) {
    return insertDraw(db, plan, drawId, hash, errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" }), null, { ledger: false });
  }

  const [hit] = await db
    .select()
    .from(providerCache)
    .where(and(eq(providerCache.provider, plan.provider), eq(providerCache.paramsHash, hash)))
    .orderBy(desc(providerCache.createdAt))
    .limit(1);
  if (hit) {
    const text = await getRawText(db, hit.rawPayloadId);
    if (text) {
      const env = JSON.parse(text) as CachedEnvelope;
      await recordCall(db, { orgId: plan.orgId, provider: plan.provider, units: 0, usd: 0, ok: true, cached: true, engine: plan.engine, paramsHash: hash, scanId: plan.scanId, promptId: plan.promptId });
      const { rawPayloadId, ...rest } = env;
      return insertDraw(db, plan, drawId, hash, { ...rest, raw: null }, rawPayloadId, { ledger: false, reused: true });
    }
  }

  const est = await estimateUsd(db, plan, adapter);
  if (est.usd === null) {
    return insertDraw(db, plan, drawId, hash, errorResult(`Refused: price unknown for ${plan.provider} ${plan.engine} (${est.note ?? "no rate"}). Add the rate to lib/capture/pricing.ts`, { status: "blocked" }), null, { ledger: false, refused: true });
  }
  const budget = await checkBudget(db, plan.orgId, plan.provider, { units: est.units, usd: est.usd, scanId: plan.scanId });
  if (!budget.allowed) {
    return insertDraw(db, plan, drawId, hash, errorResult(`Refused by cost guard: ${budget.reason}`, { status: "blocked" }), null, { ledger: false, refused: true });
  }

  let result: CaptureResult;
  try {
    result = await adapter.capture(req);
  } catch (err) {
    result = errorResult(`Adapter threw: ${err instanceof Error ? err.message : String(err)}`, { costUsd: null });
  }
  const rawPayloadId = result.raw === null || result.raw === undefined ? null : await putRaw(db, JSON.stringify(result.raw), "application/json");
  const outcome = await insertDraw(db, plan, drawId, hash, result, rawPayloadId, { ledger: true });

  if (result.status === "ok" || result.status === "empty") {
    const { raw: _raw, ...rest } = result;
    void _raw;
    const envelope: CachedEnvelope = { ...rest, rawPayloadId };
    const envId = await putRaw(db, JSON.stringify(envelope), "application/json");
    await db.insert(providerCache).values({ provider: plan.provider, engine: plan.engine, paramsHash: hash, params, rawPayloadId: envId, units: String(result.costUnits) });
  }
  return outcome;
}

async function insertDraw(
  db: Db,
  plan: DrawPlan,
  drawId: string,
  hash: string,
  result: CaptureResult,
  rawPayloadId: string | null,
  opts: { ledger: boolean; refused?: boolean; reused?: boolean },
): Promise<DrawOutcome> {
  const account = opts.ledger ? await getProviderAccount(db, plan.orgId, plan.provider) : null;
  const usd = !opts.ledger ? (result.costUsd ?? 0) : result.costUsd !== null ? result.costUsd : unitsToUsd(result.costUnits, account?.creditUnitUsd);

  await db.insert(draws).values({
    id: drawId,
    scanId: plan.scanId,
    promptId: plan.promptId,
    promptSetId: plan.promptSetId,
    engine: plan.engine,
    runner: plan.runner,
    fidelity: fidelityFor(plan.runner),
    provider: plan.provider,
    modelBuild: result.modelBuild || "unknown",
    regionId: plan.region.id,
    regionHonored: result.regionHonored,
    drawIndex: plan.drawIndex,
    status: result.status,
    answerText: result.answerText,
    rawPayloadId,
    costUnits: String(opts.ledger ? result.costUnits : 0),
    costUsd: usd === null ? null : String(usd),
    latencyMs: result.latencyMs,
    capturedAt: new Date(),
    attempt: plan.attempt ?? 1,
    error: result.error ?? null,
    experimental: plan.experimental ?? false,
    paramsHash: hash,
    searchUsed: result.searchUsed ?? null,
  });

  if (opts.ledger) {
    await recordCall(db, {
      orgId: plan.orgId,
      provider: plan.provider,
      units: result.costUnits,
      usd,
      ok: result.status === "ok" || result.status === "empty",
      engine: plan.engine,
      paramsHash: hash,
      error: result.error ?? null,
      promptId: plan.promptId,
      scanId: plan.scanId,
      drawId,
    });
    if (account?.creditsRemaining !== null && account?.creditsRemaining !== undefined) {
      await chargeUnits(db, plan.orgId, plan.provider, result.costUnits);
    }
  }

  if (result.citations.length) {
    const classify = await sourceClassifier(db, plan.orgId);
    await db.insert(citations).values(
      result.citations.map((c) => {
        const domain = (c.domain ? registrableDomain(c.domain) : null) ?? registrableDomain(c.url) ?? "unknown";
        return {
          drawId,
          url: c.url,
          canonicalUrl: null,
          domain,
          position: c.position,
          linked: c.linked,
          sourceClass: classify(domain),
          title: c.title ?? null,
          spanStart: c.spanStart ?? null,
          spanEnd: c.spanEnd ?? null,
        };
      }),
    );
  }
  const queries = [...new Set(result.fanoutQueries.map((q) => q.trim()).filter(Boolean))];
  if (queries.length) {
    await db.insert(fanoutQueries).values(queries.map((query) => ({ drawId, query, source: "provider_field" as const })));
  }
  if (result.organic?.length) {
    await db.insert(serpSnapshots).values({
      query: plan.promptText,
      promptId: plan.promptId,
      regionId: plan.region.id,
      engine: `google:${plan.provider}`,
      fetchedAt: new Date(),
      rawPayloadId,
      organic: result.organic.map((o) => ({ ...o, domain: o.domain || registrableDomain(o.url) || "" })),
    });
  }

  return {
    drawId,
    status: result.status,
    costUsd: usd,
    refused: opts.refused ? (result.error ?? "refused") : null,
    reused: Boolean(opts.reused),
    error: result.error ?? null,
    organicCount: result.organic?.length ?? 0,
  };
}

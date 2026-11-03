import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { checkBudget, recordCall } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { providerAccounts, providerCache } from "@/lib/db/pg/schema";
import { getRawText, putRaw } from "@/lib/rawstore";

/**
 * Provider accounts for Phase 2 sources. credit_unit_usd 0 means free but counted;
 * null means the price is unknown (Fireworks), so only the per run unit cap applies.
 */
export const PHASE2_PROVIDERS: Array<{ provider: string; perRunCapUnits: number; creditUnitUsd: string | null }> = [
  { provider: "pagespeed", perRunCapUnits: 100, creditUnitUsd: "0" },
  { provider: "scorecard", perRunCapUnits: 20, creditUnitUsd: "0" },
  { provider: "google_kg", perRunCapUnits: 10, creditUnitUsd: "0" },
  { provider: "crtsh", perRunCapUnits: 2, creditUnitUsd: "0" },
  { provider: "wikidata", perRunCapUnits: 20, creditUnitUsd: "0" },
  { provider: "wikipedia", perRunCapUnits: 10, creditUnitUsd: "0" },
  { provider: "urban_ipeds", perRunCapUnits: 10, creditUnitUsd: "0" },
  // Units are estimated tokens. Price per token is not recorded here: unknown until Phase 3 checks it.
  { provider: "fireworks", perRunCapUnits: 60_000, creditUnitUsd: null },
];

export async function ensurePhase2Providers(db: Db, orgId: string): Promise<void> {
  for (const p of PHASE2_PROVIDERS) {
    await db
      .insert(providerAccounts)
      .values({ orgId, provider: p.provider, perRunCapUnits: p.perRunCapUnits, creditUnitUsd: p.creditUnitUsd })
      .onConflictDoNothing();
  }
}

export function paramsHash(params: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(params)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export type ProviderCallResult =
  | { ok: true; body: string; rawPayloadId: string; cached: boolean }
  | { ok: false; error: string; refused: boolean };

/**
 * One external call: cache by full params, then the budget check, then the call, then the ledger.
 * Never retries and never throws. Secrets must not be inside `params` (they are stored).
 */
export async function providerCall(
  db: Db,
  opts: {
    orgId: string;
    provider: string;
    engine: string;
    params: Record<string, unknown>;
    units: number;
    mediaType?: string;
    refresh?: boolean;
    call: () => Promise<{ ok: boolean; body: string; error?: string | null }>;
  },
): Promise<ProviderCallResult> {
  const hash = paramsHash({ provider: opts.provider, engine: opts.engine, ...opts.params });
  if (!opts.refresh) {
    const [hit] = await db
      .select()
      .from(providerCache)
      .where(and(eq(providerCache.provider, opts.provider), eq(providerCache.paramsHash, hash)))
      .orderBy(desc(providerCache.createdAt))
      .limit(1);
    if (hit) {
      const body = await getRawText(db, hit.rawPayloadId);
      if (body !== null) {
        await recordCall(db, {
          orgId: opts.orgId,
          provider: opts.provider,
          units: 0,
          ok: true,
          cached: true,
          engine: opts.engine,
          paramsHash: hash,
        });
        return { ok: true, body, rawPayloadId: hit.rawPayloadId, cached: true };
      }
    }
  }
  const budget = await checkBudget(db, opts.orgId, opts.provider, { units: opts.units });
  if (!budget.allowed) return { ok: false, error: budget.reason ?? "refused by cost guard", refused: true };

  let res: { ok: boolean; body: string; error?: string | null };
  try {
    res = await opts.call();
  } catch (err) {
    res = { ok: false, body: "", error: err instanceof Error ? err.message : String(err) };
  }
  await recordCall(db, {
    orgId: opts.orgId,
    provider: opts.provider,
    units: opts.units,
    ok: res.ok,
    engine: opts.engine,
    paramsHash: hash,
    error: res.ok ? null : (res.error ?? "error"),
  });
  if (!res.ok) return { ok: false, error: res.error ?? "error", refused: false };
  const rawPayloadId = await putRaw(db, res.body, opts.mediaType ?? "application/json");
  await db.insert(providerCache).values({
    provider: opts.provider,
    engine: opts.engine,
    paramsHash: hash,
    params: opts.params,
    rawPayloadId,
    units: String(opts.units),
  });
  return { ok: true, body: res.body, rawPayloadId, cached: false };
}

import { and, eq, inArray } from "drizzle-orm";
import { checkBudget, recordCall } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { draws, fanoutQueries, serpSnapshots } from "@/lib/db/pg/schema";
import { putRaw } from "@/lib/rawstore";
import { fetchOrganic } from "./adapters/dataforseo";
import type { AdapterDeps } from "./adapters/common";
import { DATAFORSEO, roundUsd } from "./pricing";
import { loadRegion } from "./regions";

export const FANOUT_ENGINE = "google:dataforseo:fanout";

export type FanoutPlan = { scanId: string; items: Array<{ query: string; regionId: string; promptId: string }>; usd: number; skippedExisting: number };

/** New fan out queries of a scan (not yet snapshotted for that region) and what fetching them costs. */
export async function planFanout(db: Db, scanId: string, limit = 100): Promise<FanoutPlan> {
  const rows = await db
    .select({ query: fanoutQueries.query, regionId: draws.regionId, promptId: draws.promptId })
    .from(fanoutQueries)
    .innerJoin(draws, eq(draws.id, fanoutQueries.drawId))
    .where(eq(draws.scanId, scanId));
  const seen = new Map<string, { query: string; regionId: string; promptId: string }>();
  for (const r of rows) {
    const k = `${r.query.toLowerCase()}|${r.regionId}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const queries = [...new Set([...seen.values()].map((v) => v.query))];
  const existing = queries.length
    ? await db.select({ query: serpSnapshots.query, regionId: serpSnapshots.regionId }).from(serpSnapshots).where(and(eq(serpSnapshots.engine, FANOUT_ENGINE), inArray(serpSnapshots.query, queries)))
    : [];
  const have = new Set(existing.map((e) => `${e.query.toLowerCase()}|${e.regionId}`));
  const fresh = [...seen.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  const items = fresh.slice(0, limit);
  return { scanId, items, usd: roundUsd(items.length * DATAFORSEO.organic.live), skippedExisting: seen.size - fresh.length };
}

/** Fetches organic results for the planned fan out queries after the cost was shown and approved. */
export async function runFanout(db: Db, plan: FanoutPlan, opts: { orgId: string; approvedUsd: number; deps?: AdapterDeps }) {
  if (plan.usd !== opts.approvedUsd) throw new Error("Fan out cost changed since it was shown; plan again");
  const budget = await checkBudget(db, opts.orgId, "dataforseo", { units: plan.items.length, usd: plan.usd, scanId: plan.scanId });
  if (!budget.allowed) throw new Error(`Refused by cost guard: ${budget.reason}`);
  const out = { fetched: 0, failed: 0, usd: 0 };
  for (const item of plan.items) {
    const region = await loadRegion(db, item.regionId);
    if (!region) continue;
    const res = await fetchOrganic(opts.deps ?? {}, item.query, region);
    await recordCall(db, { orgId: opts.orgId, provider: "dataforseo", units: 1, usd: res.costUsd, ok: res.ok, engine: "fanout_organic", scanId: plan.scanId, promptId: item.promptId, error: res.error });
    out.usd = roundUsd(out.usd + (res.costUsd ?? 0));
    if (!res.ok) {
      out.failed++;
      continue;
    }
    const rawPayloadId = await putRaw(db, JSON.stringify(res.raw), "application/json");
    await db.insert(serpSnapshots).values({ query: item.query, promptId: item.promptId, regionId: item.regionId, engine: FANOUT_ENGINE, fetchedAt: new Date(), rawPayloadId, organic: res.rows });
    out.fetched++;
  }
  return out;
}

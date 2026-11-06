import { and, eq, inArray } from "drizzle-orm";
import { checkBudget } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { draws, prompts, promptSetItems, scans } from "@/lib/db/pg/schema";
import { ensureCaptureProviders } from "./accounts";
import { runCanaries, type CanaryResult } from "./canary";
import { parityStatus } from "./adapters/localSerp";
import { roundUsd } from "./pricing";
import { loadRegion } from "./regions";
import { createAdapter, type ProviderId, type Route } from "./registry";
import { captureDraw, estimateUsd, type DrawOutcome, type DrawPlan } from "./run";
import { fidelityFor, type ProviderAdapter, type Region } from "./types";

export type ScanKind = "scan" | "capture_test" | "dry_run" | "calibration" | "canary";

export type ScanSpec = {
  promptIds: string[];
  routes: Route[];
  regionIds: string[];
  draws: number;
  canary: boolean;
};

export type EstimateCell = {
  engine: string;
  runner: string;
  provider: string;
  fidelity: string;
  draws: number;
  usdEach: number | null;
  usd: number | null;
  note: string | null;
  missingConfig: string[];
  experimental: boolean;
};

export type ScanEstimate = {
  spec: ScanSpec;
  cells: EstimateCell[];
  canaryDraws: number;
  totalDraws: number;
  totalUsd: number | null;
  refusals: string[];
  estimatedAt: string;
  approvedVia?: string;
};

type Adapters = Partial<Record<ProviderId, ProviderAdapter>>;

function adapterFor(id: ProviderId, adapters?: Adapters): ProviderAdapter {
  return adapters?.[id] ?? createAdapter(id);
}

async function promptTexts(db: Db, promptIds: string[], promptSetId: string | null): Promise<Map<string, string>> {
  if (!promptIds.length) return new Map();
  if (promptSetId) {
    const rows = await db
      .select({ id: promptSetItems.promptId, text: promptSetItems.promptTextSnapshot })
      .from(promptSetItems)
      .where(and(eq(promptSetItems.promptSetId, promptSetId), inArray(promptSetItems.promptId, promptIds)));
    return new Map(rows.map((r) => [r.id, r.text]));
  }
  const rows = await db.select({ id: prompts.id, text: prompts.text }).from(prompts).where(inArray(prompts.id, promptIds));
  return new Map(rows.map((r) => [r.id, r.text]));
}

/** Local SERP draws are experimental until its parity report passes and is fresh. */
function experimentalFor(route: Route): boolean {
  if (route.provider !== "local_serp") return false;
  const p = parityStatus();
  return !(p.passed && p.fresh);
}

/** Creates the scan with its estimate. Nothing is called until the estimate is approved. */
export async function planScan(
  db: Db,
  opts: {
    orgId: string;
    campaignId: string;
    promptSetId?: string | null;
    kind: ScanKind;
    name: string;
    spec: ScanSpec;
    adapters?: Adapters;
    /** Set by schedule.tick: the schedule and the period (YYYY-MM or YYYY-Www) this scan covers. */
    scheduleId?: string | null;
    periodKey?: string | null;
  },
): Promise<{ scanId: string; estimate: ScanEstimate }> {
  await ensureCaptureProviders(db, opts.orgId);
  const { spec } = opts;
  const texts = await promptTexts(db, spec.promptIds, opts.promptSetId ?? null);
  const missingPrompts = spec.promptIds.filter((id) => !texts.has(id));
  const refusals: string[] = missingPrompts.length ? [`${missingPrompts.length} prompt(s) not found${opts.promptSetId ? " in the prompt set" : ""}`] : [];
  const region = spec.regionIds.length ? await loadRegion(db, spec.regionIds[0]) : null;
  if (!region) refusals.push("No region selected");

  const cells: EstimateCell[] = [];
  const perProvider = new Map<string, { units: number; usd: number }>();
  const n = spec.promptIds.length * spec.regionIds.length * spec.draws;
  for (const route of spec.routes) {
    const adapter = adapterFor(route.provider, opts.adapters);
    if (!adapter.supports(route.engine, route.runner)) {
      refusals.push(`${route.provider} does not support ${route.engine} via ${route.runner}`);
      continue;
    }
    const missing = adapter.missingConfig();
    const est = region
      ? await estimateUsd(db, { orgId: opts.orgId, scanId: "estimate", promptId: "", promptSetId: null, promptText: "", engine: route.engine, runner: route.runner, provider: route.provider, region, drawIndex: 1 }, adapter)
      : { units: 1, usd: null };
    const draws = n + (spec.canary ? 1 : 0);
    const cell: EstimateCell = {
      engine: route.engine,
      runner: route.runner,
      provider: route.provider,
      fidelity: fidelityFor(route.runner),
      draws,
      usdEach: est.usd,
      usd: est.usd === null ? null : roundUsd(est.usd * draws),
      note: "note" in est ? (est.note ?? null) : null,
      missingConfig: missing,
      experimental: experimentalFor(route),
    };
    cells.push(cell);
    if (missing.length) refusals.push(`${route.provider} is missing ${missing.join(", ")}`);
    if (est.usd === null) refusals.push(`Price unknown for ${route.provider} ${route.engine}; refusing rather than guessing`);
    const agg = perProvider.get(route.provider) ?? { units: 0, usd: 0 };
    agg.units += est.units * draws;
    agg.usd += (est.usd ?? 0) * draws;
    perProvider.set(route.provider, agg);
  }
  for (const [provider, agg] of perProvider) {
    const check = await checkBudget(db, opts.orgId, provider, { units: agg.units, usd: agg.usd });
    if (!check.allowed) refusals.push(`${provider}: ${check.reason}`);
  }
  const totalUsd = cells.some((c) => c.usd === null) ? null : roundUsd(cells.reduce((s, c) => s + (c.usd ?? 0), 0));
  const estimate: ScanEstimate = {
    spec,
    cells,
    canaryDraws: spec.canary ? cells.length : 0,
    totalDraws: cells.reduce((s, c) => s + c.draws, 0),
    totalUsd,
    refusals: [...new Set(refusals)],
    estimatedAt: new Date().toISOString(),
  };
  const [scan] = await db
    .insert(scans)
    .values({
      campaignId: opts.campaignId,
      promptSetId: opts.promptSetId ?? null,
      name: opts.name,
      kind: opts.kind,
      status: "awaiting_approval",
      estimate,
      scheduleId: opts.scheduleId ?? null,
      periodKey: opts.periodKey ?? null,
    })
    .returning({ id: scans.id });
  return { scanId: scan.id, estimate };
}

/**
 * Moves an estimate with no refusals from awaiting_approval to running. The status check and the update are one
 * statement, so two approvals of the same scan (a click and a schedule tick) cannot both start it.
 */
export async function approveScan(db: Db, scanId: string, approver: { userId: string | null; via: string }): Promise<{ ok: boolean; reason: string | null }> {
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan) return { ok: false, reason: "Scan not found" };
  if (scan.status !== "awaiting_approval") return { ok: false, reason: `Scan is ${scan.status}, not awaiting approval` };
  const est = scan.estimate as ScanEstimate | null;
  if (!est) return { ok: false, reason: "Scan has no estimate" };
  if (est.refusals.length) return { ok: false, reason: `Estimate has refusals: ${est.refusals.join("; ")}` };
  const updated = await db
    .update(scans)
    .set({ status: "running", approvedAt: new Date(), approvedBy: approver.userId, estimate: { ...est, approvedVia: approver.via } })
    .where(and(eq(scans.id, scanId), eq(scans.status, "awaiting_approval")))
    .returning({ id: scans.id });
  if (!updated.length) return { ok: false, reason: "Scan was approved or changed by someone else; not approved again" };
  return { ok: true, reason: null };
}

export type RunSummary = {
  scanId: string;
  canaries: CanaryResult[];
  outcomes: Array<DrawOutcome & { engine: string; runner: string; provider: string; promptId: string; drawIndex: number }>;
  byCell: Array<{ engine: string; runner: string; provider: string; fidelity: string; ok: number; empty: number; error: number; blocked: number; costUsd: number; estimateUsd: number | null }>;
  actualUsd: number;
  estimateUsd: number | null;
  status: "complete" | "partial" | "failed";
};

/** Runs at most `limit` tasks at once. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Runs an approved scan: canaries first (a failed canary refuses that route), then every draw with a
 * per provider concurrency limit. Providers run in parallel with each other. No retries.
 */
export async function runScan(
  db: Db,
  scanId: string,
  opts: { orgId: string; adapters?: Adapters; concurrencyPerProvider?: number; log?: (m: string) => void },
): Promise<RunSummary> {
  const log = opts.log ?? (() => {});
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan) throw new Error("Scan not found");
  if (!scan.approvedAt) throw new Error("Scan is not approved");
  // Resume is allowed while running (worker redelivery). Finished scans must not re-enter the paid path.
  if (scan.status !== "running") throw new Error(`Scan is ${scan.status}, not running`);
  const est = scan.estimate as ScanEstimate;
  const { spec } = est;
  const texts = await promptTexts(db, spec.promptIds, scan.promptSetId);
  const regions = (await Promise.all(spec.regionIds.map((id) => loadRegion(db, id)))).filter((r): r is Region => r !== null);

  let routes = spec.routes;
  let canaries: CanaryResult[] = [];
  if (spec.canary && regions[0]) {
    canaries = await runCanaries(db, { orgId: opts.orgId, campaignId: scan.campaignId, forScanId: scanId, routes, region: regions[0], adapters: opts.adapters });
    const failed = new Set(canaries.filter((c) => !c.ok).map((c) => `${c.route.engine}|${c.route.runner}|${c.route.provider}`));
    for (const c of canaries) log(`[canary] ${c.route.engine} ${c.route.runner} ${c.route.provider}: ${c.ok ? "ok" : `FAILED ${c.reason}`}`);
    routes = routes.filter((r) => !failed.has(`${r.engine}|${r.runner}|${r.provider}`));
  }

  const plansByProvider = new Map<ProviderId, DrawPlan[]>();
  for (const route of routes) {
    const experimental = experimentalFor(route);
    for (const promptId of spec.promptIds) {
      const promptText = texts.get(promptId);
      if (!promptText) continue;
      for (const region of regions) {
        for (let d = 1; d <= spec.draws; d++) {
          const list = plansByProvider.get(route.provider) ?? [];
          list.push({ orgId: opts.orgId, scanId, promptId, promptSetId: scan.promptSetId, promptText, engine: route.engine, runner: route.runner, provider: route.provider, region, drawIndex: d, experimental });
          plansByProvider.set(route.provider, list);
        }
      }
    }
  }

  const outcomes: RunSummary["outcomes"] = [];
  await Promise.all(
    [...plansByProvider.entries()].map(([provider, plans]) =>
      pool(plans, opts.concurrencyPerProvider ?? 2, async (plan) => {
        let outcome: DrawOutcome;
        try {
          outcome = await captureDraw(db, plan, { adapter: opts.adapters?.[provider] });
        } catch (err) {
          // Database failures only; provider failures are already error draws.
          log(`[scan] draw failed to record: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        outcomes.push({ ...outcome, engine: plan.engine, runner: plan.runner, provider: plan.provider, promptId: plan.promptId, drawIndex: plan.drawIndex });
        log(`[scan] ${plan.engine} ${plan.runner} p=${plan.promptId.slice(0, 8)} d=${plan.drawIndex}: ${outcome.status}${outcome.error ? ` (${outcome.error})` : ""}`);
      }),
    ),
  );

  const byCell = new Map<string, RunSummary["byCell"][number]>();
  for (const c of est.cells) {
    byCell.set(`${c.engine}|${c.runner}|${c.provider}`, { engine: c.engine, runner: c.runner, provider: c.provider, fidelity: c.fidelity, ok: 0, empty: 0, error: 0, blocked: 0, costUsd: 0, estimateUsd: c.usd });
  }
  const canaryCost = await canaryCosts(db, canaries);
  for (const o of outcomes) {
    const cell = byCell.get(`${o.engine}|${o.runner}|${o.provider}`);
    if (!cell) continue;
    cell[o.status]++;
    cell.costUsd = roundUsd(cell.costUsd + (o.costUsd ?? 0));
  }
  for (const [key, usd] of canaryCost) {
    const cell = byCell.get(key);
    if (cell) cell.costUsd = roundUsd(cell.costUsd + usd);
  }
  const actualUsd = roundUsd([...byCell.values()].reduce((s, c) => s + c.costUsd, 0));
  const okCount = outcomes.filter((o) => o.status === "ok" || o.status === "empty").length;
  const status = outcomes.length && okCount === outcomes.length && canaries.every((c) => c.ok) ? "complete" : okCount === 0 ? "failed" : "partial";
  await db.update(scans).set({ status }).where(eq(scans.id, scanId));
  return { scanId, canaries, outcomes, byCell: [...byCell.values()], actualUsd, estimateUsd: est.totalUsd, status };
}

async function canaryCosts(db: Db, canaries: CanaryResult[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = canaries.map((c) => c.drawId).filter((x): x is string => Boolean(x));
  if (!ids.length) return out;
  const rows = await db.select({ id: draws.id, costUsd: draws.costUsd }).from(draws).where(inArray(draws.id, ids));
  const byId = new Map(rows.map((r) => [r.id, Number(r.costUsd ?? 0)]));
  for (const c of canaries) {
    const key = `${c.route.engine}|${c.route.runner}|${c.route.provider}`;
    out.set(key, (out.get(key) ?? 0) + (c.drawId ? (byId.get(c.drawId) ?? 0) : 0));
  }
  return out;
}

export type RetryPlan = { scanId: string; draws: Array<{ drawId: string; engine: string; runner: string; provider: string; promptId: string; drawIndex: number; nextAttempt: number }>; usd: number | null; refusals: string[] };

/** Failed draws (latest attempt is error or blocked) and what retrying them would cost. Nothing is called. */
export async function planRetry(db: Db, scanId: string, orgId: string, adapters?: Adapters): Promise<RetryPlan> {
  const rows = await db.select().from(draws).where(eq(draws.scanId, scanId));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.promptId}|${r.engine}|${r.runner}|${r.regionId}|${r.drawIndex}`;
    const cur = latest.get(k);
    if (!cur || r.attempt > cur.attempt) latest.set(k, r);
  }
  const failed = [...latest.values()].filter((r) => r.status === "error" || r.status === "blocked");
  let usd: number | null = 0;
  const refusals: string[] = [];
  const perProvider = new Map<string, number>();
  for (const r of failed) {
    const region = await loadRegion(db, r.regionId);
    const adapter = adapterFor(r.provider as ProviderId, adapters);
    if (!region) continue;
    const est = await estimateUsd(db, { orgId, scanId, promptId: r.promptId, promptSetId: r.promptSetId, promptText: "", engine: r.engine, runner: r.runner, provider: r.provider as ProviderId, region, drawIndex: r.drawIndex }, adapter);
    if (est.usd === null || usd === null) usd = null;
    else usd += est.usd;
    perProvider.set(r.provider, (perProvider.get(r.provider) ?? 0) + (est.usd ?? 0));
    const missing = adapter.missingConfig();
    if (missing.length) refusals.push(`${r.provider} is missing ${missing.join(", ")}`);
  }
  for (const [provider, total] of perProvider) {
    const check = await checkBudget(db, orgId, provider, { units: 1, usd: total, scanId });
    if (!check.allowed) refusals.push(`${provider}: ${check.reason}`);
  }
  return {
    scanId,
    draws: failed.map((r) => ({ drawId: r.id, engine: r.engine, runner: r.runner, provider: r.provider, promptId: r.promptId, drawIndex: r.drawIndex, nextAttempt: r.attempt + 1 })),
    usd: usd === null ? null : roundUsd(usd),
    refusals: [...new Set(refusals)],
  };
}

/** Retries the failed draws as new attempts after the cost was shown and approved. The failed rows stay. */
export async function runRetry(db: Db, plan: RetryPlan, opts: { orgId: string; approvedUsd: number | null; adapters?: Adapters }): Promise<DrawOutcome[]> {
  if (plan.refusals.length) throw new Error(`Retry refused: ${plan.refusals.join("; ")}`);
  if (plan.usd !== opts.approvedUsd) throw new Error("Retry cost changed since it was shown; plan again");
  const [scan] = await db.select().from(scans).where(eq(scans.id, plan.scanId));
  const failedRows = plan.draws.length ? await db.select().from(draws).where(inArray(draws.id, plan.draws.map((d) => d.drawId))) : [];
  const texts = await promptTexts(db, [...new Set(failedRows.map((r) => r.promptId))], scan.promptSetId);
  const out: DrawOutcome[] = [];
  for (const r of failedRows) {
    const region = await loadRegion(db, r.regionId);
    const text = texts.get(r.promptId);
    if (!region || !text) continue;
    out.push(
      await captureDraw(
        db,
        { orgId: opts.orgId, scanId: plan.scanId, promptId: r.promptId, promptSetId: r.promptSetId, promptText: text, engine: r.engine, runner: r.runner, provider: r.provider as ProviderId, region, drawIndex: r.drawIndex, attempt: r.attempt + 1, experimental: r.experimental },
        { adapter: opts.adapters?.[r.provider as ProviderId] },
      ),
    );
  }
  return out;
}

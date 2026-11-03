import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, canaryRuns, citations, costLedger, draws, fanoutQueries, prompts, promptSetItems, promptSets, providerAccounts, scans } from "@/lib/db/pg/schema";
import { getRawText } from "@/lib/rawstore";
import { loadAliases } from "@/lib/judge/aliases";
import { judgeDraw } from "@/lib/judge/v2";
import { ensureCaptureProviders } from "./accounts";
import { parityStatus } from "./adapters/localSerp";
import { CANARY_TAG } from "./canary";
import { CHARLOTTE_REGION, ensureNamedRegion, listRegions, loadRegion } from "./regions";
import { allRoutes, createAdapter, PROVIDER_IDS, ROUTES, type ProviderId, type Route } from "./registry";
import { captureDraw, estimateUsd, type DrawPlan } from "./run";
import { fidelityFor, type Engine, type Runner } from "./types";

export class CaptureInputError extends Error {}

/** Maps input errors to 400; anything else falls through to withRole's 500. */
export async function captureErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CaptureInputError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CaptureInputError("Expected a JSON object body.");
  return body as Record<string, unknown>;
}

export async function providerStatus(db: Db, orgId: string) {
  await ensureCaptureProviders(db, orgId);
  const accounts = await db.select().from(providerAccounts).where(and(eq(providerAccounts.orgId, orgId), inArray(providerAccounts.provider, [...PROVIDER_IDS])));
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const spend = await db
    .select({ provider: costLedger.provider, usd: sql<string>`coalesce(sum(${costLedger.usd}), 0)`, calls: sql<number>`count(*)::int`, unknownUsd: sql<number>`count(*) filter (where ${costLedger.usd} is null)::int` })
    .from(costLedger)
    .where(and(eq(costLedger.orgId, orgId), gte(costLedger.at, monthStart)))
    .groupBy(costLedger.provider);
  const canaries = await db.select().from(canaryRuns).where(eq(canaryRuns.orgId, orgId)).orderBy(desc(canaryRuns.at)).limit(200);
  const routes = allRoutes();
  const parity = parityStatus();
  return PROVIDER_IDS.map((id) => {
    const adapter = createAdapter(id);
    const acct = accounts.find((a) => a.provider === id);
    const s = spend.find((x) => x.provider === id);
    const myRoutes = routes.filter((r) => r.provider === id);
    return {
      provider: id,
      missing_config: adapter.missingConfig(),
      routes: myRoutes.map((r) => ({
        engine: r.engine,
        runner: r.runner,
        fidelity: fidelityFor(r.runner),
        role: roleOf(r),
        last_canary: canaries.find((c) => c.engine === r.engine && c.runner === r.runner && c.provider === id) ?? null,
      })),
      account: acct
        ? {
            monthly_budget_usd: acct.monthlyBudgetUsd,
            per_scan_cap_usd: acct.perScanCapUsd,
            spent_usd_month_counter: acct.spentUsdMonth,
            credits_remaining: acct.creditsRemaining,
            per_run_cap_units: acct.perRunCapUnits,
            credit_unit_usd: acct.creditUnitUsd,
          }
        : null,
      ledger_month: { usd: Number(s?.usd ?? 0), calls: s?.calls ?? 0, calls_with_unknown_usd: s?.unknownUsd ?? 0, since: monthStart.toISOString() },
      parity: id === "local_serp" ? parity : null,
    };
  });
}

function roleOf(r: Route): string {
  const e = ROUTES[r.engine];
  const same = (x: Route | null) => x && x.runner === r.runner && x.provider === r.provider;
  if (same(e.primary)) return "primary";
  if (same(e.fallback)) return "fallback";
  if (same(e.parametric)) return "parametric";
  return "parity";
}

const EDITABLE = { monthly_budget_usd: "monthlyBudgetUsd", per_scan_cap_usd: "perScanCapUsd", credit_unit_usd: "creditUnitUsd", per_run_cap_units: "perRunCapUnits" } as const;

export async function updateProviderLimits(db: Db, orgId: string, body: Record<string, unknown>) {
  const provider = String(body.provider ?? "");
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) throw new CaptureInputError("Unknown provider");
  const set: Record<string, string | number | null> = {};
  for (const [k, col] of Object.entries(EDITABLE)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === null || v === "") {
      set[col] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new CaptureInputError(`${k} must be a non negative number or empty`);
    set[col] = col === "perRunCapUnits" ? Math.floor(n) : String(n);
  }
  if (!Object.keys(set).length) throw new CaptureInputError("Nothing to update");
  await ensureCaptureProviders(db, orgId);
  const [row] = await db
    .update(providerAccounts)
    .set(set)
    .where(and(eq(providerAccounts.orgId, orgId), eq(providerAccounts.provider, provider)))
    .returning();
  return row;
}

export async function campaignFor(db: Db, orgId: string, campaignId?: string | null) {
  const rows = await db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(asc(campaigns.createdAt));
  const c = campaignId ? rows.find((r) => r.id === campaignId) : rows[0];
  if (!c) throw new CaptureInputError("No campaign found");
  return c;
}

export async function captureTestOptions(db: Db, orgId: string, campaignId?: string | null) {
  const campaign = await campaignFor(db, orgId, campaignId);
  await ensureNamedRegion(db, CHARLOTTE_REGION);
  const promptRows = await db
    .select({ id: prompts.id, seq: prompts.seq, text: prompts.text, status: prompts.status })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaign.id), sql`not (${CANARY_TAG} = any(${prompts.tags}))`))
    .orderBy(asc(prompts.seq));
  const recent = await db
    .select({ id: draws.id, engine: draws.engine, runner: draws.runner, provider: draws.provider, status: draws.status, capturedAt: draws.capturedAt, costUsd: draws.costUsd })
    .from(draws)
    .innerJoin(scans, eq(scans.id, draws.scanId))
    .where(and(eq(scans.campaignId, campaign.id), eq(scans.kind, "capture_test")))
    .orderBy(desc(draws.capturedAt))
    .limit(20);
  return {
    campaign: { id: campaign.id, name: campaign.name },
    prompts: promptRows,
    regions: await listRegions(db),
    routes: allRoutes().map((r) => ({ ...r, fidelity: fidelityFor(r.runner), role: roleOf(r) })),
    recent,
  };
}

function parseRoute(body: Record<string, unknown>): Route {
  const engine = String(body.engine ?? "") as Engine;
  const runner = String(body.runner ?? "") as Runner;
  const provider = String(body.provider ?? "") as ProviderId;
  const route = allRoutes().find((r) => r.engine === engine && r.runner === runner && r.provider === provider);
  if (!route) throw new CaptureInputError("That engine, runner and provider combination is not approved");
  return route;
}

/**
 * One test draw. First call (no approved_usd) returns the estimate; the second call must send that exact
 * amount back, so a person always sees the price before a paid call.
 */
export async function runCaptureTest(db: Db, user: { orgId: string; userId: string }, body: Record<string, unknown>) {
  await ensureCaptureProviders(db, user.orgId);
  const route = parseRoute(body);
  const campaign = await campaignFor(db, user.orgId, body.campaign_id ? String(body.campaign_id) : null);
  const [prompt] = await db.select().from(prompts).where(and(eq(prompts.id, String(body.prompt_id ?? "")), eq(prompts.campaignId, campaign.id)));
  if (!prompt) throw new CaptureInputError("Pick a prompt from this campaign");
  const region = await loadRegion(db, String(body.region_id ?? ""));
  if (!region) throw new CaptureInputError("Pick a region");
  const adapter = createAdapter(route.provider);
  const experimental = route.provider === "local_serp" && !(parityStatus().passed && parityStatus().fresh);
  const plan: Omit<DrawPlan, "scanId"> = {
    orgId: user.orgId,
    promptId: prompt.id,
    promptSetId: null,
    promptText: prompt.text,
    engine: route.engine,
    runner: route.runner,
    provider: route.provider,
    region,
    drawIndex: 1,
    experimental,
  };
  const est = await estimateUsd(db, { ...plan, scanId: "estimate" }, adapter);
  const estimate = { usd: est.usd, units: est.units, note: est.note ?? null, missing_config: adapter.missingConfig(), fidelity: fidelityFor(route.runner), experimental };
  if (body.approved_usd === undefined || body.approved_usd === null) return { estimate, draw: null };
  if (Number(body.approved_usd) !== est.usd) throw new CaptureInputError("The estimate changed; review it again before running");

  const [scan] = await db
    .insert(scans)
    .values({ campaignId: campaign.id, name: `Capture test ${route.engine} ${route.runner}`, kind: "capture_test", status: "running", estimate, approvedAt: new Date(), approvedBy: user.userId })
    .returning({ id: scans.id });
  const outcome = await captureDraw(db, { ...plan, scanId: scan.id }, { adapter });
  await db.update(scans).set({ status: outcome.status === "ok" || outcome.status === "empty" ? "complete" : "failed" }).where(eq(scans.id, scan.id));
  return { estimate, draw: await drawDetail(db, outcome.drawId, user.orgId) };
}

export async function drawDetail(db: Db, drawId: string, orgId: string) {
  const [row] = await db
    .select({ d: draws })
    .from(draws)
    .innerJoin(scans, eq(scans.id, draws.scanId))
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(eq(draws.id, drawId), eq(campaigns.orgId, orgId)));
  const d = row?.d;
  if (!d) return null;
  const raw = d.rawPayloadId ? await getRawText(db, d.rawPayloadId) : null;
  return {
    ...d,
    raw_payload: raw && raw.length > 300_000 ? `${raw.slice(0, 300_000)}\n… truncated for display; full payload ${d.rawPayloadId}` : raw,
    citations: await db.select().from(citations).where(eq(citations.drawId, drawId)).orderBy(asc(citations.position)),
    fanout_queries: (await db.select().from(fanoutQueries).where(eq(fanoutQueries.drawId, drawId))).map((f) => f.query),
  };
}

export async function scanView(db: Db, orgId: string, scanId: string) {
  const [scan] = await db.select().from(scans).innerJoin(campaigns, eq(campaigns.id, scans.campaignId)).where(and(eq(scans.id, scanId), eq(campaigns.orgId, orgId)));
  if (!scan) return null;
  const cells = await db
    .select({ engine: draws.engine, runner: draws.runner, provider: draws.provider, fidelity: draws.fidelity, status: draws.status, n: sql<number>`count(*)::int`, usd: sql<string>`coalesce(sum(${draws.costUsd}), 0)` })
    .from(draws)
    .where(eq(draws.scanId, scanId))
    .groupBy(draws.engine, draws.runner, draws.provider, draws.fidelity, draws.status);
  const canaries = await db.select().from(canaryRuns).where(eq(canaryRuns.scanId, scanId));
  return { scan: scan.scans, cells, canaries };
}

/**
 * Batch estimate input. Routes default to each engine's primary route; prompts default to every item of
 * the frozen prompt set; region defaults to Charlotte; 3 draws; canaries on.
 */
export async function batchSpec(db: Db, orgId: string, body: Record<string, unknown>) {
  const campaign = await campaignFor(db, orgId, body.campaign_id ? String(body.campaign_id) : null);
  const promptSetId = body.prompt_set_id ? String(body.prompt_set_id) : null;
  if (promptSetId) {
    const [set] = await db.select().from(promptSets).where(and(eq(promptSets.id, promptSetId), eq(promptSets.campaignId, campaign.id)));
    if (!set) throw new CaptureInputError("Prompt set not found in this campaign");
    if (!set.frozenAt) throw new CaptureInputError("Freeze the prompt set before a scan");
  }
  let promptIds = Array.isArray(body.prompt_ids) ? body.prompt_ids.map(String) : [];
  if (!promptIds.length && promptSetId) {
    promptIds = (await db.select({ id: promptSetItems.promptId }).from(promptSetItems).where(eq(promptSetItems.promptSetId, promptSetId))).map((r) => r.id);
  }
  if (!promptIds.length) throw new CaptureInputError("Choose prompts or a frozen prompt set");
  const owned = await db.select({ id: prompts.id }).from(prompts).where(and(eq(prompts.campaignId, campaign.id), inArray(prompts.id, promptIds)));
  if (owned.length !== new Set(promptIds).size) throw new CaptureInputError("Some prompts are not in this campaign");

  const approved = allRoutes();
  let routes: Route[];
  if (Array.isArray(body.routes) && body.routes.length) {
    routes = body.routes.map((r) => {
      const x = r as Record<string, unknown>;
      const found = approved.find((a) => a.engine === x.engine && a.runner === x.runner && a.provider === x.provider);
      if (!found) throw new CaptureInputError(`Route ${String(x.engine)} ${String(x.runner)} ${String(x.provider)} is not approved`);
      return found;
    });
  } else {
    const engines = (Array.isArray(body.engines) && body.engines.length ? body.engines.map(String) : Object.keys(ROUTES)) as Engine[];
    routes = engines.map((e) => {
      if (!ROUTES[e]) throw new CaptureInputError(`Unknown engine ${e}`);
      return ROUTES[e].primary;
    });
  }
  const regionIds = Array.isArray(body.region_ids) && body.region_ids.length ? body.region_ids.map(String) : [(await ensureNamedRegion(db, CHARLOTTE_REGION)).id];
  const drawsN = body.draws === undefined ? 3 : Number(body.draws);
  if (!Number.isInteger(drawsN) || drawsN < 1 || drawsN > 10) throw new CaptureInputError("draws must be 1 to 10");
  const kind = body.kind === "dry_run" ? "dry_run" : "scan";
  return {
    campaignId: campaign.id,
    promptSetId,
    kind: kind as "scan" | "dry_run",
    name: String(body.name ?? `${kind === "dry_run" ? "Dry run" : "Scan"} ${new Date().toISOString().slice(0, 10)}`),
    spec: { promptIds, routes, regionIds, draws: drawsN, canary: body.canary !== false },
  };
}

export async function scanOwned(db: Db, orgId: string, scanId: string) {
  const [row] = await db.select({ id: scans.id }).from(scans).innerJoin(campaigns, eq(campaigns.id, scans.campaignId)).where(and(eq(scans.id, scanId), eq(campaigns.orgId, orgId)));
  if (!row) throw new CaptureInputError("Scan not found");
  return row.id;
}

/** Judges every ok draw of a scan with judge v2. Failures are recorded per draw, never thrown. */
export async function judgeScan(db: Db, orgId: string, scanId: string, log: (m: string) => void = () => {}) {
  const [row] = await db.select({ brandId: campaigns.brandId }).from(scans).innerJoin(campaigns, eq(campaigns.id, scans.campaignId)).where(eq(scans.id, scanId));
  if (!row) return { judged: 0, failed: 0 };
  const aliases = await loadAliases(db, orgId, row.brandId);
  const ids = await db.select({ id: draws.id }).from(draws).where(and(eq(draws.scanId, scanId), eq(draws.status, "ok")));
  let judged = 0;
  let failed = 0;
  for (const { id } of ids) {
    try {
      const r = await judgeDraw(db, id, { orgId, aliases });
      if (r.ok) judged++;
      else failed++;
      if (r.error) log(`[judge] ${id}: ${r.error}`);
    } catch (err) {
      failed++;
      log(`[judge] ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { judged, failed };
}

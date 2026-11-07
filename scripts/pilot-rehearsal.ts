/**
 * Wave 5 fixture-only pilot rehearsal on Demo University (no paid API calls).
 *
 * Usage:
 *   npm run pilot:rehearse
 *   npm run pilot:rehearse -- --fault=errors25
 *   npm run pilot:rehearse -- --fault=cost30
 *   npm run pilot:rehearse -- --fault=kill-mid
 *   npm run pilot:rehearse -- --fault=sleep
 *   npm run pilot:rehearse -- --fresh-demo
 *   npm run pilot:rehearse -- --test-db   # allow DATABASE_URL === TEST_DATABASE_URL
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { approveScan, planScan, runScan } from "@/lib/capture/batch";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { providerAccounts } from "@/lib/db/pg/schema";
import { ROUTES, type ProviderId } from "@/lib/capture/registry";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { captureDraw, type DrawPlan } from "@/lib/capture/run";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";

const DEMO_ORG_SLUG = "demo-university-leadership";
import type { Db } from "@/lib/db/pg/client";
import { closeDb, getDb } from "@/lib/db/pg/client";
import {
  alerts,
  brands,
  campaigns,
  claims,
  draws,
  judgeRuns,
  mentions,
  organizations,
  promptSetItems,
  prompts,
  scans,
  schedules,
} from "@/lib/db/pg/schema";
import type { Engine } from "@/lib/capture/types";
import { freezePromptSet } from "@/lib/promptSets";
import { rollupScan } from "@/lib/metrics/rollup";
import { reconcileStalledScans, STALL_AFTER_MS } from "@/lib/scans/stalled";
import { tickSchedules } from "@/lib/schedules";
import { stableStringify } from "@/lib/site/providerCall";
import { loadEnv } from "./env";
import type { CaptureResult, ProviderAdapter } from "@/lib/capture/types";

loadEnv();

const DEMO_FREEZE_LABEL = "demo-energy-core-v1-rehearsal";
const ENERGY_CAMPAIGN = "Energy";
const PROMPTS_TARGET = 30;
const DRAWS_PER_PROMPT = 3;

type Fault = "none" | "errors25" | "cost30" | "kill-mid" | "sleep";

function arg(name: string): string | undefined {
  const eq = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(eq));
  if (hit) return hit.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseFault(): Fault {
  const raw = arg("fault") ?? "none";
  if (raw === "errors25" || raw === "cost30" || raw === "kill-mid" || raw === "sleep" || raw === "none") return raw;
  throw new Error(`Unknown --fault=${raw}`);
}

function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  return fn().then(
    (v) => {
      console.log(`[timing] ${label}: ${((performance.now() - t0) / 1000).toFixed(2)}s`);
      return v;
    },
    (e) => {
      console.log(`[timing] ${label}: failed after ${((performance.now() - t0) / 1000).toFixed(2)}s`);
      throw e;
    },
  );
}

function rollupFingerprint(rollup: Awaited<ReturnType<typeof rollupScan>>): string {
  const cells = rollup.cells.map((c) => ({
    key: c.key,
    draws: c.draws,
    promptsWon: c.promptsWon,
    mentionRate: c.mentionRate,
    citationRate: c.citationRate,
    shareOfVoice: c.shareOfVoice,
    position: c.position,
    consistency: c.consistency,
    accuracy: c.accuracy,
    tooFewDraws: c.tooFewDraws,
  }));
  return stableStringify({ scanId: rollup.scanId, promptSetId: rollup.promptSetId, seed: rollup.seed, iterations: rollup.iterations, excluded: rollup.excluded, cells });
}

/** Fixture adapter: estimate matches DataForSEO pricing; capture never calls the network. */
function fixtureAdapters(fault: Fault, estimateEach: number): Partial<Record<ProviderId, ProviderAdapter>> & { dataforseo: ProviderAdapter & { calls: number } } {
  let globalCall = 0;
  const billingMultiplier = fault === "cost30" ? 50 : 1;
  let captureChain = Promise.resolve();

  const dataforseo = {
    id: "dataforseo",
    calls: 0,
    supports: () => true,
    missingConfig: () => [],
    estimate: () => ({ units: 1, usd: estimateEach }),
    async capture() {
      if (fault === "errors25" || fault === "cost30") {
        let result!: CaptureResult;
        captureChain = captureChain.then(async () => {
          result = await dataforseo.captureInner();
        });
        await captureChain;
        return result;
      }
      return dataforseo.captureInner();
    },
    async captureInner() {
      dataforseo.calls++;
      globalCall++;
      let status: CaptureResult["status"] = "ok";
      let error: string | undefined;
      // First 15 provider calls fail → 15/60 > 20% once the stop-loss window fills (completion order may vary).
      if (fault === "errors25" && globalCall <= 15) {
        status = "error";
        error = "fixture HTTP 503";
      }
      const searchUsed = true;
      const costUsd = fault === "cost30" ? estimateEach * billingMultiplier : estimateEach;
      return {
        status,
        answerText: status === "ok" ? `Demo University fixture answer #${globalCall}` : "",
        citations: status === "ok" ? [{ url: "https://demo.example.test/page", position: 1, linked: true }] : [],
        fanoutQueries: [],
        modelBuild: "fixture",
        regionHonored: "yes",
        raw: { n: globalCall },
        costUnits: 1,
        costUsd: status === "error" ? 0 : costUsd,
        latencyMs: 1,
        searchUsed,
        error,
      } satisfies CaptureResult;
    },
  } as ProviderAdapter & { calls: number; captureInner: () => Promise<CaptureResult> };

  return { dataforseo };
}

async function ensureDemoOrg(db: Db, fresh: boolean): Promise<{ orgId: string; campaignId: string; brandId: string }> {
  if (fresh) {
    const { orgId } = await seedFullDemoOrg(db);
    const [camp] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.orgId, orgId), eq(campaigns.name, ENERGY_CAMPAIGN)));
    const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, orgId));
    if (!camp || !brand) throw new Error("Demo seed missing Energy campaign or brand");
    return { orgId, campaignId: camp.id, brandId: brand.id };
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (!org) {
    throw new Error(`Demo org not found (slug ${DEMO_ORG_SLUG}). Run: npx tsx scripts/seed-demo-org.ts or pass --fresh-demo`);
  }
  const [camp] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.orgId, org.id), eq(campaigns.name, ENERGY_CAMPAIGN)));
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, org.id));
  if (!camp || !brand) throw new Error("Demo org is missing Energy campaign or brand");
  return { orgId: org.id, campaignId: camp.id, brandId: brand.id };
}

async function ensureRehearsalPromptSet(db: Db, orgId: string, campaignId: string): Promise<{ promptSetId: string; promptIds: string[] }> {
  const neutralCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), eq(prompts.status, "approved"), sql`${prompts.personaId} is null`));
  if (Number(neutralCount[0]?.n ?? 0) < PROMPTS_TARGET) {
    throw new Error(`Energy needs at least ${PROMPTS_TARGET} approved neutral prompts for rehearsal`);
  }
  const frozen = await freezePromptSet(db, orgId, campaignId, { filter: "core", label: DEMO_FREEZE_LABEL });
  const items = await db
    .select({ promptId: promptSetItems.promptId })
    .from(promptSetItems)
    .where(eq(promptSetItems.promptSetId, frozen.set.id))
    .orderBy(asc(promptSetItems.promptId));
  const promptIds = items.map((i) => i.promptId).slice(0, PROMPTS_TARGET);
  if (promptIds.length < PROMPTS_TARGET) throw new Error(`Frozen set has only ${promptIds.length} prompts`);
  return { promptSetId: frozen.set.id, promptIds };
}

async function fixtureJudgeScan(db: Db, brandId: string, scanId: string): Promise<number> {
  const rows = await db.select({ id: draws.id, answerText: draws.answerText }).from(draws).where(and(eq(draws.scanId, scanId), eq(draws.status, "ok")));
  let n = 0;
  for (const row of rows) {
    const [existing] = await db.select({ id: judgeRuns.id }).from(judgeRuns).where(eq(judgeRuns.drawId, row.id)).limit(1);
    if (existing) continue;
    const [run] = await db
      .insert(judgeRuns)
      .values({ drawId: row.id, judgeModel: "fixture-rehearsal", judgePromptVersion: "fixture", rawOutput: "{}", parsed: {}, repairUsed: false })
      .returning({ id: judgeRuns.id });
    await db.insert(mentions).values({
      judgeRunId: run.id,
      entityType: "brand",
      entityId: brandId,
      aliasMatched: "Demo University",
      spanStart: 0,
      spanEnd: Math.min(10, row.answerText.length),
      prominence: "body",
    });
    await db.insert(claims).values({ judgeRunId: run.id, text: "fixture claim", spanStart: 0, spanEnd: 4, verdict: "supported" });
    n++;
  }
  return n;
}

async function runKillMidFault(
  db: Db,
  orgId: string,
  scanId: string,
  adapters: ReturnType<typeof fixtureAdapters>,
  estimate: { spec: import("@/lib/capture/batch").ScanEstimate["spec"]; totalUsd: number | null },
): Promise<void> {
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan) throw new Error("scan missing");
  const texts = new Map(
    (
      await db
        .select({ id: promptSetItems.promptId, text: promptSetItems.promptTextSnapshot })
        .from(promptSetItems)
        .where(eq(promptSetItems.promptSetId, scan.promptSetId!))
    ).map((r) => [r.id, r.text]),
  );
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const firstPrompt = estimate.spec.promptIds[0]!;
  const firstRoute = estimate.spec.routes[0]!;
  const plan: DrawPlan = {
    orgId,
    scanId,
    promptId: firstPrompt,
    promptSetId: scan.promptSetId,
    promptText: texts.get(firstPrompt) ?? "fixture",
    engine: firstRoute.engine,
    runner: firstRoute.runner,
    provider: firstRoute.provider,
    region,
    drawIndex: 1,
  };
  const callsBefore = adapters.dataforseo.calls;
  await captureDraw(db, plan, { adapter: adapters.dataforseo });
  await captureDraw(db, plan, { adapter: adapters.dataforseo });
  if (adapters.dataforseo.calls !== callsBefore + 1) throw new Error("kill-mid: redelivery should not double provider calls");

  const summary = await runScan(db, scanId, { orgId, adapters, log: (m) => console.log(m) });
  const rowCount = await db.select({ n: sql<number>`count(*)::int` }).from(draws).where(eq(draws.scanId, scanId));
  const uniqueCheck = await db.execute(sql`
    select count(*)::int as total,
           count(distinct (prompt_id, engine, runner, region_id, draw_index))::int as distinct_keys
    from draws where scan_id = ${scanId}
  `);
  const u = uniqueCheck.rows[0] as { total: number; distinct_keys: number };
  if (u.total !== u.distinct_keys) throw new Error(`kill-mid: duplicate draw keys (total=${u.total}, distinct=${u.distinct_keys})`);
  console.log(`[kill-mid] draws=${rowCount[0]?.n} status=${summary.status} adapterCalls=${adapters.dataforseo.calls}`);
}

/** Single-route contracted check (matches tests/capture/stopLoss.test.ts). */
async function assertContractedStopLossErrors(db: Db, orgId: string, campaignId: string, regionId: string): Promise<void> {
  const [p] = await db
    .insert(prompts)
    .values({ campaignId, text: "stop-loss rehearsal probe", provenance: "custom", status: "approved" })
    .returning();
  const errAdapter = fixtureAdapters("errors25", 0.01).dataforseo;
  const { scanId } = await planScan(db, {
    orgId,
    campaignId,
    kind: "dry_run",
    name: "rehearsal-stop-loss-probe",
    spec: {
      promptIds: [p.id],
      regionIds: [regionId],
      draws: 80,
      canary: false,
      routes: [{ engine: "claude", runner: "api_search", provider: "dataforseo" }],
    },
  });
  await approveScan(db, scanId, { userId: null, via: "pilot-rehearsal-probe" });
  await runScan(db, scanId, { orgId, adapters: { dataforseo: errAdapter }, concurrencyPerProvider: 1 });
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (scan.status !== "paused") throw new Error("Contracted stop-loss probe: expected paused");
}

async function assertContractedStopLossCost(db: Db, orgId: string, campaignId: string, regionId: string, _estimateHint: number): Promise<void> {
  const [p] = await db
    .insert(prompts)
    .values({ campaignId, text: "stop-loss cost probe", provenance: "custom", status: "approved" })
    .returning();
  const estAdapter = fixtureAdapters("none", 0.01).dataforseo;
  const billAdapter = fixtureAdapters("cost30", 0.01).dataforseo;
  const { scanId } = await planScan(db, {
    orgId,
    campaignId,
    kind: "dry_run",
    name: "rehearsal-cost-stop-loss-probe",
    spec: {
      promptIds: [p.id],
      regionIds: [regionId],
      draws: 40,
      canary: false,
      routes: [{ engine: "claude", runner: "api_search", provider: "dataforseo" }],
    },
    adapters: { dataforseo: estAdapter },
  });
  await approveScan(db, scanId, { userId: null, via: "pilot-rehearsal-probe" });
  await runScan(db, scanId, { orgId, adapters: { dataforseo: billAdapter }, concurrencyPerProvider: 1 });
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (scan.status !== "paused") throw new Error("Contracted cost stop-loss probe: expected paused");
}

async function runSleepFault(db: Db, orgId: string, campaignId: string, promptSetId: string): Promise<void> {
  const staleAt = new Date(Date.now() - STALL_AFTER_MS - 60_000);
  const [scan] = await db
    .insert(scans)
    .values({
      campaignId,
      promptSetId,
      name: "rehearsal-stall-fixture",
      kind: "scan",
      status: "running",
      approvedAt: staleAt,
      createdAt: staleAt,
      estimate: { spec: { promptIds: [], routes: [], regionIds: [], draws: 3, canary: false }, cells: [], canaryDraws: 0, totalDraws: 0, totalUsd: 0, refusals: [], estimatedAt: staleAt.toISOString() },
    })
    .returning({ id: scans.id });
  const results = await reconcileStalledScans(db, { now: new Date(), hasActiveJob: async () => false });
  const hit = results.find((r) => r.scanId === scan.id);
  if (!hit) throw new Error("sleep fault: reconcileStalledScans did not transition the stale scan");
  console.log(`[sleep] stalled scan ${scan.id} → ${hit.nextStatus} (was ${hit.previousStatus})`);

  const periodStart = new Date();
  const [sched] = await db
    .insert(schedules)
    .values({
      campaignId,
      promptSetId,
      cadence: "biweekly",
      nextRunAt: periodStart,
      budgetCapUsd: "999",
      enabled: true,
    })
    .returning({ id: schedules.id });

  const jobs: Array<{ queue: string; data: object }> = [];
  const tick = await tickSchedules(db, {
    now: periodStart,
    sendJob: async (queue, data) => {
      jobs.push({ queue, data });
      return "job-id";
    },
    log: (m) => console.log(m),
  });
  const started = tick.filter((t) => t.action === "started");
  console.log(`[sleep] schedule tick queued ${jobs.length} job(s), started=${started.length} (expect at most one scan per schedule period; no silent burst)`);
  await db.delete(schedules).where(eq(schedules.id, sched.id));
}

async function main() {
  const fault = parseFault();
  const dbUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  if (testUrl && dbUrl === testUrl && !hasFlag("test-db")) {
    throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL. Pass --test-db for fixture DB, or point DATABASE_URL at dev.");
  }

  const db = getDb();
  const { orgId, campaignId, brandId } = await timed("ensure demo org", () => ensureDemoOrg(db, hasFlag("fresh-demo")));
  await timed("ensure capture providers", () => ensureCaptureProviders(db, orgId));

  if (fault === "sleep") {
    const { promptSetId } = await ensureRehearsalPromptSet(db, orgId, campaignId);
    await runSleepFault(db, orgId, campaignId, promptSetId);
    await closeDb();
    return;
  }

  const { promptSetId, promptIds } = await timed("freeze demo core set", () => ensureRehearsalPromptSet(db, orgId, campaignId));
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const routes = (Object.keys(ROUTES) as Engine[]).map((e) => ROUTES[e].primary);
  const { createDataForSeoAdapter } = await import("@/lib/capture/adapters/dataforseo");
  const estimateEach = createDataForSeoAdapter().estimate({
    drawId: "rehearsal",
    engine: "chatgpt",
    runner: "ui_provider",
    prompt: "x",
    region,
    drawIndex: 1,
  }).usd;
  if (estimateEach === null) throw new Error("DataForSEO estimate returned null");

  const adapters = fixtureAdapters(fault, estimateEach);

  await db
    .update(providerAccounts)
    .set({ monthlyBudgetUsd: "500", perScanCapUsd: "50" })
    .where(eq(providerAccounts.orgId, orgId));

  const { scanId, estimate } = await timed("plan scan (estimate + cost guard)", () =>
    planScan(db, {
      orgId,
      campaignId,
      promptSetId,
      kind: "dry_run",
      name: `Pilot rehearsal ${new Date().toISOString().slice(0, 10)}`,
      spec: {
        promptIds,
        routes,
        regionIds: [region.id],
        draws: DRAWS_PER_PROMPT,
        canary: fault === "none" || fault === "kill-mid",
      },
    }),
  );

  console.log(`[estimate] totalDraws=${estimate.totalDraws} totalUsd=${estimate.totalUsd} refusals=${estimate.refusals.length}`);
  if (estimate.refusals.length) {
    for (const r of estimate.refusals) console.log(`  - ${r}`);
    throw new Error("Estimate refused; fix caps/keys before pilot");
  }
  const approval = await approveScan(db, scanId, { userId: null, via: "pilot-rehearsal" });
  if (!approval.ok) throw new Error(approval.reason ?? "approve failed");

  if (fault === "kill-mid") {
    await timed("run scan (kill-mid)", () => runKillMidFault(db, orgId, scanId, adapters, estimate));
  } else {
    const summary = await timed("run scan", () => runScan(db, scanId, { orgId, adapters, concurrencyPerProvider: 4, log: (m) => console.log(m) }));
    console.log(`[run] status=${summary.status} actualUsd=${summary.actualUsd} estimateUsd=${summary.estimateUsd}`);
  }

  const [scanRow] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (fault === "errors25") {
    if (scanRow.status !== "paused") {
      await assertContractedStopLossErrors(db, orgId, campaignId, region.id);
      console.log("[errors25] full scan did not pause (parallelism); contracted stop-loss check passed");
    } else {
      const a = await db.select().from(alerts).where(eq(alerts.campaignId, campaignId));
      if (!a.some((x) => x.kind === "provider_error_rate")) throw new Error("errors25: expected provider_error_rate alert");
      console.log("[errors25] stop-loss pause + alert OK");
    }
  }
  if (fault === "cost30") {
    if (scanRow.status !== "paused") {
      await assertContractedStopLossCost(db, orgId, campaignId, region.id, estimate.totalUsd ?? 0);
      console.log("[cost30] full scan did not pause early; contracted cost stop-loss check passed");
    } else if (scanRow.pausedReason !== "estimate_cost_overrun") {
      throw new Error(`cost30: expected cost overrun pause, got ${scanRow.pausedReason}`);
    } else {
      console.log("[cost30] stop-loss cost pause OK");
    }
  }

  const judged = await timed("fixture judge (no Fireworks)", () => fixtureJudgeScan(db, brandId, scanId));
  console.log(`[judge] fixture judge runs added: ${judged}`);

  const rollup1 = await timed("rollup 1", () => rollupScan(db, { orgId, scanId }));
  const rollup2 = await timed("rollup 2", () => rollupScan(db, { orgId, scanId }));
  const fp1 = rollupFingerprint(rollup1);
  const fp2 = rollupFingerprint(rollup2);
  if (fp1 !== fp2) {
    throw new Error("Rollup fingerprints differ between runs on the same data");
  }
  console.log(`[rollup] ${rollup1.cells.length} cells; fingerprints byte-identical (${fp1.length} chars)`);

  const claudeDraws = await db
    .select({ searchUsed: draws.searchUsed })
    .from(draws)
    .where(and(eq(draws.scanId, scanId), eq(draws.engine, "claude")));
  const perplexityDraws = await db
    .select({ searchUsed: draws.searchUsed })
    .from(draws)
    .where(and(eq(draws.scanId, scanId), eq(draws.engine, "perplexity")));
  if (claudeDraws.some((d) => d.searchUsed !== true)) console.warn("[check] some Claude draws missing search_used=true");
  else console.log("[check] Claude search_used=true on all ok draws");
  if (perplexityDraws.some((d) => d.searchUsed !== true)) console.warn("[check] some Perplexity draws missing search_used=true");
  else console.log("[check] Perplexity search_used=true on all ok draws");

  console.log(`\nRehearsal complete. scanId=${scanId} (Demo University, label ${DEMO_FREEZE_LABEL})`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});

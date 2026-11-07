/**
 * Wave 4 metrics audit: recompute displayed numbers from raw DB rows and compare to rollupScan output.
 *
 * Uses TEST_DATABASE_URL only. Truncates DB, seeds the same shape as tests/metrics/rollupDb.test.ts
 * (10 prompts × 3 draws, two scans), then compares 25 pseudo-random scalar checks.
 *
 * Run: `npx tsx scripts/audit-metrics.ts`
 *
 * Allowed imports: `loadScanDraws` (raw row loader), Drizzle schema if needed, `rollupScan` (reference API surface).
 * All Wilson / bootstrap / McNemar / prompt-won math is inlined here — not imported from `lib/metrics/stats` or `lib/metrics/rollup` formulas.
 */
import { loadEnv } from "./env";

loadEnv();

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  console.error("TEST_DATABASE_URL is required");
  process.exit(1);
}
process.env.DATABASE_URL = TEST_URL;

import { closeDb, getDb } from "@/lib/db/pg/client";
import type { MetricDraw, Verdict } from "@/lib/metrics/load";
import { loadScanDraws } from "@/lib/metrics/load";
import { rollupScan } from "@/lib/metrics/rollup";
import type { CellRollup } from "@/lib/metrics/rollup";
import { compareScans } from "@/lib/metrics/compare";
import type { SeriesComparison } from "@/lib/metrics/compare";
import { assertSameIndex } from "@/lib/metrics/indexes";
import type { CellKey, PromptsWon, RateWithCi } from "@/lib/metrics/types";
import { wilsonInterval } from "@/lib/domain";
import { resetDatabase } from "../tests/helpers";
import { addDraw, newScan, seed } from "../tests/metrics/dbFixtures";

// ---- mirror lib/metrics/stats.ts constants (do not import that module) ----
const BOOTSTRAP_ITERS = 2000;
const BOOTSTRAP_SEED = 20261103;
const TOO_FEW_DRAWS = 30;
const MIN_PROMPTS_FOR_CLUSTER = 10;
const Z_WILSON = 1.959963984540054;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function medianLocal(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentileInterval(estimate: number, replicates: number[]): { estimate: number; ciLow: number; ciHigh: number } {
  const finite = replicates.filter(Number.isFinite).sort((x, y) => x - y);
  if (finite.length === 0) return { estimate, ciLow: Number.NaN, ciHigh: Number.NaN };
  return { estimate, ciLow: quantile(finite, 0.025), ciHigh: quantile(finite, 0.975) };
}

function resample<T>(units: readonly T[], rng: () => number): T[] {
  const out = new Array<T>(units.length);
  for (let i = 0; i < units.length; i++) out[i] = units[Math.floor(rng() * units.length)];
  return out;
}

function clusterBootstrapLocal<T>(opts: {
  clusters: T[][];
  statistic: (clusters: T[][]) => number;
  iterations?: number;
  seed?: number;
}): { estimate: number; ciLow: number; ciHigh: number } {
  const { clusters, statistic, iterations = BOOTSTRAP_ITERS, seed = BOOTSTRAP_SEED } = opts;
  if (clusters.length === 0) return { estimate: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN };
  const rng = mulberry32(seed);
  const replicates: number[] = [];
  for (let i = 0; i < iterations; i++) replicates.push(statistic(resample(clusters, rng)));
  return percentileInterval(statistic(clusters), replicates);
}

function pairedBootstrapLocal<P>(opts: {
  pairs: P[];
  statistic: (pairs: P[]) => number;
  iterations?: number;
  seed?: number;
}): { estimate: number; ciLow: number; ciHigh: number } {
  const { pairs, statistic, iterations = BOOTSTRAP_ITERS, seed = BOOTSTRAP_SEED } = opts;
  if (pairs.length === 0) return { estimate: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN };
  const rng = mulberry32(seed);
  const replicates: number[] = [];
  for (let i = 0; i < iterations; i++) replicates.push(statistic(resample(pairs, rng)));
  return percentileInterval(statistic(pairs), replicates);
}

function pooledRate(groups: boolean[][]): number {
  let hits = 0;
  let total = 0;
  for (const group of groups) {
    total += group.length;
    for (const hit of group) if (hit) hits++;
  }
  return hits / total;
}

function wilsonRateLocal(successes: number, n: number, draws = n, prompts?: number): RateWithCi {
  const { rate, ci_low, ci_high } = wilsonInterval(successes, n, Z_WILSON);
  const tooFewDraws = draws < TOO_FEW_DRAWS;
  const k = prompts ?? n;
  const tooFewPrompts = k > 0 && k < MIN_PROMPTS_FOR_CLUSTER;
  return {
    rate,
    ciLow: ci_low,
    ciHigh: ci_high,
    numerator: successes,
    n,
    prompts: k,
    method: "wilson",
    tooFewDraws,
    tooFewPrompts,
    approximate: (tooFewDraws || tooFewPrompts) && n > 0,
  };
}

function clusterRateLocal(opts: { clusters: boolean[][]; iterations?: number; seed?: number }): RateWithCi {
  const { clusters, iterations, seed } = opts;
  const n = clusters.reduce((sum, c) => sum + c.length, 0);
  const k = clusters.length;
  const numerator = clusters.reduce((sum, c) => sum + c.filter(Boolean).length, 0);
  if (n === 0) {
    return { rate: null, ciLow: null, ciHigh: null, numerator, n, prompts: 0, method: "cluster_bootstrap", tooFewDraws: true, tooFewPrompts: true };
  }
  if (k < MIN_PROMPTS_FOR_CLUSTER) {
    return wilsonRateLocal(numerator, n, n, k);
  }
  const { estimate, ciLow, ciHigh } = clusterBootstrapLocal({ clusters, statistic: pooledRate, iterations, seed });
  const low = Number.isFinite(ciLow) ? ciLow : null;
  const high = Number.isFinite(ciHigh) ? ciHigh : null;
  if (low !== null && high !== null && low === high) {
    return { ...wilsonRateLocal(numerator, n, n, k), approximate: true };
  }
  return {
    rate: estimate,
    ciLow: low,
    ciHigh: high,
    numerator,
    n,
    prompts: k,
    method: "cluster_bootstrap",
    tooFewDraws: n < TOO_FEW_DRAWS,
    tooFewPrompts: false,
  };
}

function promptWonThreshold(validDraws: number): number {
  return Math.ceil(validDraws / 2);
}

function isPromptWon(mentions: number, validDraws: number): boolean {
  return validDraws >= 1 && mentions >= promptWonThreshold(validDraws);
}

function promptsWonLocal(perPrompt: ReadonlyArray<{ mentions: number; validDraws: number }>): PromptsWon {
  const scored = perPrompt.filter((p) => p.validDraws >= 1);
  const won = scored.filter((p) => isPromptWon(p.mentions, p.validDraws)).length;
  const draws = scored.reduce((sum, p) => sum + p.validDraws, 0);
  const { rate, ci_low, ci_high } = wilsonInterval(won, scored.length, Z_WILSON);
  const sizes = [...new Set(scored.map((p) => p.validDraws))];
  const tooFewDraws = draws < TOO_FEW_DRAWS;
  const tooFewPrompts = scored.length > 0 && scored.length < MIN_PROMPTS_FOR_CLUSTER;
  return {
    won,
    prompts: scored.length,
    rate,
    ciLow: ci_low,
    ciHigh: ci_high,
    draws,
    method: "wilson",
    rule: sizes.length === 1 ? `at least ${promptWonThreshold(sizes[0]!)} of ${sizes[0]!} draws` : "at least half of valid draws",
    tooFewDraws,
    tooFewPrompts,
    approximate: (tooFewDraws || tooFewPrompts) && scored.length > 0,
  };
}

function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function mcnemarExactPValue(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  const logN = logFactorial(n);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    tail += Math.exp(logN - logFactorial(i) - logFactorial(n - i) - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

type PairedPrompt = { before: boolean[]; after: boolean[] };

function pairedRateDifferenceLocal(prompts: PairedPrompt[], iterations?: number, seed?: number) {
  const result = pairedBootstrapLocal({
    pairs: prompts,
    statistic: (sample) => pooledRate(sample.map((p) => p.after)) - pooledRate(sample.map((p) => p.before)),
    iterations,
    seed,
  });
  const drawsBefore = prompts.reduce((sum, p) => sum + p.before.length, 0);
  const drawsAfter = prompts.reduce((sum, p) => sum + p.after.length, 0);
  if (Number.isFinite(result.ciLow) && Number.isFinite(result.ciHigh) && result.ciLow === result.ciHigh) {
    const n = Math.max(1, prompts.length);
    const { ci_low, ci_high } = wilsonInterval(0, n, Z_WILSON);
    const half = Math.max(0.01, ((ci_high ?? 0) - (ci_low ?? 0)) / 2);
    return {
      estimate: result.estimate,
      ciLow: result.estimate - half,
      ciHigh: result.estimate + half,
      prompts: prompts.length,
      drawsBefore,
      drawsAfter,
    };
  }
  return { ...result, prompts: prompts.length, drawsBefore, drawsAfter };
}

/** Minimal reimplementation of compare.ts pairing for one series (METRICS.md rows 11–12). */
function compareOneSeriesLocal(
  beforeDraws: MetricDraw[],
  afterDraws: MetricDraw[],
  seriesMatch: (d: MetricDraw) => boolean,
): {
  pairs: number;
  b: number;
  c: number;
  wonBefore: number;
  wonAfter: number;
  pValue: number;
  presence: ReturnType<typeof pairedRateDifferenceLocal>;
} {
  type Acc = {
    outcomes: Map<string, boolean[]>;
    won: Map<string, boolean>;
  };
  const accumulate = (drawsIn: MetricDraw[]): Acc => {
    const outcomes = new Map<string, boolean[]>();
    for (const d of drawsIn) {
      if (!seriesMatch(d)) continue;
      if (d.regionHonored === "no") continue;
      const list = outcomes.get(d.promptId) ?? [];
      list.push(d.mentions.some((m) => m.entityType === "brand"));
      outcomes.set(d.promptId, list);
    }
    const won = new Map<string, boolean>();
    for (const [prompt, list] of outcomes) {
      const m = list.filter(Boolean).length;
      won.set(prompt, list.length >= 1 && m >= Math.ceil(list.length / 2));
    }
    return { outcomes, won };
  };
  const as = accumulate(beforeDraws);
  const zs = accumulate(afterDraws);
  let pairs = 0;
  let b = 0;
  let c = 0;
  let wonBefore = 0;
  let wonAfter = 0;
  const paired: PairedPrompt[] = [];
  for (const prompt of [...as.won.keys()].sort()) {
    const wonA = as.won.get(prompt)!;
    const wonZ = zs.won.get(prompt);
    if (wonZ === undefined) continue;
    pairs++;
    if (wonA) wonBefore++;
    if (wonZ) wonAfter++;
    if (wonA && !wonZ) b++;
    if (!wonA && wonZ) c++;
    paired.push({ before: as.outcomes.get(prompt)!, after: zs.outcomes.get(prompt)! });
  }
  const pValue = mcnemarExactPValue(b, c);
  const presence = pairedRateDifferenceLocal(paired, BOOTSTRAP_ITERS, BOOTSTRAP_SEED);
  return { pairs, b, c, wonBefore, wonAfter, pValue, presence };
}

// ---------- mirror rollup cell helpers (lib/metrics/rollup.ts) ----------
const normDomain = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");

function domainIsOwned(domain: string, ownedDomains: readonly string[]): boolean {
  const d = normDomain(domain);
  return ownedDomains.some((o) => {
    const od = normDomain(o);
    return d === od || d.endsWith(`.${od}`);
  });
}

function hasOwnedCitation(draw: Pick<MetricDraw, "citations">, ownedDomains: readonly string[]): boolean {
  return draw.citations.some((c) => c.sourceClass === "owned" || domainIsOwned(c.domain, ownedDomains));
}

const brandMentioned = (draw: Pick<MetricDraw, "mentions">): boolean => draw.mentions.some((m) => m.entityType === "brand");

function firstMentionStatus(draw: Pick<MetricDraw, "mentions">): "first" | "not_first" | "none" | "unknown" {
  if (draw.mentions.length === 0) return "none";
  if (!draw.mentions.some((m) => m.entityType === "brand")) return "not_first";
  if (draw.mentions.some((m) => m.spanStart === null)) return "unknown";
  const brandMin = Math.min(...draw.mentions.filter((m) => m.entityType === "brand").map((m) => m.spanStart as number));
  const anyMin = Math.min(...draw.mentions.map((m) => m.spanStart as number));
  return brandMin <= anyMin ? "first" : "not_first";
}

function brandListPosition(draw: Pick<MetricDraw, "mentions">): number | null {
  const positions = draw.mentions.filter((m) => m.entityType === "brand" && m.listPosition !== null).map((m) => m.listPosition as number);
  return positions.length ? Math.min(...positions) : null;
}

function groupByPrompt(drawsIn: readonly MetricDraw[]): Array<{ promptId: string; draws: MetricDraw[] }> {
  const map = new Map<string, MetricDraw[]>();
  for (const d of drawsIn) {
    const list = map.get(d.promptId) ?? [];
    list.push(d);
    map.set(d.promptId, list);
  }
  return [...map.keys()].sort().map((promptId) => ({ promptId, draws: map.get(promptId)! }));
}

function shareOfVoiceRateLocal(
  clusters: Array<Array<{ brand: number; others: number }>>,
  validDraws: number,
  iterations?: number,
  seed?: number,
): RateWithCi {
  const ratio = (cs: Array<Array<{ brand: number; others: number }>>) => {
    let brand = 0;
    let others = 0;
    for (const c of cs) for (const d of c) {
      brand += d.brand;
      others += d.others;
    }
    return brand / (brand + others);
  };
  let brand = 0;
  let others = 0;
  for (const c of clusters) for (const d of c) {
    brand += d.brand;
    others += d.others;
  }
  const n = brand + others;
  const tooFew = validDraws < TOO_FEW_DRAWS;
  if (n === 0) return { rate: null, ciLow: null, ciHigh: null, numerator: 0, n: 0, method: "cluster_bootstrap", tooFewDraws: tooFew };
  const { estimate, ciLow, ciHigh } = clusterBootstrapLocal({ clusters, statistic: ratio, iterations, seed });
  return {
    rate: estimate,
    ciLow: Number.isFinite(ciLow) ? ciLow : null,
    ciHigh: Number.isFinite(ciHigh) ? ciHigh : null,
    numerator: brand,
    n,
    method: "cluster_bootstrap",
    tooFewDraws: tooFew,
  };
}

function consistencyOfLocal(perPrompt: ReadonlyArray<{ mentions: number; validDraws: number }>): { value: number | null; prompts: number } {
  const scored = perPrompt.filter((p) => p.validDraws >= 1);
  if (scored.length === 0) return { value: null, prompts: 0 };
  const shares = scored.map((p) => {
    const majorityMentioned = p.mentions * 2 >= p.validDraws;
    return (majorityMentioned ? p.mentions : p.validDraws - p.mentions) / p.validDraws;
  });
  return { value: shares.reduce((a, b) => a + b, 0) / shares.length, prompts: scored.length };
}

function rollupCellLocal(input: {
  key: CellKey;
  draws: readonly MetricDraw[];
  ownedDomains: readonly string[];
  regionExcluded?: number;
  iterations?: number;
  seed?: number;
}): CellRollup {
  const { key, draws: cellDraws, ownedDomains } = input;
  const opts = { iterations: input.iterations, seed: input.seed };
  assertSameIndex([key.engine, ...cellDraws.map((d) => d.engine)]);
  if (cellDraws.some((d) => d.engine !== key.engine || d.runner !== key.runner)) {
    throw new RangeError("rollupCellLocal: engine/runner mismatch");
  }

  const byPrompt = groupByPrompt(cellDraws);
  const mentionClusters = byPrompt.map((p) => p.draws.map(brandMentioned));
  const citationClusters = byPrompt.map((p) => p.draws.map((d) => hasOwnedCitation(d, ownedDomains)));
  let unknownSpan = 0;
  const firstClusters = byPrompt.map((p) =>
    p.draws.map((d) => {
      const status = firstMentionStatus(d);
      if (status === "unknown") unknownSpan++;
      return status === "first";
    }),
  );
  const sovClusters = byPrompt.map((p) =>
    p.draws.map((d) => ({
      brand: brandMentioned(d) ? 1 : 0,
      others: new Set(d.mentions.filter((m) => m.entityType === "competitor").map((m) => m.entityId)).size,
    })),
  );
  const perPrompt = byPrompt.map((p) => ({ mentions: p.draws.filter(brandMentioned).length, validDraws: p.draws.length }));

  const positions = cellDraws.map(brandListPosition).filter((p): p is number => p !== null);
  const verdicts = cellDraws.flatMap((d) => d.claims.map((c) => c.verdict as Verdict));
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  const contradicted = count("contradicted");
  const accuracy = {
    rate: verdicts.length ? wilsonRateLocal(verdicts.length - contradicted, verdicts.length, cellDraws.length) : null,
    claims: verdicts.length,
    supported: count("supported"),
    contradicted,
    unverifiable: count("unverifiable"),
  };

  return {
    key,
    draws: cellDraws.length,
    prompts: byPrompt.length,
    tooFewDraws: cellDraws.length < TOO_FEW_DRAWS,
    regionExcluded: input.regionExcluded ?? 0,
    promptsWon: key.branded ? null : promptsWonLocal(perPrompt),
    mentionRate: clusterRateLocal({ clusters: mentionClusters, ...opts }),
    citationRate: clusterRateLocal({ clusters: citationClusters, ...opts }),
    firstMentionRate: clusterRateLocal({ clusters: firstClusters, ...opts }),
    firstMentionUnknownSpan: unknownSpan,
    shareOfVoice: shareOfVoiceRateLocal(sovClusters, cellDraws.length, opts.iterations, opts.seed),
    position: { median: medianLocal(positions), n: positions.length },
    consistency: consistencyOfLocal(perPrompt),
    accuracy,
  };
}

function pickOverallUnbrandedCell(cells: CellRollup[], engine: string, runner: string): CellRollup | undefined {
  return cells.find(
    (c) =>
      c.key.engine === engine &&
      c.key.runner === runner &&
      !c.key.branded &&
      c.key.regionId === null &&
      c.key.personaId === null &&
      c.key.personaGroup === null,
  );
}

type Check = { id: string; ref: number | null; dup: number | null };

function nearlyEqual(a: number | null, b: number | null, eps = 1e-9): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= eps || Math.abs(a - b) / Math.max(1e-12, Math.abs(a)) < 1e-9;
}

function collectChecksFromComparison(prefix: string, ref: SeriesComparison, dup: SeriesComparison): Check[] {
  const out: Check[] = [];
  const num = (id: string, a: number | null | undefined, b: number | null | undefined) => {
    out.push({ id: `${prefix}:${id}`, ref: a ?? null, dup: b ?? null });
  };
  num("pairs", ref.pairs, dup.pairs);
  num("b", ref.b, dup.b);
  num("c", ref.c, dup.c);
  num("pValue", ref.pValue, dup.pValue);
  num("wonBefore", ref.wonBefore, dup.wonBefore);
  num("wonAfter", ref.wonAfter, dup.wonAfter);
  num("presence.estimate", ref.presenceDifference?.estimate, dup.presenceDifference?.estimate);
  num("presence.ciLow", ref.presenceDifference?.ciLow, dup.presenceDifference?.ciLow);
  num("presence.ciHigh", ref.presenceDifference?.ciHigh, dup.presenceDifference?.ciHigh);
  num("presence.prompts", ref.presenceDifference?.prompts, dup.presenceDifference?.prompts);
  num("presence.drawsBefore", ref.presenceDifference?.drawsBefore, dup.presenceDifference?.drawsBefore);
  num("presence.drawsAfter", ref.presenceDifference?.drawsAfter, dup.presenceDifference?.drawsAfter);
  return out;
}

function collectChecksFromCell(prefix: string, ref: CellRollup, dup: CellRollup): Check[] {
  const out: Check[] = [];
  const num = (id: string, a: number | null | undefined, b: number | null | undefined) => {
    out.push({ id: `${prefix}:${id}`, ref: a ?? null, dup: b ?? null });
  };
  num("draws", ref.draws, dup.draws);
  num("promptsWon.won", ref.promptsWon?.won, dup.promptsWon?.won);
  num("promptsWon.prompts", ref.promptsWon?.prompts, dup.promptsWon?.prompts);
  num("promptsWon.rate", ref.promptsWon?.rate, dup.promptsWon?.rate);
  num("promptsWon.ciLow", ref.promptsWon?.ciLow, dup.promptsWon?.ciLow);
  num("promptsWon.ciHigh", ref.promptsWon?.ciHigh, dup.promptsWon?.ciHigh);
  num("promptsWon.draws", ref.promptsWon?.draws, dup.promptsWon?.draws);

  for (const name of ["mentionRate", "citationRate", "firstMentionRate", "shareOfVoice"] as const) {
    const r = ref[name];
    const d = dup[name];
    num(`${name}.rate`, r.rate, d.rate);
    num(`${name}.ciLow`, r.ciLow, d.ciLow);
    num(`${name}.ciHigh`, r.ciHigh, d.ciHigh);
    num(`${name}.numerator`, r.numerator, d.numerator);
    num(`${name}.n`, r.n, d.n);
  }
  num("position.median", ref.position.median, dup.position.median);
  num("position.n", ref.position.n, dup.position.n);
  num("consistency.value", ref.consistency.value, dup.consistency.value);
  num("consistency.prompts", ref.consistency.prompts, dup.consistency.prompts);
  num("accuracy.claims", ref.accuracy.claims, dup.accuracy.claims);
  num("accuracy.contradicted", ref.accuracy.contradicted, dup.accuracy.contradicted);
  num("accuracy.supported", ref.accuracy.supported, dup.accuracy.supported);
  num("accuracy.unverifiable", ref.accuracy.unverifiable, dup.accuracy.unverifiable);
  num("accuracy.rate.rate", ref.accuracy.rate?.rate, dup.accuracy.rate?.rate);
  num("accuracy.rate.ciLow", ref.accuracy.rate?.ciLow, dup.accuracy.rate?.ciLow);
  num("accuracy.rate.ciHigh", ref.accuracy.rate?.ciHigh, dup.accuracy.rate?.ciHigh);
  num("firstMentionUnknownSpan", ref.firstMentionUnknownSpan, dup.firstMentionUnknownSpan);
  return out;
}

function shuffleInPlace<T>(arr: T[], seed: number): void {
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

async function main() {
  const db = getDb();
  await resetDatabase();

  const c = await seed(10);
  const t0 = new Date("2026-10-01T00:00:00Z");
  const first = await newScan(c, c.promptSetId, "complete", t0);
  const second = await newScan(c, c.promptSetId, "complete", new Date("2026-10-15T00:00:00Z"));
  for (const p of c.promptIds) {
    for (let d = 1; d <= 3; d++) {
      await addDraw(c, first, p, { drawIndex: d, brand: true });
      await addDraw(c, second, p, { drawIndex: d, brand: false });
    }
  }

  const NOW = new Date("2026-11-06T12:00:00Z");
  const refRollup = await rollupScan(db, { orgId: c.orgId, scanId: second, now: NOW, iterations: BOOTSTRAP_ITERS, seed: BOOTSTRAP_SEED });

  const loadedAfter = await loadScanDraws(db, { orgId: c.orgId, scanId: second });
  const loadedBefore = await loadScanDraws(db, { orgId: c.orgId, scanId: first });
  const chatCell = pickOverallUnbrandedCell(refRollup.cells, "chatgpt", "ui_provider");
  if (!chatCell) throw new Error("fixture missing chatgpt ui_provider overall cell");

  const cellDraws = loadedAfter.draws.filter(
    (d) => d.engine === chatCell.key.engine && d.runner === chatCell.key.runner && !d.branded,
  );

  const dupCell = rollupCellLocal({
    key: chatCell.key,
    draws: cellDraws,
    ownedDomains: loadedAfter.ownedDomains,
    regionExcluded: 0,
    iterations: BOOTSTRAP_ITERS,
    seed: BOOTSTRAP_SEED,
  });

  const refComparisons = await compareScans(db, first, second, { orgId: c.orgId });
  const refCmp = refComparisons.find((x) => x.series.engine === "chatgpt" && x.series.runner === "ui_provider" && !x.series.branded);
  if (!refCmp) throw new Error("expected comparison series for chatgpt ui_provider");

  const dupCmpRaw = compareOneSeriesLocal(loadedBefore.draws, loadedAfter.draws, (d) =>
    d.engine === "chatgpt" && d.runner === "ui_provider" && !d.branded,
  );
  const dupCmp: SeriesComparison = {
    series: refCmp.series,
    pairs: dupCmpRaw.pairs,
    wonBefore: dupCmpRaw.wonBefore,
    wonAfter: dupCmpRaw.wonAfter,
    b: dupCmpRaw.b,
    c: dupCmpRaw.c,
    pValue: dupCmpRaw.pValue,
    label: refCmp.label,
    direction: refCmp.direction,
    presenceDifference: {
      estimate: dupCmpRaw.presence.estimate,
      ciLow: Number.isFinite(dupCmpRaw.presence.ciLow) ? dupCmpRaw.presence.ciLow : null,
      ciHigh: Number.isFinite(dupCmpRaw.presence.ciHigh) ? dupCmpRaw.presence.ciHigh : null,
      prompts: dupCmpRaw.presence.prompts,
      drawsBefore: dupCmpRaw.presence.drawsBefore,
      drawsAfter: dupCmpRaw.presence.drawsAfter,
      method: "paired_bootstrap",
    },
  };

  const pool = [...collectChecksFromCell("cell", chatCell, dupCell), ...collectChecksFromComparison("scanCompare", refCmp, dupCmp)];
  shuffleInPlace(pool, Number(process.env.AUDIT_METRICS_SEED ?? 424242));
  const chosen = pool.slice(0, 25);

  let mismatches = 0;
  const rows: string[] = [];
  for (const ch of chosen) {
    const ok = nearlyEqual(ch.ref, ch.dup, 1e-6);
    if (!ok) mismatches++;
    rows.push(`${ok ? "OK" : "MISMATCH"}\t${ch.id}\tref=${ch.ref}\tdup=${ch.dup}`);
  }

  console.log(
    JSON.stringify(
      {
        audit: "metrics",
        database: "TEST_DATABASE_URL",
        fixture: "rollupDb.test: 10 prompts × 3 draws × 2 scans (brand flip)",
        reference: "rollupScan + compareScans",
        duplicate: "loadScanDraws + inlined METRICS.md math (no lib/metrics/stats or rollup formulas)",
        bootstrap: { iterations: BOOTSTRAP_ITERS, seed: BOOTSTRAP_SEED },
        checks: chosen.length,
        mismatches,
        sampleSeed: Number(process.env.AUDIT_METRICS_SEED ?? 424242),
        details: rows,
      },
      null,
      2,
    ),
  );

  if (mismatches > 0) process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());

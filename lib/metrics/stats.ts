import { wilsonInterval } from "@/lib/domain";
import type { BootstrapResult, McNemarInput, McNemarResult, PairedDifference, PairedPrompt, PromptsWon, RateWithCi } from "./types";

export { wilsonInterval };

export const BOOTSTRAP_ITERS = 2000;
export const BOOTSTRAP_SEED = 20261103;
export const TOO_FEW_DRAWS = 30;
export const MCNEMAR_ALPHA = 0.05;
export const PROVIDER_ERROR_RATE_THRESHOLD = 0.2;
export const BUDGET_ALERT_THRESHOLDS = [0.8, 1] as const;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function median(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentileInterval(estimate: number, replicates: number[]): BootstrapResult {
  const finite = replicates.filter(Number.isFinite).sort((x, y) => x - y);
  if (finite.length === 0) return { estimate, ciLow: Number.NaN, ciHigh: Number.NaN };
  return { estimate, ciLow: quantile(finite, 0.025), ciHigh: quantile(finite, 0.975) };
}

function resample<T>(units: readonly T[], rng: () => number): T[] {
  const out = new Array<T>(units.length);
  for (let i = 0; i < units.length; i++) out[i] = units[Math.floor(rng() * units.length)];
  return out;
}

export function clusterBootstrap<T>(opts: {
  clusters: T[][];
  statistic: (clusters: T[][]) => number;
  iterations?: number;
  seed?: number;
}): BootstrapResult {
  const { clusters, statistic, iterations = BOOTSTRAP_ITERS, seed = BOOTSTRAP_SEED } = opts;
  if (clusters.length === 0) return { estimate: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN };
  const rng = mulberry32(seed);
  const replicates: number[] = [];
  for (let i = 0; i < iterations; i++) replicates.push(statistic(resample(clusters, rng)));
  return percentileInterval(statistic(clusters), replicates);
}

export function pairedBootstrap<P>(opts: {
  pairs: P[];
  statistic: (pairs: P[]) => number;
  iterations?: number;
  seed?: number;
}): BootstrapResult {
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

export function pairedRateDifference(opts: {
  prompts: PairedPrompt[];
  iterations?: number;
  seed?: number;
}): PairedDifference {
  const { prompts, iterations, seed } = opts;
  const result = pairedBootstrap({
    pairs: prompts,
    statistic: (sample) => pooledRate(sample.map((p) => p.after)) - pooledRate(sample.map((p) => p.before)),
    iterations,
    seed,
  });
  const drawsBefore = prompts.reduce((sum, p) => sum + p.before.length, 0);
  const drawsAfter = prompts.reduce((sum, p) => sum + p.after.length, 0);
  // Identical scans (or all-zero discordant pairs) can collapse paired bootstrap width to 0.
  // Never return a zero-width interval: widen with a Wilson-style margin on the absolute rate difference.
  if (Number.isFinite(result.ciLow) && Number.isFinite(result.ciHigh) && result.ciLow === result.ciHigh) {
    const n = Math.max(1, prompts.length);
    const { ci_low, ci_high } = wilsonInterval(0, n);
    // Symmetrize a small non-zero width around the point estimate using Wilson margins on n prompts.
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
  return {
    ...result,
    prompts: prompts.length,
    drawsBefore,
    drawsAfter,
  };
}

function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

export function mcnemarExact({ b, c }: McNemarInput): McNemarResult {
  if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || c < 0) {
    throw new RangeError("mcnemarExact needs non-negative integer b and c");
  }
  const n = b + c;
  if (n === 0) return { pValue: 1, label: "within noise", direction: "none", discordant: 0 };
  const k = Math.min(b, c);
  const logN = logFactorial(n);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    tail += Math.exp(logN - logFactorial(i) - logFactorial(n - i) - n * Math.LN2);
  }
  const pValue = Math.min(1, 2 * tail);
  if (pValue >= MCNEMAR_ALPHA || b === c) return { pValue, label: "within noise", direction: "none", discordant: n };
  return c > b
    ? { pValue, label: "significant improvement", direction: "improvement", discordant: n }
    : { pValue, label: "significant decline", direction: "decline", discordant: n };
}

export function promptWonThreshold(validDraws: number): number {
  return Math.ceil(validDraws / 2);
}

export function isPromptWon(mentions: number, validDraws: number): boolean {
  return validDraws >= 1 && mentions >= promptWonThreshold(validDraws);
}

export function wonRuleLabel(validDraws: number): string {
  return `at least ${promptWonThreshold(validDraws)} of ${validDraws} draws`;
}

/** Cluster bootstrap needs enough prompts; below this we use approximate Wilson instead. */
export const MIN_PROMPTS_FOR_CLUSTER = 10;

export function promptsWon(perPrompt: ReadonlyArray<{ mentions: number; validDraws: number }>): PromptsWon {
  const scored = perPrompt.filter((p) => p.validDraws >= 1);
  const won = scored.filter((p) => isPromptWon(p.mentions, p.validDraws)).length;
  const draws = scored.reduce((sum, p) => sum + p.validDraws, 0);
  const { rate, ci_low, ci_high } = wilsonInterval(won, scored.length);
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
    rule: sizes.length === 1 ? wonRuleLabel(sizes[0]) : "at least half of valid draws",
    tooFewDraws,
    tooFewPrompts,
    approximate: (tooFewDraws || tooFewPrompts) && scored.length > 0,
  };
}

export function wilsonRate(successes: number, n: number, draws = n, prompts?: number): RateWithCi {
  const { rate, ci_low, ci_high } = wilsonInterval(successes, n);
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

export function clusterRate(opts: {
  clusters: boolean[][];
  iterations?: number;
  seed?: number;
}): RateWithCi {
  const { clusters, iterations, seed } = opts;
  const n = clusters.reduce((sum, c) => sum + c.length, 0);
  const k = clusters.length;
  const numerator = clusters.reduce((sum, c) => sum + c.filter(Boolean).length, 0);
  if (n === 0) {
    return { rate: null, ciLow: null, ciHigh: null, numerator, n, prompts: 0, method: "cluster_bootstrap", tooFewDraws: true, tooFewPrompts: true };
  }
  // Never run a cluster bootstrap with fewer than 10 prompts. Use approximate Wilson instead.
  if (k < MIN_PROMPTS_FOR_CLUSTER) {
    return wilsonRate(numerator, n, n, k);
  }
  const { estimate, ciLow, ciHigh } = clusterBootstrap({ clusters, statistic: pooledRate, iterations, seed });
  const low = Number.isFinite(ciLow) ? ciLow : null;
  const high = Number.isFinite(ciHigh) ? ciHigh : null;
  // Degenerate bootstrap collapses to a zero-width interval. Fall back to Wilson, labeled approximate.
  if (low !== null && high !== null && low === high) {
    return { ...wilsonRate(numerator, n, n, k), approximate: true };
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

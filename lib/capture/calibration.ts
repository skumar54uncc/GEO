import crypto from "crypto";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { calibrationRuns, citations, draws, scans } from "@/lib/db/pg/schema";
import { wilsonInterval } from "@/lib/domain";
import { matchAliases, type AliasEntry } from "@/lib/judge/aliases";
import { planScan, type ScanEstimate } from "./batch";
import { ROUTES, type Route } from "./registry";
import type { Engine } from "./types";

export const CALIBRATION_PROMPTS_PER_ENGINE = 20;

/** Stable sample: the same month and prompt list always give the same prompts. */
export function samplePrompts(ids: string[], n: number, seed: string): string[] {
  const key = (id: string) => crypto.createHash("sha256").update(`${seed}|${id}`).digest("hex");
  return [...ids].sort((a, b) => (key(a) < key(b) ? -1 : 1)).slice(0, n);
}

export function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (!a.size && !b.size) return null;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export type Agreement = { n: number; agree: number; rate: number | null; ciLow: number | null; ciHigh: number | null };
export type MeanWithCi = { n: number; mean: number | null; ciLow: number | null; ciHigh: number | null };

export function mentionAgreement(pairs: Array<[boolean, boolean]>): Agreement {
  const agree = pairs.filter(([x, y]) => x === y).length;
  const w = wilsonInterval(agree, pairs.length);
  return { n: pairs.length, agree, rate: w.rate, ciLow: w.ci_low, ciHigh: w.ci_high };
}

/** Mean with a normal approximation 95% interval, clamped to [0, 1]. Undefined pairs (no citations on either side) are excluded. */
export function meanJaccard(values: Array<number | null>): MeanWithCi {
  const xs = values.filter((v): v is number => v !== null);
  const n = xs.length;
  if (!n) return { n: 0, mean: null, ciLow: null, ciHigh: null };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  if (n < 2) return { n, mean, ciLow: null, ciHigh: null };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const half = (1.959963984540054 * sd) / Math.sqrt(n);
  return { n, mean, ciLow: Math.max(0, mean - half), ciHigh: Math.min(1, mean + half) };
}

/** Engines with a distinct fallback (different runner or provider) to compare against. */
export function calibrationRoutes(engines: Engine[]): Route[] {
  return engines.flatMap((e) => {
    const r = ROUTES[e];
    if (!r.fallback) return [];
    const same = r.fallback.runner === r.primary.runner && r.fallback.provider === r.primary.provider;
    return same ? [] : [r.primary, r.fallback];
  });
}

/** Monthly calibration scan: 20 sampled prompts per engine, primary and fallback runner, one draw each. Needs approval. */
export async function planCalibration(
  db: Db,
  opts: { orgId: string; campaignId: string; promptSetId: string | null; promptIds: string[]; regionId: string; month: string; engines?: Engine[]; adapters?: Parameters<typeof planScan>[1]["adapters"] },
) {
  const engines = opts.engines ?? (["chatgpt", "gemini", "perplexity"] as Engine[]);
  const promptIds = samplePrompts(opts.promptIds, CALIBRATION_PROMPTS_PER_ENGINE, opts.month);
  return planScan(db, {
    orgId: opts.orgId,
    campaignId: opts.campaignId,
    promptSetId: opts.promptSetId,
    kind: "calibration",
    name: `Calibration ${opts.month}`,
    spec: { promptIds, routes: calibrationRoutes(engines), regionIds: [opts.regionId], draws: 1, canary: false },
    adapters: opts.adapters,
  });
}

/**
 * Compares primary vs fallback draws of a calibration scan, prompt by prompt. Manual paste draws for the
 * same prompts captured in the same month are compared to the primary too, in details.
 */
export async function computeCalibration(db: Db, opts: { orgId: string; scanId: string; month: string; aliases: AliasEntry[] }) {
  const [scan] = await db.select().from(scans).where(eq(scans.id, opts.scanId));
  const spec = (scan.estimate as ScanEstimate).spec;
  const rows = await db.select().from(draws).where(eq(draws.scanId, opts.scanId));
  const monthStart = new Date(`${opts.month}-01T00:00:00Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const manual = spec.promptIds.length
    ? await db
        .select()
        .from(draws)
        .where(and(eq(draws.runner, "manual_paste"), inArray(draws.promptId, spec.promptIds), gte(draws.capturedAt, monthStart), lt(draws.capturedAt, monthEnd)))
    : [];
  const all = [...rows, ...manual];
  const cits = all.length ? await db.select({ drawId: citations.drawId, domain: citations.domain }).from(citations).where(inArray(citations.drawId, all.map((r) => r.id))) : [];
  const domains = new Map<string, Set<string>>();
  for (const c of cits) {
    const s = domains.get(c.drawId) ?? new Set<string>();
    s.add(c.domain);
    domains.set(c.drawId, s);
  }
  const mentioned = (text: string) => matchAliases(text, opts.aliases).some((m) => m.entityType === "brand");

  const results = [];
  const engines = [...new Set(spec.routes.map((r) => r.engine))];
  for (const engine of engines) {
    const r = ROUTES[engine];
    if (!r.fallback) continue;
    const ok = (d: (typeof all)[number]) => d.status === "ok";
    const pick = (runner: string, promptId: string, src = rows, provider?: string) =>
      src
        .filter((d) => d.engine === engine && d.runner === runner && d.promptId === promptId && ok(d) && (provider ? d.provider === provider : true))
        .sort((a, b) => b.attempt - a.attempt)[0];
    const mentionPairs: Array<[boolean, boolean]> = [];
    const jac: Array<number | null> = [];
    const manualPairs: Array<[boolean, boolean]> = [];
    const perPrompt = [];
    for (const promptId of spec.promptIds) {
      const p = pick(r.primary.runner, promptId, rows, r.primary.provider);
      const f = pick(r.fallback.runner, promptId, rows, r.fallback.provider);
      const m = pick("manual_paste", promptId, manual);
      if (p && f) {
        const pair: [boolean, boolean] = [mentioned(p.answerText), mentioned(f.answerText)];
        mentionPairs.push(pair);
        const j = jaccard(domains.get(p.id) ?? new Set(), domains.get(f.id) ?? new Set());
        jac.push(j);
        perPrompt.push({ promptId, primaryDrawId: p.id, fallbackDrawId: f.id, primaryMention: pair[0], fallbackMention: pair[1], jaccard: j });
      }
      if (p && m) manualPairs.push([mentioned(p.answerText), mentioned(m.answerText)]);
    }
    const agreement = mentionAgreement(mentionPairs);
    const jm = meanJaccard(jac);
    const details = { agreement, jaccard: jm, primaryVsManual: mentionAgreement(manualPairs), perPrompt };
    await db.insert(calibrationRuns).values({
      orgId: opts.orgId,
      campaignId: scan.campaignId,
      scanId: opts.scanId,
      month: opts.month,
      engine,
      primaryRunner: r.primary.runner,
      fallbackRunner: r.fallback.runner,
      nPrompts: spec.promptIds.length,
      mentionPairs: agreement.n,
      mentionAgreement: agreement.rate === null ? null : String(agreement.rate),
      jaccardPairs: jm.n,
      citationJaccardMean: jm.mean === null ? null : String(jm.mean),
      details,
    });
    results.push({ engine, ...details });
  }
  return results;
}

/**
 * Scan to scan comparison (docs/METRICS.md rows 11 and 12, section 4).
 *
 * Two scans must share one frozen prompt set (else IncomparableScansError). Comparison is one series at a time:
 * engine, runner, provider, region, persona and branded flag are never pooled. A prompt is paired only when it has a
 * valid, judged draw in both scans. Won status uses the won rule independently in each scan. Tests: McNemar exact on
 * the discordant prompts, and a paired bootstrap on the pooled mention rate difference. There is no two proportion test.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { scans } from "@/lib/db/pg/schema";
import { assertScansComparable } from "@/lib/promptSets";
import { loadScanDraws, ScanOrgError, type MetricDraw } from "./load";
import { isPromptWon, mcnemarExact, pairedRateDifference } from "./stats";
import type { ComparisonDirection, ComparisonLabel } from "./types";

export type SeriesKey = {
  engine: string;
  runner: string;
  provider: string;
  regionId: string;
  personaId: string | null;
  branded: boolean;
};
export const seriesId = (k: SeriesKey) =>
  `${k.engine}|${k.runner}|${k.provider}|${k.regionId}|${k.personaId ?? "none"}|${k.branded ? "branded" : "unbranded"}`;

export type SeriesOutcomes = {
  key: SeriesKey;
  /** Prompt id to one boolean per valid draw: was the brand mentioned. */
  outcomes: Map<string, boolean[]>;
  /** Prompt id to won (strict majority: brand mentioned in at least floor(valid/2)+1 of its valid draws). */
  won: Map<string, boolean>;
};

/**
 * Groups valid draws into series and scores each prompt. Draws whose region was not honored are left out, as in
 * the region cells of the rollup.
 */
export function wonByPromptFromDraws(drawsIn: readonly MetricDraw[]): Map<string, SeriesOutcomes> {
  const out = new Map<string, SeriesOutcomes>();
  for (const d of drawsIn) {
    if (d.regionHonored === "no") continue;
    const key: SeriesKey = {
      engine: d.engine,
      runner: d.runner,
      provider: d.provider,
      regionId: d.regionId,
      personaId: d.personaId,
      branded: d.branded,
    };
    const id = seriesId(key);
    const s = out.get(id) ?? { key, outcomes: new Map<string, boolean[]>(), won: new Map<string, boolean>() };
    const list = s.outcomes.get(d.promptId) ?? [];
    list.push(d.mentions.some((m) => m.entityType === "brand"));
    s.outcomes.set(d.promptId, list);
    out.set(id, s);
  }
  for (const s of out.values()) {
    for (const [prompt, list] of s.outcomes) s.won.set(prompt, isPromptWon(list.filter(Boolean).length, list.length));
  }
  return out;
}

/** For each series, prompt id to "won", from the valid judged draws of one scan. */
export async function wonByPrompt(db: Db, scanId: string, opts: { orgId?: string } = {}): Promise<Map<string, SeriesOutcomes>> {
  const loaded = await loadScanDraws(db, { scanId, orgId: opts.orgId });
  return wonByPromptFromDraws(loaded.draws);
}

export type PresenceDifference = {
  /** Mention rate in the later scan minus mention rate in the earlier scan, pooled over paired prompts' draws. */
  estimate: number;
  ciLow: number | null;
  ciHigh: number | null;
  prompts: number;
  drawsBefore: number;
  drawsAfter: number;
  method: "paired_bootstrap";
};

export type SeriesComparison = {
  series: SeriesKey;
  /** Prompts with a valid outcome in both scans. */
  pairs: number;
  wonBefore: number;
  wonAfter: number;
  /** Won before, not after. */
  b: number;
  /** Not won before, won after. */
  c: number;
  pValue: number;
  label: ComparisonLabel;
  direction: ComparisonDirection;
  /** Null only when no prompt is paired (never returned: such series are skipped). */
  presenceDifference: PresenceDifference | null;
};

/** Pure comparison of two scans' series. Exported so tests can compare hand built draws. */
export function compareOutcomes(before: Map<string, SeriesOutcomes>, after: Map<string, SeriesOutcomes>): SeriesComparison[] {
  const out: SeriesComparison[] = [];
  for (const id of [...after.keys()].sort()) {
    const zs = after.get(id)!;
    const as = before.get(id);
    if (!as) continue;
    let pairs = 0;
    let b = 0;
    let c = 0;
    let wonBefore = 0;
    let wonAfter = 0;
    const paired: Array<{ before: boolean[]; after: boolean[] }> = [];
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
    if (pairs === 0) continue;
    const { pValue, label, direction } = mcnemarExact({ b, c });
    const diff = pairedRateDifference({ prompts: paired });
    out.push({
      series: zs.key,
      pairs,
      wonBefore,
      wonAfter,
      b,
      c,
      pValue,
      label,
      direction,
      presenceDifference: {
        estimate: diff.estimate,
        ciLow: Number.isFinite(diff.ciLow) ? diff.ciLow : null,
        ciHigh: Number.isFinite(diff.ciHigh) ? diff.ciHigh : null,
        prompts: diff.prompts,
        drawsBefore: diff.drawsBefore,
        drawsAfter: diff.drawsAfter,
        method: "paired_bootstrap",
      },
    });
  }
  return out;
}

/**
 * Compares two scans of the same frozen prompt set, one series at a time (engine, runner, provider, region and
 * branded flag are never pooled). Throws IncomparableScansError for scans on different prompt set versions.
 */
export async function compareScans(db: Db, before: string, after: string, opts: { orgId?: string } = {}): Promise<SeriesComparison[]> {
  await assertScansComparable(db, before, after);
  const [a, z] = await Promise.all([loadScanDraws(db, { scanId: before, orgId: opts.orgId }), loadScanDraws(db, { scanId: after, orgId: opts.orgId })]);
  if (a.orgId !== z.orgId) throw new ScanOrgError("Scans belong to different organizations");
  return compareOutcomes(wonByPromptFromDraws(a.draws), wonByPromptFromDraws(z.draws));
}

/** The latest earlier scan of the same campaign and frozen prompt set that finished with draws. */
export async function previousComparableScan(db: Db, scanId: string): Promise<{ id: string; createdAt: Date } | null> {
  const [cur] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!cur || !cur.promptSetId) return null;
  const [prev] = await db
    .select({ id: scans.id, createdAt: scans.createdAt })
    .from(scans)
    .where(
      and(
        eq(scans.campaignId, cur.campaignId),
        eq(scans.promptSetId, cur.promptSetId),
        eq(scans.kind, "scan"),
        inArray(scans.status, ["complete", "partial"]),
        sql`${scans.createdAt} < ${cur.createdAt}`,
      ),
    )
    .orderBy(sql`${scans.createdAt} desc`)
    .limit(1);
  return prev ?? null;
}

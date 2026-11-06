/**
 * Lost / won prompt cohorts for gap analysis (ARCHITECTURE §9 step 1, METRICS won rule).
 *
 * Rules:
 * - Uses only already-valid draws (status ok, latest attempt, non-experimental, judged;
 *   api_search requires search_used=true — enforced by loadScanDraws).
 * - Branded prompts are excluded (headline / gap series is unbranded only).
 * - Series key is engine × runner only; runners and indexes are never pooled.
 * - Won = brand mentions ≥ ceil(valid / 2) with valid ≥ 1 (isPromptWon).
 */
import type { Engine, Runner } from "@/lib/capture/types";
import { brandMentioned } from "@/lib/metrics/rollup";
import { isPromptWon } from "@/lib/metrics/stats";
import type { MetricDraw } from "@/lib/metrics/load";
import type { GapSeriesCohort, GapSeriesKey, PromptCohortRow } from "./types";

export function gapSeriesId(key: GapSeriesKey): string {
  return `${key.engine}|${key.runner}`;
}

function scorePrompt(promptId: string, draws: readonly MetricDraw[]): PromptCohortRow {
  const mentions = draws.filter(brandMentioned).length;
  const validDraws = draws.length;
  return {
    promptId,
    mentions,
    validDraws,
    won: isPromptWon(mentions, validDraws),
    drawIds: draws.map((d) => d.drawId),
  };
}

/**
 * Build per engine×runner lost (and won) cohorts from valid metric draws.
 * Branded prompts are dropped. Prompts with zero valid draws in a series are not scored.
 */
export function buildGapCohorts(drawsIn: readonly MetricDraw[]): GapSeriesCohort[] {
  const bySeries = new Map<string, { key: GapSeriesKey; byPrompt: Map<string, MetricDraw[]> }>();

  for (const d of drawsIn) {
    if (d.branded) continue;
    const key: GapSeriesKey = { engine: d.engine as Engine, runner: d.runner as Runner };
    const id = gapSeriesId(key);
    let series = bySeries.get(id);
    if (!series) {
      series = { key, byPrompt: new Map() };
      bySeries.set(id, series);
    }
    const list = series.byPrompt.get(d.promptId) ?? [];
    list.push(d);
    series.byPrompt.set(d.promptId, list);
  }

  const out: GapSeriesCohort[] = [];
  for (const { key, byPrompt } of [...bySeries.values()].sort((a, b) =>
    gapSeriesId(a.key) < gapSeriesId(b.key) ? -1 : 1,
  )) {
    const lost: PromptCohortRow[] = [];
    const won: PromptCohortRow[] = [];
    for (const promptId of [...byPrompt.keys()].sort()) {
      const draws = byPrompt.get(promptId)!;
      if (draws.length < 1) continue;
      const row = scorePrompt(promptId, draws);
      if (row.won) won.push(row);
      else lost.push(row);
    }
    out.push({
      key,
      lost,
      won,
      lostDrawIds: lost.flatMap((p) => p.drawIds),
      wonDrawIds: won.flatMap((p) => p.drawIds),
    });
  }
  return out;
}

/** Convenience: lost prompts for one engine×runner (empty if none). */
export function lostPromptsForSeries(
  drawsIn: readonly MetricDraw[],
  engine: Engine,
  runner: Runner,
): PromptCohortRow[] {
  const id = gapSeriesId({ engine, runner });
  return buildGapCohorts(drawsIn).find((c) => gapSeriesId(c.key) === id)?.lost ?? [];
}

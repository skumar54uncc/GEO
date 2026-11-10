import type { Engine, Runner } from "@/lib/capture/types";
import type { MetricDraw } from "@/lib/metrics/load";
import { displayableFromPromptsWon } from "@/lib/metrics/displayable";
import { promptsWon } from "@/lib/metrics/stats";
import type { PromptsWon } from "@/lib/metrics/types";
import type { Intent } from "@/lib/prompts/generate";
import { intentValues } from "@/lib/prompts/generate";

const brandMentioned = (d: MetricDraw) => d.mentions.some((m) => m.entityType === "brand");

/**
 * Intent × engine coverage labels (COVERAGE row 14 / P2 B4).
 * Rate = prompts won / prompts with ≥1 valid draw in the cell (same as headline prompts won).
 *
 * | Label | Condition |
 * |---|---|
 * | strong | rate ≥ 0.60 and displayable |
 * | partial | 0.20 ≤ rate < 0.60 and displayable |
 * | invisible | rate < 0.20 and displayable |
 * | suppressed | displayable rule hides the number (too few prompts/draws) |
 */
export const COVERAGE_STRONG_MIN = 0.6;
export const COVERAGE_PARTIAL_MIN = 0.2;

export type CoverageLabel = "strong" | "partial" | "invisible" | "suppressed";

export type CoverageCell = {
  intent: Intent | "untagged";
  engine: Engine;
  runner: Runner;
  won: PromptsWon;
  label: CoverageLabel;
  /** Won k of n when displayable; null when suppressed. */
  kOfN: string | null;
};

export function coverageLabelFromRate(rate: number | null, displayable: boolean): CoverageLabel {
  if (!displayable || rate == null) return "suppressed";
  if (rate >= COVERAGE_STRONG_MIN) return "strong";
  if (rate >= COVERAGE_PARTIAL_MIN) return "partial";
  return "invisible";
}

function perPromptWon(draws: readonly MetricDraw[]): PromptsWon {
  const byPrompt = new Map<string, MetricDraw[]>();
  for (const d of draws) {
    const list = byPrompt.get(d.promptId) ?? [];
    list.push(d);
    byPrompt.set(d.promptId, list);
  }
  const per = [...byPrompt.values()].map((ds) => ({
    mentions: ds.filter(brandMentioned).length,
    validDraws: ds.length,
  }));
  return promptsWon(per);
}

/** Pure: build intent × engine matrix from unbranded draws. */
export function intentEngineCoverageMatrix(draws: readonly MetricDraw[]): CoverageCell[] {
  const unbranded = draws.filter((d) => !d.branded);
  const byKey = new Map<string, { intent: Intent | "untagged"; engine: Engine; runner: Runner; draws: MetricDraw[] }>();
  for (const d of unbranded) {
    const intent: Intent | "untagged" =
      d.intent && (intentValues as readonly string[]).includes(d.intent) ? (d.intent as Intent) : "untagged";
    const key = `${intent}|${d.engine}|${d.runner}`;
    const cur = byKey.get(key) ?? { intent, engine: d.engine, runner: d.runner, draws: [] };
    cur.draws.push(d);
    byKey.set(key, cur);
  }
  const out: CoverageCell[] = [];
  for (const cell of [...byKey.values()].sort((a, b) =>
    a.intent !== b.intent
      ? String(a.intent).localeCompare(String(b.intent))
      : a.engine !== b.engine
        ? a.engine.localeCompare(b.engine)
        : a.runner.localeCompare(b.runner),
  )) {
    const won = perPromptWon(cell.draws);
    const dec = displayableFromPromptsWon(won);
    const displayable = dec.kind === "show";
    const label = coverageLabelFromRate(won.rate, displayable);
    out.push({
      intent: cell.intent,
      engine: cell.engine,
      runner: cell.runner,
      won,
      label,
      kOfN: displayable && won.won != null && won.prompts != null ? `${won.won} of ${won.prompts}` : null,
    });
  }
  return out;
}

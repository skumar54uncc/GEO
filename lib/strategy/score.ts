import type { ScoreBreakdown, ScoreFactor } from "@/lib/contracts/strategy";

/** Label used in UI and exports when demand cannot be scored. */
export const DEMAND_UNKNOWN_LABEL = "demand unknown" as const;

/**
 * Score = demand × gap size × effort.
 * Effort is an ease factor in (0, 1]: higher = easier / higher priority.
 * Missing demand is never treated as zero — callers must leave the item unscored.
 */
export function computeScore(factors: ScoreBreakdown): number | null {
  const { demand, gapSize, effort } = factors;
  if (demand.value === null) return null;
  if (gapSize.value === null || effort.value === null) return null;
  return demand.value * gapSize.value * effort.value;
}

export function demandUnknownFactor(source: string, missing: readonly string[]): ScoreFactor {
  return {
    value: null,
    source,
    n: 0,
    note: missing.length ? `not connected: ${missing.join(", ")}` : DEMAND_UNKNOWN_LABEL,
  };
}

export function scoredFactor(value: number, source: string, n: number, note?: string): ScoreFactor {
  return { value, source, n, ...(note ? { note } : {}) };
}

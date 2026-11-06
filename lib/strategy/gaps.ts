import type { GapLeverType } from "@/lib/contracts/gaps";
import type { ScoreFactor } from "@/lib/contracts/strategy";
import { scoredFactor } from "./score";

export type StrategyGapInput = {
  leverType: GapLeverType;
  /** Lost-cohort size or similar gap magnitude proxy with n. */
  gapSize: number;
  n: number;
  evidenceIds: string[];
  termLifts?: Array<{ term: string; logOddsLift: number }>;
  closestOwnedPage?: { crawlPageId: string | null; noMatchingPage: boolean };
};

export type StrategyGapsResult = {
  leverType: GapLeverType;
  gapFactor: ScoreFactor;
  evidenceIds: string[];
  headlineTerms: string[];
  notes: string[];
};

/** Phase 7 gap summary for the plan. Gap size is never invented from missing data. */
export function summarizeStrategyGaps(input: StrategyGapInput): StrategyGapsResult {
  const capped = Math.max(0, Math.min(1, input.gapSize));
  const terms = (input.termLifts ?? [])
    .slice()
    .sort((a, b) => b.logOddsLift - a.logOddsLift)
    .map((t) => t.term);
  const notes = [
    `gap lever: ${input.leverType}`,
    input.closestOwnedPage?.noMatchingPage ? "nearest page: no matching page, consider a new page" : "nearest page: matched",
  ];
  return {
    leverType: input.leverType,
    gapFactor: scoredFactor(capped, "phase7_gap_analysis", input.n),
    evidenceIds: [...input.evidenceIds],
    headlineTerms: terms,
    notes,
  };
}

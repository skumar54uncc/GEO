/**
 * Thin re-export. The scan comparison now lives in lib/metrics/compare.ts (docs/METRICS.md rows 11 and 12);
 * alerts.evaluate keeps importing it from here.
 */
export {
  compareOutcomes,
  compareScans,
  previousComparableScan,
  seriesId,
  wonByPrompt,
  wonByPromptFromDraws,
  type PresenceDifference,
  type SeriesComparison,
  type SeriesKey,
} from "@/lib/metrics/compare";

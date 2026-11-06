import type { DemandRunResult, DemandSource } from "@/lib/demand/types";
import { DEMAND_ADAPTERS } from "@/lib/demand/adapters";
import type { ScoreFactor } from "@/lib/contracts/strategy";
import { demandUnknownFactor, scoredFactor } from "./score";

/** Sources that gate the demand score. Missing any → demand unknown (never scored as zero). */
export const DEMAND_SCORE_SOURCES: DemandSource[] = ["google_trends", "search_console", "keyword_volume"];

export type StrategyDemandResult = {
  bySource: Record<string, DemandRunResult>;
  /** True when Trends, Search Console, and keywords all connected with signals. */
  demandKnown: boolean;
  demandFactor: ScoreFactor;
  risingQueries: string[];
  evidenceNotes: string[];
};

export type DemandCollector = (source: DemandSource) => Promise<DemandRunResult>;

/**
 * Collect demand for a topic. Fixture-only collectors in tests.
 * If Trends, Search Console, or keywords are not connected, demand is unknown.
 */
export async function collectStrategyDemand(opts: {
  topic: string;
  collect: DemandCollector;
}): Promise<StrategyDemandResult> {
  const bySource: Record<string, DemandRunResult> = {};
  const evidenceNotes: string[] = [];
  const risingQueries: string[] = [];
  const missing: string[] = [];
  let totalN = 0;
  let volumeSum = 0;
  let volumeParts = 0;

  for (const adapter of DEMAND_ADAPTERS) {
    const source = adapter.config.source;
    const result = await opts.collect(source);
    bySource[source] = result;
    if (!result.connected) {
      if (DEMAND_SCORE_SOURCES.includes(source)) missing.push(source);
      evidenceNotes.push(`${source}: not_connected`);
      continue;
    }
    evidenceNotes.push(`${source}: ${result.signals.length} signals`);
    totalN += result.signals.length;
    for (const signal of result.signals) {
      const value = signal.value as { query?: string; volume?: number; rising?: boolean };
      if (value.query && (value.rising || source === "paa" || source === "autocomplete")) {
        risingQueries.push(value.query);
      }
      if (typeof value.volume === "number" && Number.isFinite(value.volume)) {
        volumeSum += value.volume;
        volumeParts += 1;
      }
    }
  }

  const requiredMissing = DEMAND_SCORE_SOURCES.filter((s) => {
    const row = bySource[s];
    return !row || !row.connected;
  });

  if (requiredMissing.length) {
    return {
      bySource,
      demandKnown: false,
      demandFactor: demandUnknownFactor(requiredMissing.join("+"), requiredMissing),
      risingQueries: [...new Set(risingQueries)].sort(),
      evidenceNotes,
    };
  }

  // Normalize volume into 0..1-ish demand strength for scoring (n = signal count).
  const avg = volumeParts > 0 ? volumeSum / volumeParts : totalN > 0 ? 1 : 0;
  const normalized = Math.min(1, avg > 1 ? avg / 1000 : avg);
  return {
    bySource,
    demandKnown: true,
    demandFactor: scoredFactor(normalized, "google_trends+search_console+keyword_volume", totalN),
    risingQueries: [...new Set(risingQueries)].sort(),
    evidenceNotes,
  };
}

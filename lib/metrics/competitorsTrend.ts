import type { Engine } from "@/lib/capture/types";
import { assertSameIndex, ENGINE_INDEX, type SearchIndex } from "@/lib/metrics/indexes";
import { institutionRanks, type InstitutionRank } from "@/lib/metrics/institutions";
import type { MetricDraw } from "@/lib/metrics/load";
import type { RateWithCi } from "@/lib/metrics/types";

export type CompetitorTrendPoint = {
  scanId: string;
  createdAt: string;
  isBaseline: boolean;
  /** Us + top peers by mention share within this index (never pooled across indexes). */
  ranks: InstitutionRank[];
  /** Our SoV rate among entity-mention events (same denominator as institutionRanks). */
  usRate: number | null;
  /** Mean rate of the top 3 peers (excluding us). Null when fewer than 1 peer. */
  peerAverageRate: number | null;
};

export type CompetitorIndexSeries = {
  index: SearchIndex;
  /** Preferred engine for labeling (highest draw count in latest scan). */
  engine: Engine | null;
  trend: CompetitorTrendPoint[];
  latestGrouped: InstitutionRank[];
  peerAverageBenchmark: number | null;
};

function filterIndex(draws: readonly MetricDraw[], index: SearchIndex): MetricDraw[] {
  return draws.filter((d) => !d.branded && !d.personaId && ENGINE_INDEX[d.engine] === index);
}

/**
 * Us vs top peers SoV within one search index across scans.
 * Indexes are never pooled (ARCHITECTURE §0).
 */
export function competitorTrendForIndex(
  scans: Array<{
    scanId: string;
    createdAt: string;
    isBaseline: boolean;
    draws: readonly MetricDraw[];
  }>,
  opts: {
    index: SearchIndex;
    brandId: string;
    brandName: string;
    competitorNames: ReadonlyMap<string, string>;
    topPeers?: number;
  },
): CompetitorIndexSeries {
  const topN = opts.topPeers ?? 3;
  const trend: CompetitorTrendPoint[] = [];
  let latestEngine: Engine | null = null;
  let latestDraws = 0;

  for (const s of scans) {
    const pool = filterIndex(s.draws, opts.index);
    if (pool.length) {
      assertSameIndex(pool.map((d) => d.engine));
      const byEngine = new Map<Engine, number>();
      for (const d of pool) byEngine.set(d.engine, (byEngine.get(d.engine) ?? 0) + 1);
      const top = [...byEngine.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= latestDraws) {
        latestEngine = top[0];
        latestDraws = top[1];
      }
    }
    const ranks = institutionRanks(pool, {
      brandId: opts.brandId,
      brandName: opts.brandName,
      competitorNames: opts.competitorNames,
    });
    const us = ranks.find((r) => r.isUs) ?? null;
    const peers = ranks.filter((r) => !r.isUs).slice(0, topN);
    const peerAverageRate =
      peers.length === 0 ? null : peers.reduce((s, p) => s + p.rate, 0) / peers.length;
    trend.push({
      scanId: s.scanId,
      createdAt: s.createdAt,
      isBaseline: s.isBaseline,
      ranks: [...(us ? [us] : []), ...peers],
      usRate: us?.rate ?? null,
      peerAverageRate,
    });
  }

  const latest = trend[trend.length - 1] ?? null;
  return {
    index: opts.index,
    engine: latestEngine,
    trend,
    latestGrouped: latest?.ranks ?? [],
    peerAverageBenchmark: latest?.peerAverageRate ?? null,
  };
}

/** Peer-average benchmark for a SoV KPI card (null when no peers). */
export function peerAverageFromRanks(ranks: readonly InstitutionRank[], topPeers = 3): number | null {
  const peers = ranks.filter((r) => !r.isUs).slice(0, topPeers);
  if (!peers.length) return null;
  return peers.reduce((s, p) => s + p.rate, 0) / peers.length;
}

/** Attach peer benchmark beside an existing SoV rate for UI copy. */
export function sovWithPeerBenchmark(
  sov: RateWithCi,
  peerAverage: number | null,
): { sov: RateWithCi; peerAverage: number | null } {
  return { sov, peerAverage };
}

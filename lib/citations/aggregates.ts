import { and, count, countDistinct, eq, sql } from "drizzle-orm";
import type { Engine, Fidelity, Runner } from "@/lib/capture/types";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, citations, draws, scans } from "@/lib/db/pg/schema";
import { ENGINE_INDEX, type SearchIndex } from "@/lib/metrics/indexes";
import { wilsonInterval } from "@/lib/metrics/stats";

export type CitationBoundary = {
  orgId: string;
  campaignId: string;
  scanId?: string;
  engine: Engine;
  runner: Runner;
  fidelity: Fidelity;
  index: SearchIndex;
};

export class CitationBoundaryError extends Error {}

function rate(countValue: number, n: number) {
  const interval = wilsonInterval(countValue, n);
  return {
    count: countValue,
    n,
    rate: n ? countValue / n : 0,
    ci95: { low: interval.ci_low, high: interval.ci_high },
  };
}

/** Aggregates one explicitly bounded measurement series. It cannot accept mixed runners or indexes. */
export async function citationAggregates(db: Db, boundary: CitationBoundary) {
  if (ENGINE_INDEX[boundary.engine] !== boundary.index) {
    throw new CitationBoundaryError(
      `${boundary.engine} belongs to the ${ENGINE_INDEX[boundary.engine]} index, not ${boundary.index}.`,
    );
  }
  const filters = [
    eq(campaigns.orgId, boundary.orgId),
    eq(campaigns.id, boundary.campaignId),
    eq(draws.engine, boundary.engine),
    eq(draws.runner, boundary.runner),
    eq(draws.fidelity, boundary.fidelity),
    eq(draws.status, "ok"),
  ];
  if (boundary.scanId) filters.push(eq(draws.scanId, boundary.scanId));
  const where = and(...filters);
  const base = db
    .select({
      domain: citations.domain,
      sourceClass: citations.sourceClass,
      drawId: citations.drawId,
    })
    .from(citations)
    .innerJoin(draws, eq(citations.drawId, draws.id))
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, eq(scans.campaignId, campaigns.id))
    .where(where)
    .as("bounded_citations");

  const [totals, domains, sourceClasses] = await Promise.all([
    db
      .select({ citations: count(), draws: countDistinct(base.drawId) })
      .from(base),
    db
      .select({ value: base.domain, count: count() })
      .from(base)
      .groupBy(base.domain)
      .orderBy(sql`count(*) desc`, base.domain),
    db
      .select({ value: base.sourceClass, count: count() })
      .from(base)
      .groupBy(base.sourceClass)
      .orderBy(sql`count(*) desc`, base.sourceClass),
  ]);
  const n = totals[0]?.citations ?? 0;

  return {
    boundary: {
      campaignId: boundary.campaignId,
      scanId: boundary.scanId ?? null,
      engine: boundary.engine,
      runner: boundary.runner,
      fidelity: boundary.fidelity,
      index: boundary.index,
    },
    n: { citations: n, drawsWithCitations: totals[0]?.draws ?? 0 },
    domains: domains.map((row) => ({ domain: row.value, ...rate(row.count, n) })),
    sourceClasses: sourceClasses.map((row) => ({ sourceClass: row.value, ...rate(row.count, n) })),
  };
}

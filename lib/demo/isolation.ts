import { and, eq, sql } from "drizzle-orm";
import { DEMO_SEED_MARKER } from "@/lib/contracts/demoSeed";
import type { Db } from "@/lib/db/pg/client";
import {
  campaigns,
  citations,
  costLedger,
  draws,
  judgeRuns,
  rawPayloads,
  recommendations,
  scans,
  strategyReports,
} from "@/lib/db/pg/schema";

export type DemoSeedCounts = {
  draws: number;
  rawPayloads: number;
  citations: number;
  judgeRuns: number;
  recommendations: number;
  strategyReports: number;
  costLedger: number;
};

/** Row-level counts of demo-seed-marked rows scoped to one organization. */
export async function countDemoSeedRowsForOrg(db: Db, orgId: string): Promise<DemoSeedCounts> {
  const [drawRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(draws)
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, eq(scans.campaignId, campaigns.id))
    .where(and(eq(campaigns.orgId, orgId), eq(draws.seedMarker, DEMO_SEED_MARKER)));

  const [payloadRow] = await db
    .select({ n: sql<number>`count(distinct ${rawPayloads.sha256})::int` })
    .from(rawPayloads)
    .innerJoin(draws, eq(draws.rawPayloadId, rawPayloads.sha256))
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, eq(scans.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.orgId, orgId),
        sql`(${rawPayloads.seedMarker} = ${DEMO_SEED_MARKER} OR ${draws.seedMarker} = ${DEMO_SEED_MARKER})`,
      ),
    );

  const [citationRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(citations)
    .innerJoin(draws, eq(citations.drawId, draws.id))
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, eq(scans.campaignId, campaigns.id))
    .where(and(eq(campaigns.orgId, orgId), eq(draws.seedMarker, DEMO_SEED_MARKER)));

  const [judgeRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(judgeRuns)
    .innerJoin(draws, eq(judgeRuns.drawId, draws.id))
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, eq(scans.campaignId, campaigns.id))
    .where(and(eq(campaigns.orgId, orgId), eq(draws.seedMarker, DEMO_SEED_MARKER)));

  const [recRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(recommendations)
    .innerJoin(campaigns, eq(recommendations.campaignId, campaigns.id))
    .where(and(eq(campaigns.orgId, orgId), eq(recommendations.seedMarker, DEMO_SEED_MARKER)));

  const [strategyRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(strategyReports)
    .innerJoin(campaigns, eq(strategyReports.campaignId, campaigns.id))
    .where(and(eq(campaigns.orgId, orgId), eq(strategyReports.seedMarker, DEMO_SEED_MARKER)));

  const [ledgerRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(costLedger)
    .where(and(eq(costLedger.orgId, orgId), eq(costLedger.seedMarker, DEMO_SEED_MARKER)));

  return {
    draws: drawRow.n,
    rawPayloads: payloadRow.n,
    citations: citationRow.n,
    judgeRuns: judgeRow.n,
    recommendations: recRow.n,
    strategyReports: strategyRow.n,
    costLedger: ledgerRow.n,
  };
}

export function assertZeroDemoSeedRows(counts: DemoSeedCounts, orgLabel: string): void {
  const offenders = Object.entries(counts).filter(([, n]) => n > 0);
  if (offenders.length) {
    throw new Error(
      `${orgLabel} contains demo seed rows: ${offenders.map(([k, n]) => `${k}=${n}`).join(", ")}. Marker=${DEMO_SEED_MARKER}`,
    );
  }
}

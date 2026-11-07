import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, draws, scans } from "@/lib/db/pg/schema";

export type GoldLabelSampleRow = {
  drawId: string;
  scanId: string;
  engine: string;
  runner: string;
  provider: string;
  promptId: string;
  drawIndex: number;
  status: string;
  answerPreview: string;
};

/** 50 random ok/empty draws from a scan (org-scoped). For hand-labeling per docs/EVALS.md. */
export async function sampleDrawsForGoldLabels(db: Db, orgId: string, scanId: string, limit = 50): Promise<GoldLabelSampleRow[]> {
  const [owned] = await db
    .select({ id: scans.id })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(eq(scans.id, scanId), eq(campaigns.orgId, orgId)));
  if (!owned) throw new Error("Scan not found");

  const rows = await db
    .select({
      drawId: draws.id,
      scanId: draws.scanId,
      engine: draws.engine,
      runner: draws.runner,
      provider: draws.provider,
      promptId: draws.promptId,
      drawIndex: draws.drawIndex,
      status: draws.status,
      answerPreview: sql<string>`left(${draws.answerText}, 200)`,
    })
    .from(draws)
    .where(and(eq(draws.scanId, scanId), sql`${draws.status} in ('ok', 'empty')`))
    .orderBy(sql`random()`)
    .limit(limit);

  return rows;
}

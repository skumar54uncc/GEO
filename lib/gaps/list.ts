import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, recommendations } from "@/lib/db/pg/schema";

export type GapRecommendationRow = {
  id: string;
  kind: string;
  leverType: string | null;
  owner: string | null;
  evidenceGrade: string | null;
  status: string;
  payload: unknown;
  evidence: unknown;
  targetPromptIds: string[];
  baselineScanId: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export async function listCampaignGaps(
  db: Db,
  opts: { orgId: string; campaignId: string },
): Promise<{ recommendations: GapRecommendationRow[] }> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)));
  if (!campaign) return { recommendations: [] };

  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.campaignId, opts.campaignId))
    .orderBy(desc(recommendations.createdAt));

  return {
    recommendations: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      leverType: r.leverType,
      owner: r.owner,
      evidenceGrade: r.evidenceGrade,
      status: r.status,
      payload: r.payload,
      evidence: r.evidence,
      targetPromptIds: r.targetPromptIds,
      baselineScanId: r.baselineScanId,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

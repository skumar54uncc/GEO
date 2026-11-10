import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import {
  citedPagesShareFromPayload,
  gapTitleFromPayload,
  leverTypeToLabel,
  parseGapEvidence,
  sharedAmongSummary,
  suggestedActionFromPayload,
  type CitedPagesShareTable,
} from "@/lib/gaps/display";
import { campaigns, prompts, recommendations } from "@/lib/db/pg/schema";

export type GapRecommendationRow = {
  id: string;
  kind: string;
  leverType: string | null;
  /** Plain-language lever for leadership views. */
  leverLabel: string | null;
  owner: string | null;
  evidenceGrade: string | null;
  status: string;
  payload: unknown;
  evidence: unknown;
  targetPromptIds: string[];
  /** Full prompt text for each target id, same order as `targetPromptIds`. */
  lostQuestionTexts: string[];
  /** Derived human title (no raw enum keys). */
  displayTitle: string;
  suggestedAction: string | null;
  sharedAmongCitedPages: string | null;
  sharedAmongCitedPagesN: number | null;
  /** Structured B2 share table when present on the payload. */
  citedPagesShare: CitedPagesShareTable | null;
  evidenceCount: number;
  evidenceItems: Array<{ detail: string; url?: string }>;
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

  const allTargetIds = [...new Set(rows.flatMap((r) => r.targetPromptIds))];
  const textById = new Map<string, string>();
  if (allTargetIds.length) {
    const promptRows = await db.select({ id: prompts.id, text: prompts.text }).from(prompts).where(inArray(prompts.id, allTargetIds));
    for (const p of promptRows) textById.set(p.id, p.text);
  }

  return {
    recommendations: rows.map((r) => {
      const { items, count } = parseGapEvidence(r.evidence);
      const shared = sharedAmongSummary(r.payload);
      return {
        id: r.id,
        kind: r.kind,
        leverType: r.leverType,
        leverLabel: leverTypeToLabel(r.leverType),
        owner: r.owner,
        evidenceGrade: r.evidenceGrade,
        status: r.status,
        payload: r.payload,
        evidence: r.evidence,
        targetPromptIds: r.targetPromptIds,
        lostQuestionTexts: r.targetPromptIds.map((id) => textById.get(id) ?? "(Prompt text unavailable.)"),
        displayTitle: gapTitleFromPayload(r.payload, r.kind),
        suggestedAction: suggestedActionFromPayload(r.payload),
        sharedAmongCitedPages: shared.text,
        sharedAmongCitedPagesN: shared.n,
        citedPagesShare: citedPagesShareFromPayload(r.payload),
        evidenceCount: count,
        evidenceItems: items,
        baselineScanId: r.baselineScanId,
        publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  };
}

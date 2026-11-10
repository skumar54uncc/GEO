import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError, getCampaign } from "@/lib/campaigns";
import type { Db } from "@/lib/db/pg/client";
import { campaignAnnotations } from "@/lib/db/pg/schema";

export const ANNOTATION_KINDS = ["press_release", "campaign_launch", "content_launch"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const annotationKindLabel: Record<AnnotationKind, string> = {
  press_release: "Press release",
  campaign_launch: "Campaign launch",
  content_launch: "Content launch",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const annotationInput = z.object({
  kind: z.enum(ANNOTATION_KINDS),
  occurred_on: isoDate,
  note: z.string().trim().min(1).max(2000),
});

export type AnnotationRow = typeof campaignAnnotations.$inferSelect;

export async function listCampaignAnnotations(db: Db, orgId: string, campaignId: string): Promise<AnnotationRow[]> {
  await getCampaign(db, orgId, campaignId);
  return db
    .select()
    .from(campaignAnnotations)
    .where(eq(campaignAnnotations.campaignId, campaignId))
    .orderBy(desc(campaignAnnotations.occurredOn), desc(campaignAnnotations.createdAt));
}

export async function createCampaignAnnotation(
  db: Db,
  opts: { orgId: string; campaignId: string; userId: string | null; input: unknown },
): Promise<AnnotationRow> {
  await getCampaign(db, opts.orgId, opts.campaignId);
  const parsed = annotationInput.safeParse(opts.input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [row] = await db
    .insert(campaignAnnotations)
    .values({
      campaignId: opts.campaignId,
      kind: parsed.data.kind,
      occurredOn: parsed.data.occurred_on,
      note: parsed.data.note,
      createdBy: opts.userId,
    })
    .returning();
  return row;
}

export async function deleteCampaignAnnotation(
  db: Db,
  opts: { orgId: string; campaignId: string; id: string },
): Promise<void> {
  await getCampaign(db, opts.orgId, opts.campaignId);
  const deleted = await db
    .delete(campaignAnnotations)
    .where(and(eq(campaignAnnotations.id, opts.id), eq(campaignAnnotations.campaignId, opts.campaignId)))
    .returning({ id: campaignAnnotations.id });
  if (!deleted.length) throw new NotFoundError("Annotation not found.");
}

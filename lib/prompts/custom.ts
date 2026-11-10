import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
import { loadAliases } from "@/lib/judge/aliases";
import { isBrandedPrompt } from "@/lib/prompts/branded";
import { dedupeAgainstCampaign } from "@/lib/prompts/dedupe";
import { createLocalEmbedder, DEFAULT_COSINE_THRESHOLD, type Embedder } from "@/lib/prompts/embeddings";
import { intentValues, similarToNote, verifiedDemandEvidence, type Intent } from "@/lib/prompts/generate";
import { PromptNotFoundError, PromptValidationError } from "@/lib/prompts/review";

export const customPromptInput = z.object({
  text: z.string().trim().min(1).max(8000),
  intent: z.enum(intentValues),
  persona_id: z.string().uuid().nullable().optional(),
  branded: z.boolean(),
  demand_evidence_ids: z.array(z.string().uuid()).optional(),
});
export type CustomPromptInput = z.infer<typeof customPromptInput>;

const INTENT_FUNNEL: Record<Intent, string> = {
  discovery: "awareness",
  comparison: "consideration",
  evaluation: "consideration",
  decision: "decision",
};

/** Editor-authored draft. Never auto-approved; must be approved then frozen before scans. */
export async function createCustomPrompt(
  db: Db,
  opts: {
    orgId: string;
    campaignId: string;
    raw: unknown;
    authorId: string;
    embedder?: Embedder;
  },
): Promise<typeof prompts.$inferSelect> {
  const parsed = customPromptInput.safeParse(opts.raw);
  if (!parsed.success) throw new PromptValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;

  const [campaign] = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId, settings: campaigns.settings })
    .from(campaigns)
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)));
  if (!campaign) throw new PromptNotFoundError("Campaign not found");
  if ((campaign.settings as { legacy?: boolean } | null)?.legacy) {
    throw new PromptValidationError("Legacy campaign prompts are not editable here");
  }

  if (input.persona_id) {
    const [p] = await db.select({ id: personas.id }).from(personas).where(eq(personas.id, input.persona_id));
    if (!p) throw new PromptValidationError("Persona not found.");
  }

  const aliases = await loadAliases(db, opts.orgId, campaign.brandId);
  const computedBranded = isBrandedPrompt(input.text, aliases);
  // Honor the editor flag when they mark branded; never clear a computed brand hit.
  const branded = input.branded || computedBranded;

  const embedder = opts.embedder ?? (await createLocalEmbedder());
  const existing = await db
    .select({ text: prompts.text, embedding: prompts.embedding })
    .from(prompts)
    .where(eq(prompts.campaignId, campaign.id));
  const deduped = await dedupeAgainstCampaign([{ text: input.text }], existing, embedder, DEFAULT_COSINE_THRESHOLD);
  const similar = deduped.dropped[0];
  const note = similar ? similarToNote(similar.matchedText) : null;
  const embedding = deduped.kept[0]?.embedding ?? null;

  const demandEvidence = await verifiedDemandEvidence(db, campaign.id, input.demand_evidence_ids);

  const [row] = await db
    .insert(prompts)
    .values({
      campaignId: campaign.id,
      text: input.text,
      personaId: input.persona_id ?? null,
      intent: input.intent,
      funnelStage: INTENT_FUNNEL[input.intent],
      branded,
      provenance: "custom",
      authorId: opts.authorId,
      demandEvidence,
      status: "draft",
      note,
      embedding,
      embeddingModel: embedding ? embedder.model : null,
      embeddingDimension: embedding ? embedder.dimension : null,
    })
    .returning();
  return row;
}

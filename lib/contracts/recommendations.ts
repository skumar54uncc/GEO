import { z } from "zod";
import { CORRELATION_LABEL, gapLeverTypeSchema } from "./gaps";

export const EVIDENCE_GRADES = ["A", "B", "C", "D"] as const;
export const evidenceGradeSchema = z.enum(EVIDENCE_GRADES);

export const recommendationItemKindSchema = z.enum([
  "headline_term",
  "faq",
  "format",
  "target_page",
  "third_party_source",
]);

export const recommendationEvidenceRowSchema = z
  .object({
    id: z.uuid(),
    drawId: z.uuid(),
    citationIds: z.array(z.uuid()).min(1),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

export const recommendationCardItemSchema = z
  .object({
    kind: recommendationItemKindSchema,
    text: z.string().trim().min(1),
    evidenceIds: z.array(z.uuid()).min(1),
  })
  .strict();

export const recommendationCardSchema = z
  .object({
    leverType: gapLeverTypeSchema,
    owner: z.string().trim().min(1),
    evidenceGrade: evidenceGradeSchema,
    label: z.literal(CORRELATION_LABEL),
    evidence: z.array(recommendationEvidenceRowSchema).min(1),
    items: z.array(recommendationCardItemSchema).min(1),
    headlineTerms: z.array(z.string().trim().min(1)),
    faqs: z.array(z.string().trim().min(1)),
    format: z.string().trim().min(1),
    targetUrl: z.string().url().nullable(),
    thirdPartySources: z.array(z.string().trim().min(1)),
  })
  .strict()
  .superRefine((card, context) => {
    const known = new Set(card.evidence.map((row) => row.id));
    for (const [index, item] of card.items.entries()) {
      for (const [eIndex, evidenceId] of item.evidenceIds.entries()) {
        if (!known.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "evidenceIds", eIndex],
            message: `evidence id ${evidenceId} is not in card.evidence`,
          });
        }
      }
    }
  });

export type EvidenceGrade = z.infer<typeof evidenceGradeSchema>;
export type RecommendationEvidenceRow = z.infer<typeof recommendationEvidenceRowSchema>;
export type RecommendationCardItem = z.infer<typeof recommendationCardItemSchema>;
export type RecommendationCard = z.infer<typeof recommendationCardSchema>;

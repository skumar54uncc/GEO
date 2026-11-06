import { z } from "zod";

export const GAP_LEVER_TYPES = [
  "technical",
  "on_page",
  "truth_layer",
  "listing",
  "earned_media",
  "community",
  "original_data",
] as const;

export const CORRELATION_LABEL = "correlation, not cause" as const;
export const MIN_CITED_PAGES_PER_COHORT = 10;

export const gapLeverTypeSchema = z.enum(GAP_LEVER_TYPES);

const cohortSchema = z
  .object({
    citedPageIds: z.array(z.uuid()).min(MIN_CITED_PAGES_PER_COHORT),
  })
  .strict();

const termLiftSchema = z
  .object({
    term: z.string().trim().min(1),
    won: z
      .object({
        matches: z.number().int().nonnegative(),
        n: z.number().int().min(MIN_CITED_PAGES_PER_COHORT),
      })
      .strict(),
    lost: z
      .object({
        matches: z.number().int().nonnegative(),
        n: z.number().int().min(MIN_CITED_PAGES_PER_COHORT),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ won, lost }, context) => {
    if (won.matches > won.n) {
      context.addIssue({ code: "custom", path: ["won", "matches"], message: "matches cannot exceed n" });
    }
    if (lost.matches > lost.n) {
      context.addIssue({ code: "custom", path: ["lost", "matches"], message: "matches cannot exceed n" });
    }
  });

export const gapAnalysisSchema = z
  .object({
    campaignId: z.uuid(),
    leverType: gapLeverTypeSchema,
    label: z.literal(CORRELATION_LABEL),
    cohorts: z
      .object({
        won: cohortSchema,
        lost: cohortSchema,
      })
      .strict(),
    termLifts: z.array(termLiftSchema),
    evidenceIds: z.array(z.uuid()).min(1),
  })
  .strict()
  .superRefine(({ cohorts, termLifts }, context) => {
    for (const [index, term] of termLifts.entries()) {
      if (term.won.n > cohorts.won.citedPageIds.length) {
        context.addIssue({
          code: "custom",
          path: ["termLifts", index, "won", "n"],
          message: "term n cannot exceed the won cohort size",
        });
      }
      if (term.lost.n > cohorts.lost.citedPageIds.length) {
        context.addIssue({
          code: "custom",
          path: ["termLifts", index, "lost", "n"],
          message: "term n cannot exceed the lost cohort size",
        });
      }
    }
  });

export type GapLeverType = z.infer<typeof gapLeverTypeSchema>;
export type GapAnalysis = z.infer<typeof gapAnalysisSchema>;

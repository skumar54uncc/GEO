import { z } from "zod";
import { gapLeverTypeSchema } from "./gaps";
import { canonicalPersonaKeySchema } from "./personas";
import { evidenceGradeSchema } from "./recommendations";

/** One scored factor: value may be null when the source is not connected. */
export const scoreFactorSchema = z
  .object({
    value: z.number().finite().nullable(),
    source: z.string().trim().min(1),
    n: z.number().int().nonnegative(),
    note: z.string().optional(),
  })
  .strict();

export const scoreBreakdownSchema = z
  .object({
    demand: scoreFactorSchema,
    gapSize: scoreFactorSchema,
    effort: scoreFactorSchema,
  })
  .strict();

export const strategyItemStatusSchema = z.enum(["scored", "demand_unknown"]);

export const strategyEvidenceRowSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["demand", "landscape", "supply", "gap", "citation", "seasonal"]),
    note: z.string().trim().min(1),
    refIds: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const strategyItemSchema = z
  .object({
    id: z.uuid(),
    topic: z.string().trim().min(1),
    persona: canonicalPersonaKeySchema,
    promptCluster: z.string().trim().min(1),
    format: z.string().trim().min(1),
    headlineTerms: z.array(z.string().trim().min(1)).min(1),
    faqs: z.array(z.string().trim().min(1)),
    targetUrl: z.string().url().nullable(),
    thirdPartySources: z.array(z.string().trim().min(1)),
    owner: z.string().trim().min(1),
    publishBy: z.iso.date(),
    seasonalEventId: z.uuid(),
    leverType: gapLeverTypeSchema,
    evidenceGrade: evidenceGradeSchema,
    evidenceIds: z.array(z.uuid()).min(1),
    /** Null when demand is unknown — item lives in the unscored list. */
    score: z.number().finite().nullable(),
    scoreStatus: strategyItemStatusSchema,
    factors: scoreBreakdownSchema,
    /** Frozen at creation. Edits change `factors` / `score` only. */
    originalFactors: scoreBreakdownSchema,
    originalScore: z.number().finite().nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.scoreStatus === "demand_unknown") {
      if (item.score !== null) {
        context.addIssue({ code: "custom", path: ["score"], message: "demand_unknown items must have score null" });
      }
      if (item.factors.demand.value !== null) {
        context.addIssue({
          code: "custom",
          path: ["factors", "demand", "value"],
          message: "demand_unknown items must keep demand.value null",
        });
      }
    } else if (item.score === null) {
      context.addIssue({ code: "custom", path: ["score"], message: "scored items require a numeric score" });
    }
  });

export const offsiteOpportunitySchema = z
  .object({
    domain: z.string().trim().min(1),
    sourceClass: z.string().trim().min(1),
    peerCitationCount: z.number().int().nonnegative(),
    ourCitationCount: z.number().int().nonnegative(),
    exampleUrls: z.array(z.string().url()).max(5),
    n: z.number().int().nonnegative(),
  })
  .strict();

export const strategyReportOutputSchema = z
  .object({
    pipeline: z.tuple([
      z.literal("demand"),
      z.literal("landscape"),
      z.literal("supply"),
      z.literal("gaps"),
      z.literal("plan"),
    ]),
    scoredItems: z.array(strategyItemSchema),
    unscoredItems: z.array(strategyItemSchema),
    offsite: z.array(offsiteOpportunitySchema),
    evidence: z.array(strategyEvidenceRowSchema).min(1),
  })
  .strict()
  .superRefine((output, context) => {
    const known = new Set(output.evidence.map((row) => row.id));
    const check = (items: z.infer<typeof strategyItemSchema>[], path: string) => {
      for (const [index, item] of items.entries()) {
        for (const [eIndex, evidenceId] of item.evidenceIds.entries()) {
          if (!known.has(evidenceId)) {
            context.addIssue({
              code: "custom",
              path: [path, index, "evidenceIds", eIndex],
              message: `evidence id ${evidenceId} is not in report.evidence`,
            });
          }
        }
      }
    };
    check(output.scoredItems, "scoredItems");
    check(output.unscoredItems, "unscoredItems");
  });

export const strategyReportInputsSchema = z
  .object({
    topic: z.string().trim().min(1),
    campaignId: z.uuid(),
    inputsHash: z.string().regex(/^[a-f0-9]{64}$/),
    demand: z.record(z.string(), z.unknown()),
    landscape: z.record(z.string(), z.unknown()),
    supply: z.record(z.string(), z.unknown()),
    gaps: z.record(z.string(), z.unknown()),
    calendar: z.record(z.string(), z.unknown()),
  })
  .strict();

export const strategyReportSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    topic: z.string().trim().min(1),
    inputs: strategyReportInputsSchema,
    output: strategyReportOutputSchema,
    createdBy: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type ScoreFactor = z.infer<typeof scoreFactorSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type StrategyItem = z.infer<typeof strategyItemSchema>;
export type StrategyEvidenceRow = z.infer<typeof strategyEvidenceRowSchema>;
export type OffsiteOpportunity = z.infer<typeof offsiteOpportunitySchema>;
export type StrategyReportOutput = z.infer<typeof strategyReportOutputSchema>;
export type StrategyReportInputs = z.infer<typeof strategyReportInputsSchema>;
export type StrategyReport = z.infer<typeof strategyReportSchema>;

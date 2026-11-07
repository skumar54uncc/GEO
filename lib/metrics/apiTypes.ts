/**
 * Strict shared types for metrics API responses. Prefer these over ad-hoc inline types.
 * Missing values are null — never silently coerced to 0 in typed payloads.
 */
import { z } from "zod";

export const RateWithCiSchema = z.object({
  rate: z.number().nullable(),
  ciLow: z.number().nullable(),
  ciHigh: z.number().nullable(),
  n: z.number().int().nonnegative(),
  numerator: z.number().int().nonnegative().optional(),
  prompts: z.number().int().nonnegative().nullable().optional(),
  method: z.string().optional(),
  tooFewDraws: z.boolean(),
  tooFewPrompts: z.boolean().optional(),
  approximate: z.boolean().optional(),
});

export const PromptsWonSchema = z.object({
  won: z.number().int().nonnegative(),
  prompts: z.number().int().nonnegative(),
  rate: z.number().nullable(),
  ciLow: z.number().nullable(),
  ciHigh: z.number().nullable(),
  draws: z.number().int().nonnegative(),
  method: z.string(),
  rule: z.string(),
  tooFewDraws: z.boolean(),
  tooFewPrompts: z.boolean().optional(),
  approximate: z.boolean().optional(),
});

export const OverviewHeadlineSchema = z.object({
  engine: z.string(),
  runner: z.string(),
  fidelity: z.string(),
  won: z.number().int().nonnegative().nullable(),
  prompts: z.number().int().nonnegative().nullable(),
  ciLow: z.number().nullable(),
  ciHigh: z.number().nullable(),
  draws: z.number().int().nonnegative(),
  tooFewDraws: z.boolean(),
  tooFewPrompts: z.boolean(),
  approximate: z.boolean(),
});

export type OverviewHeadline = z.infer<typeof OverviewHeadlineSchema>;

export const OverviewCampaignCardSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string(),
  topic: z.string(),
  status: z.string(),
  legacy: z.boolean(),
  latestScan: z
    .object({
      id: z.string().uuid(),
      createdAt: z.string(),
      legacyMethod: z.boolean(),
      scanStatus: z.string(),
    })
    .nullable(),
  promptSetHash: z.string().nullable(),
  headlines: z.array(OverviewHeadlineSchema),
  openRecommendations: z.number().int().nonnegative(),
  partial: z.boolean(),
  unjudgedCount: z.number().int().nonnegative(),
  emptyReason: z.string().nullable(),
});

export type OverviewCampaignCardDto = z.infer<typeof OverviewCampaignCardSchema>;

/** Parse and reject silent shape drift. */
export function parseOverviewCampaigns(payload: unknown): OverviewCampaignCardDto[] {
  const wrapped = z.object({ campaigns: z.array(OverviewCampaignCardSchema) }).safeParse(payload);
  if (!wrapped.success) throw new Error(`Overview API shape invalid: ${wrapped.error.message}`);
  return wrapped.data.campaigns;
}

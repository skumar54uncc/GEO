import { z } from "zod";
import { canonicalPersonaKeySchema } from "./personas";

export const strategyItemSchema = z
  .object({
    id: z.uuid(),
    persona: canonicalPersonaKeySchema,
    promptCluster: z.string().trim().min(1),
    format: z.string().trim().min(1),
    headlineTerms: z.array(z.string().trim().min(1)).min(1),
    faqs: z.array(z.string().trim().min(1)),
    owner: z.string().trim().min(1),
    publishBy: z.iso.date(),
    seasonalEventId: z.uuid(),
    score: z.number().finite(),
    evidenceIds: z.array(z.uuid()).min(1),
  })
  .strict();

export const strategyReportSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    topic: z.string().trim().min(1),
    items: z.array(strategyItemSchema).min(1),
  })
  .strict();

export type StrategyItem = z.infer<typeof strategyItemSchema>;
export type StrategyReport = z.infer<typeof strategyReportSchema>;

import { z } from "zod";

export const ENGINES = [
  "chatgpt",
  "gemini",
  "claude",
  "perplexity",
  "google_aio",
  "google_ai_mode",
] as const;

export const RUNNERS = [
  "ui_provider",
  "serp_provider",
  "api_search",
  "api_parametric",
  "manual_paste",
] as const;

export const FIDELITIES = ["high", "medium", "low"] as const;

export const engineSchema = z.enum(ENGINES);
export const runnerSchema = z.enum(RUNNERS);
export const fidelitySchema = z.enum(FIDELITIES);

export const interval95Schema = z
  .object({
    level: z.literal(0.95),
    low: z.number().min(0).max(1),
    high: z.number().min(0).max(1),
  })
  .strict()
  .refine(({ low, high }) => low <= high, {
    message: "95% interval low must not exceed high",
  });

/**
 * A measurement always identifies one engine and one runner. Arrays and
 * aggregate labels are intentionally absent so API and presentation callers
 * cannot represent pooled runner or engine series with this contract.
 */
export const measurementMetadataSchema = z
  .object({
    n: z.number().int().positive(),
    interval95: interval95Schema,
    engine: engineSchema,
    runner: runnerSchema,
    fidelity: fidelitySchema,
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const rateMeasurementSchema = measurementMetadataSchema
  .extend({
    rate: z.number().min(0).max(1),
  })
  .strict()
  .refine(
    ({ rate, interval95 }) => rate >= interval95.low && rate <= interval95.high,
    { message: "rate must fall inside its 95% interval" },
  );

export type Engine = z.infer<typeof engineSchema>;
export type Runner = z.infer<typeof runnerSchema>;
export type Fidelity = z.infer<typeof fidelitySchema>;
export type MeasurementMetadata = z.infer<typeof measurementMetadataSchema>;
export type RateMeasurement = z.infer<typeof rateMeasurementSchema>;

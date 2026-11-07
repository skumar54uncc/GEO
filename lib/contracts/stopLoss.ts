import { z } from "zod";

export const STOP_LOSS_CONFIG = {
  firstDrawWindow: 60,
  errorOrBlockedRateThreshold: 0.2,
  estimateCostOverrunThreshold: 0.25,
} as const;

export const stopLossConfigSchema = z
  .object({
    firstDrawWindow: z.literal(STOP_LOSS_CONFIG.firstDrawWindow),
    errorOrBlockedRateThreshold: z.literal(STOP_LOSS_CONFIG.errorOrBlockedRateThreshold),
    estimateCostOverrunThreshold: z.literal(STOP_LOSS_CONFIG.estimateCostOverrunThreshold),
  })
  .strict();

export const stopLossTriggerSchema = z.enum([
  "first_60_error_or_blocked_rate",
  "estimate_cost_overrun",
]);

export const stopLossStateSchema = z
  .object({
    firstWindowObserved: z.number().int().min(0).max(STOP_LOSS_CONFIG.firstDrawWindow),
    firstWindowErrorsOrBlocked: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().positive(),
    actualCostUsd: z.number().nonnegative(),
    paused: z.boolean(),
    triggers: z.array(stopLossTriggerSchema),
  })
  .strict()
  .superRefine((state, context) => {
    if (state.firstWindowErrorsOrBlocked > state.firstWindowObserved) {
      context.addIssue({
        code: "custom",
        path: ["firstWindowErrorsOrBlocked"],
        message: "errors or blocked cannot exceed observed draws",
      });
    }

    const evaluated = evaluateStopLoss(state);
    if (state.paused !== evaluated.paused || state.triggers.join(",") !== evaluated.triggers.join(",")) {
      context.addIssue({
        code: "custom",
        message: "paused and triggers must match the configured stop-loss evaluation",
      });
    }
  });

type StopLossInputs = Pick<
  z.input<typeof stopLossStateSchema>,
  "firstWindowObserved" | "firstWindowErrorsOrBlocked" | "estimatedCostUsd" | "actualCostUsd"
>;

export function evaluateStopLoss(inputs: StopLossInputs) {
  const triggers: Array<z.infer<typeof stopLossTriggerSchema>> = [];

  if (
    inputs.firstWindowObserved === STOP_LOSS_CONFIG.firstDrawWindow &&
    inputs.firstWindowErrorsOrBlocked / STOP_LOSS_CONFIG.firstDrawWindow >
      STOP_LOSS_CONFIG.errorOrBlockedRateThreshold
  ) {
    triggers.push("first_60_error_or_blocked_rate");
  }

  if (
    inputs.actualCostUsd >
    inputs.estimatedCostUsd * (1 + STOP_LOSS_CONFIG.estimateCostOverrunThreshold)
  ) {
    triggers.push("estimate_cost_overrun");
  }

  return {
    ...inputs,
    paused: triggers.length > 0,
    triggers,
  } as const;
}

export type StopLossConfig = z.infer<typeof stopLossConfigSchema>;
export type StopLossTrigger = z.infer<typeof stopLossTriggerSchema>;
export type StopLossState = z.infer<typeof stopLossStateSchema>;

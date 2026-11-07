import { MIN_PROMPTS_FOR_CLUSTER, TOO_FEW_DRAWS } from "@/lib/metrics/stats";

/**
 * Single suppression rule for every rate / prompts-won figure in the UI.
 * Prefer "too few prompts" over "too few answers" when both apply.
 * Components must not invent their own thresholds.
 */
export type DisplayableInput = {
  /** Prompt count k when known (prompts won, cluster rates). */
  prompts?: number | null;
  /** Answer / draw count n (or entity-draw n for share of voice). */
  n: number;
  tooFewPrompts?: boolean;
  tooFewDraws?: boolean;
};

export type DisplayableDecision =
  | { kind: "show" }
  | { kind: "too_few_prompts"; k: number; message: string }
  | { kind: "too_few_answers"; n: number; message: string };

export function displayable(input: DisplayableInput): DisplayableDecision {
  const k = input.prompts ?? null;
  const tooFewPrompts =
    input.tooFewPrompts === true || (k !== null && k > 0 && k < MIN_PROMPTS_FOR_CLUSTER);
  if (tooFewPrompts) {
    const prompts = k ?? 0;
    return { kind: "too_few_prompts", k: prompts, message: `Too few prompts (k=${prompts})` };
  }
  const tooFewAnswers = input.tooFewDraws === true || input.n < TOO_FEW_DRAWS;
  if (tooFewAnswers) {
    return { kind: "too_few_answers", n: input.n, message: `Too few answers (n=${input.n})` };
  }
  return { kind: "show" };
}

/** Convenience for RateWithCi / PromptsWon shaped objects. */
export function displayableFromRate(r: {
  n: number;
  prompts?: number | null;
  tooFewPrompts?: boolean;
  tooFewDraws?: boolean;
}): DisplayableDecision {
  return displayable({
    n: r.n,
    prompts: r.prompts,
    tooFewPrompts: r.tooFewPrompts,
    tooFewDraws: r.tooFewDraws,
  });
}

export function displayableFromPromptsWon(w: {
  prompts: number;
  draws: number;
  tooFewPrompts?: boolean;
  tooFewDraws?: boolean;
}): DisplayableDecision {
  return displayable({
    n: w.draws,
    prompts: w.prompts,
    tooFewPrompts: w.tooFewPrompts,
    tooFewDraws: w.tooFewDraws,
  });
}

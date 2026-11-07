import type { AliasEntry } from "@/lib/judge/aliases";
import { matchAliases } from "@/lib/judge/aliases";

/** Default generation and review warn when unbranded share would fall below this. */
export const MIN_UNBRANDED_SHARE = 0.7;

/**
 * Location-biased prompts name a brand alias or the city. They are stored in the
 * `branded` column and excluded from headline numbers (separate series).
 * Unlike answer mention detection, city aliases that require context (e.g. "Charlotte")
 * DO count here, because naming the city tilts geographic answers.
 */
export function isLocationBiasedPrompt(text: string, aliases: AliasEntry[]): boolean {
  const brandAliases = aliases
    .filter((a) => a.entityType === "brand")
    .map((a) => ({ ...a, requiresContext: false }));
  return matchAliases(text, brandAliases).some((m) => m.entityType === "brand");
}

/** @deprecated Prefer isLocationBiasedPrompt; kept for call sites that still say "branded". */
export function isBrandedPrompt(text: string, aliases: AliasEntry[]): boolean {
  return isLocationBiasedPrompt(text, aliases);
}

export type BrandedShare = {
  total: number;
  branded: number;
  unbranded: number;
  unbrandedShare: number;
  /** True when there is at least one prompt and unbranded share is under 70%. */
  warning: boolean;
  warningMessage: string | null;
};

export function brandedShare(prompts: Array<{ branded: boolean }>): BrandedShare {
  const total = prompts.length;
  const branded = prompts.reduce((n, p) => n + (p.branded ? 1 : 0), 0);
  const unbranded = total - branded;
  const unbrandedShare = total === 0 ? 1 : unbranded / total;
  const warning = total > 0 && unbrandedShare < MIN_UNBRANDED_SHARE;
  return {
    total,
    branded,
    unbranded,
    unbrandedShare,
    warning,
    warningMessage: warning
      ? `Unbranded share is ${(unbrandedShare * 100).toFixed(0)}% (below the ${(MIN_UNBRANDED_SHARE * 100).toFixed(0)}% default).`
      : null,
  };
}

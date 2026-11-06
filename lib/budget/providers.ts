import type { ProviderId } from "@/lib/capture/registry";
import { ROUTES } from "@/lib/capture/registry";

export type ProviderBudgetRole = "active" | "calibration" | "blocked";

export type BudgetProviderMeta = {
  id: ProviderId;
  displayName: string;
  role: ProviderBudgetRole;
  note: string | null;
};

/** Providers that appear on Budget: active routes + named calibration/blocked entries. */
export const BUDGET_PROVIDER_META: BudgetProviderMeta[] = [
  { id: "dataforseo", displayName: "DataForSEO", role: "active", note: null },
  { id: "serpapi", displayName: "SerpAPI", role: "active", note: null },
  { id: "perplexity", displayName: "Perplexity", role: "active", note: "Fallback route only." },
  { id: "local_serp", displayName: "Local SERP", role: "active", note: "Parity gate only; counts as high fidelity after parity passes." },
  { id: "openai", displayName: "OpenAI", role: "calibration", note: "calibration only" },
  { id: "anthropic", displayName: "Anthropic", role: "calibration", note: "calibration only" },
  { id: "gemini", displayName: "Gemini", role: "calibration", note: "calibration only" },
  { id: "brightdata", displayName: "Bright Data", role: "blocked", note: "not used (blocked by IT)" },
];

/** Provider IDs that appear on a primary, fallback, parametric, or parity route. */
export function activeRouteProviderIds(): Set<ProviderId> {
  const ids = new Set<ProviderId>();
  for (const r of Object.values(ROUTES)) {
    for (const route of [r.primary, r.fallback, r.parametric, ...r.parity]) {
      if (route) ids.add(route.provider);
    }
  }
  return ids;
}

export function providerDisplayName(id: string): string {
  return BUDGET_PROVIDER_META.find((p) => p.id === id)?.displayName ?? id;
}

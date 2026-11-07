import type { ProviderId } from "@/lib/capture/registry";
import { ROUTES, createAdapter } from "@/lib/capture/registry";
import { CHARLOTTE_REGION } from "@/lib/capture/regions";
import type { Engine } from "@/lib/capture/types";

/**
 * Leadership-facing budget roles. Exactly one role per provider row.
 * Fallback / calibration / parity providers are $0 on estimates unless scheduled.
 */
export type ProviderBudgetRole =
  | "active"
  | "parity_check"
  | "fallback"
  | "calibration"
  | "blocked";

export type BudgetProviderMeta = {
  id: ProviderId;
  displayName: string;
  role: ProviderBudgetRole;
  /** Short role label shown in the table (one per row). */
  roleLabel: string;
};

export const BUDGET_PROVIDER_META: BudgetProviderMeta[] = [
  { id: "dataforseo", displayName: "DataForSEO", role: "active", roleLabel: "active" },
  { id: "serpapi", displayName: "SerpAPI", role: "parity_check", roleLabel: "parity check only" },
  { id: "local_serp", displayName: "Local SERP", role: "parity_check", roleLabel: "parity check only" },
  { id: "perplexity", displayName: "Perplexity", role: "fallback", roleLabel: "fallback only" },
  { id: "openai", displayName: "OpenAI", role: "calibration", roleLabel: "calibration only" },
  { id: "anthropic", displayName: "Anthropic", role: "calibration", roleLabel: "calibration only" },
  { id: "gemini", displayName: "Gemini", role: "calibration", roleLabel: "calibration only" },
  { id: "brightdata", displayName: "Bright Data", role: "blocked", roleLabel: "not used (blocked by IT)" },
];

const DRAWS = 3;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Cost of one draw on each primary route, keyed by provider.
 * Only primary routes are scheduled for the pilot / steady-state estimate.
 * Fallback, calibration, and parity providers get $0.
 */
export function primaryRouteUsdPerDrawByProvider(): Record<ProviderId, number | null> {
  const out = Object.fromEntries(BUDGET_PROVIDER_META.map((m) => [m.id, 0 as number | null])) as Record<
    ProviderId,
    number | null
  >;
  const region = {
    id: "estimate",
    label: CHARLOTTE_REGION.label,
    country: CHARLOTTE_REGION.country,
    state: CHARLOTTE_REGION.state,
    city: CHARLOTTE_REGION.city,
    language: CHARLOTTE_REGION.language,
    serpLocation: CHARLOTTE_REGION.serpLocation,
    latitude: Number(CHARLOTTE_REGION.latitude),
    longitude: Number(CHARLOTTE_REGION.longitude),
    timezone: CHARLOTTE_REGION.timezone,
  };
  for (const engine of Object.keys(ROUTES) as Engine[]) {
    const route = ROUTES[engine].primary;
    const adapter = createAdapter(route.provider);
    const est = adapter.estimate({
      drawId: "estimate-only",
      engine: route.engine,
      runner: route.runner,
      prompt: "estimate",
      region,
      drawIndex: 1,
    });
    if (est.usd === null) {
      out[route.provider] = null;
      continue;
    }
    const prev = out[route.provider];
    if (prev === null) continue;
    out[route.provider] = round4(prev + est.usd);
  }
  return out;
}

/** Provider share for N prompts × 3 draws on primary routes only. */
export function providerShareForPrompts(
  prompts: number,
  perDrawByProvider: Record<ProviderId, number | null>,
): Record<ProviderId, number | null> {
  const out = {} as Record<ProviderId, number | null>;
  for (const meta of BUDGET_PROVIDER_META) {
    if (meta.role !== "active") {
      out[meta.id] = 0;
      continue;
    }
    const perDraw = perDrawByProvider[meta.id];
    out[meta.id] = perDraw === null ? null : round4(perDraw * DRAWS * prompts);
  }
  return out;
}

export function providerDisplayName(id: string): string {
  return BUDGET_PROVIDER_META.find((p) => p.id === id)?.displayName ?? id;
}

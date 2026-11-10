import { createAnthropicAdapter } from "./adapters/anthropic";
import type { AdapterDeps } from "./adapters/common";
import { createDataForSeoAdapter } from "./adapters/dataforseo";
import { createGeminiAdapter } from "./adapters/gemini";
import { createLocalSerpAdapter } from "./adapters/localSerp";
import { createOpenAiAdapter } from "./adapters/openai";
import { createPerplexityAdapter } from "./adapters/perplexity";
import { createSerpApiAdapter } from "./adapters/serpapi";
import type { Engine, ProviderAdapter, Runner } from "./types";

export const PROVIDER_IDS = ["dataforseo", "openai", "anthropic", "perplexity", "gemini", "serpapi", "local_serp"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Route = { engine: Engine; runner: Runner; provider: ProviderId };

/**
 * Approved routes (docs/PROVIDERS.md section 7). Primary is the measurement series; fallback is a
 * separate series (calibration or outage), never averaged with primary. API series are never labeled UI.
 */
export const ROUTES: Record<Engine, { primary: Route; fallback: Route | null; parametric: Route | null; parity: Route[] }> = {
  chatgpt: {
    primary: { engine: "chatgpt", runner: "ui_provider", provider: "dataforseo" },
    fallback: { engine: "chatgpt", runner: "api_search", provider: "openai" },
    parametric: { engine: "chatgpt", runner: "api_parametric", provider: "dataforseo" },
    parity: [],
  },
  gemini: {
    primary: { engine: "gemini", runner: "ui_provider", provider: "dataforseo" },
    fallback: { engine: "gemini", runner: "api_search", provider: "gemini" },
    parametric: { engine: "gemini", runner: "api_parametric", provider: "dataforseo" },
    parity: [],
  },
  perplexity: {
    // Campus IT bans third-party Perplexity UI scrapers. DataForSEO has no Perplexity UI scraper;
    // sonar via LLM Responses is the approved medium-fidelity primary. Never label these draws as UI.
    primary: { engine: "perplexity", runner: "api_search", provider: "dataforseo" },
    fallback: { engine: "perplexity", runner: "api_search", provider: "perplexity" },
    parametric: { engine: "perplexity", runner: "api_parametric", provider: "dataforseo" },
    parity: [],
  },
  claude: {
    // Approved 2026-11-04: DataForSEO LLM Responses with web_search (medium). Anthropic kept for calibration only.
    primary: { engine: "claude", runner: "api_search", provider: "dataforseo" },
    fallback: { engine: "claude", runner: "api_search", provider: "anthropic" },
    parametric: { engine: "claude", runner: "api_parametric", provider: "dataforseo" },
    parity: [],
  },
  google_aio: {
    primary: { engine: "google_aio", runner: "serp_provider", provider: "dataforseo" },
    fallback: { engine: "google_aio", runner: "serp_provider", provider: "serpapi" },
    parametric: null,
    parity: [
      { engine: "google_aio", runner: "serp_provider", provider: "serpapi" },
      { engine: "google_aio", runner: "serp_provider", provider: "local_serp" },
    ],
  },
  google_ai_mode: {
    primary: { engine: "google_ai_mode", runner: "serp_provider", provider: "dataforseo" },
    fallback: null,
    parametric: null,
    parity: [],
  },
};

export function createAdapter(id: ProviderId, deps: AdapterDeps = {}): ProviderAdapter {
  switch (id) {
    case "dataforseo":
      return createDataForSeoAdapter(deps);
    case "openai":
      return createOpenAiAdapter(deps);
    case "anthropic":
      return createAnthropicAdapter(deps);
    case "perplexity":
      return createPerplexityAdapter(deps);
    case "gemini":
      return createGeminiAdapter(deps);
    case "serpapi":
      return createSerpApiAdapter(deps);
    case "local_serp":
      return createLocalSerpAdapter(deps);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

export function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(v);
}

/** Every approved (engine, runner, provider) combination, for the capture test page. */
export function allRoutes(): Route[] {
  const out: Route[] = [];
  const seen = new Set<string>();
  for (const r of Object.values(ROUTES)) {
    for (const route of [r.primary, r.fallback, r.parametric, ...r.parity]) {
      if (!route) continue;
      const k = `${route.engine}|${route.runner}|${route.provider}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(route);
      }
    }
  }
  return out;
}

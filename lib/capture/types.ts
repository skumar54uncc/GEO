export const ENGINES = ["chatgpt", "gemini", "claude", "perplexity", "google_aio", "google_ai_mode"] as const;
export type Engine = (typeof ENGINES)[number];

export const RUNNERS = ["ui_provider", "serp_provider", "api_search", "api_parametric", "manual_paste"] as const;
export type Runner = (typeof RUNNERS)[number];

export type Fidelity = "high" | "medium" | "low";
export type RegionHonored = "yes" | "no" | "unknown";
export type DrawStatus = "ok" | "empty" | "error" | "blocked";

/**
 * UI, SERP and manual paste show what users see: high. API with search is a different product than
 * the consumer UI: medium. API without browsing is the model's memory, a separate series: low.
 */
export function fidelityFor(runner: Runner): Fidelity {
  if (runner === "api_search") return "medium";
  if (runner === "api_parametric") return "low";
  return "high";
}

export type Region = {
  id: string;
  label: string;
  country: string | null;
  state: string | null;
  city: string | null;
  language: string | null;
  serpLocation: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

export interface CaptureRequest {
  drawId: string;
  engine: Engine;
  runner: Runner;
  prompt: string;
  region: Region;
  drawIndex: number;
}

export type CaptureCitation = {
  url: string;
  position: number;
  linked: boolean;
  title?: string | null;
  spanStart?: number | null;
  spanEnd?: number | null;
  /** Set when the URL is a redirect that hides the source domain (Gemini grounding). */
  domain?: string | null;
};

export interface CaptureResult {
  status: DrawStatus;
  answerText: string;
  citations: CaptureCitation[];
  fanoutQueries: string[];
  modelBuild: string | "unknown";
  regionHonored: RegionHonored;
  /** Stored to raw_payloads as is. */
  raw: unknown;
  costUnits: number;
  /** Null when the provider's price for this call cannot be computed. */
  costUsd: number | null;
  latencyMs: number;
  error?: string;
  /** Google organic results returned in the same call (SERP providers), stored to serp_snapshots. */
  organic?: Array<{ position: number; url: string; domain: string; title: string | null }>;
  /** Google AI Overview only. Same meaning as status ok, empty, error, blocked; named for the AIO report. */
  aioState?: AioState;
  /**
   * Whether the provider used web search for this answer. Null when not applicable (UI scrape, SERP, manual).
   * Phase 5 metrics count api_search draws only when this is true.
   */
  searchUsed?: boolean | null;
}

export type AioState = "shown" | "not_shown" | "failed" | "blocked";

export function aioStateFor(status: DrawStatus): AioState {
  return status === "ok" ? "shown" : status === "empty" ? "not_shown" : status === "blocked" ? "blocked" : "failed";
}

export type Estimate = { units: number; usd: number | null; note?: string };

export interface ProviderAdapter {
  id: string;
  supports(engine: Engine, runner: Runner): boolean;
  /** Upper bound for one draw, used by the cost guard before any call. */
  estimate(req: CaptureRequest): Estimate;
  /** Never throws. Network errors, 4xx, 5xx and malformed bodies become status "error" or "blocked". */
  capture(req: CaptureRequest): Promise<CaptureResult>;
  /** Missing keys or settings, in words. Empty when the adapter can run. */
  missingConfig(): string[];
}

export function errorResult(error: string, opts: { raw?: unknown; latencyMs?: number; status?: DrawStatus; costUsd?: number | null; costUnits?: number } = {}): CaptureResult {
  return {
    status: opts.status ?? "error",
    answerText: "",
    citations: [],
    fanoutQueries: [],
    modelBuild: "unknown",
    regionHonored: "unknown",
    searchUsed: null,
    raw: opts.raw ?? null,
    costUnits: opts.costUnits ?? 0,
    costUsd: opts.costUsd === undefined ? 0 : opts.costUsd,
    latencyMs: opts.latencyMs ?? 0,
    error,
  };
}

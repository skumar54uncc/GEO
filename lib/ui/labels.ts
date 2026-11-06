/**
 * Leadership-facing labels. Never show ui_provider / api_search jargon on screens.
 * Technical ids stay available inside “How this is measured.”
 */

export const RUNNER_PLAIN: Record<string, string> = {
  ui_provider: "collected from the real app",
  serp_provider: "collected from a search results page",
  api_search: "collected through the model's API (with web search)",
  api_parametric: "collected through the model's API (no browsing)",
  manual_paste: "pasted by hand",
};

export const FIDELITY_PLAIN: Record<string, string> = {
  high: "closest to what a person sees",
  medium: "useful, but not identical to the consumer app",
  low: "parametric or limited — treat carefully",
};

export const ENGINE_PLAIN: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google_aio: "Google AI Overview",
  google_ai_mode: "Google AI Mode",
};

export function runnerPlain(runner: string): string {
  return RUNNER_PLAIN[runner] ?? runner;
}

export function fidelityPlain(fidelity: string): string {
  return FIDELITY_PLAIN[fidelity] ?? fidelity;
}

export function enginePlain(engine: string): string {
  return ENGINE_PLAIN[engine] ?? engine;
}

/** Short hash for captions (first 8 of sha256). */
export function shortHash(sha256: string | null | undefined): string {
  if (!sha256) return "unknown";
  return sha256.slice(0, 8);
}

export function formatScanDate(iso: string | Date | null | undefined): string {
  if (!iso) return "unknown date";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "unknown date";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** “AI answers checked” instead of “draws”. */
export function answersChecked(n: number): string {
  return `${n} AI answer${n === 1 ? "" : "s"} checked`;
}

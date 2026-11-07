/**
 * Leadership-facing labels. Never show ui_provider / api_search jargon on screens.
 * Runner technical ids in “How this is measured” are editor/admin-only when SessionRoleContext is present.
 */

import { PERSONA_LIBRARY } from "@/lib/personas/library";

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
  low: "parametric or limited, treat carefully",
};

/** Display name for a persona key from the taxonomy library, falling back to the stored name. */
export function personaTaxonomyLabel(key: string | null | undefined, storedName?: string | null): string | null {
  if (!key && !storedName) return null;
  if (!key) return storedName ?? null;
  const def = PERSONA_LIBRARY.find((p) => p.dbKey === key);
  return def?.name ?? storedName ?? key;
}

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

/** Plain-language name for a search index (chat vs google); used on citations and partial notices. */
export function searchIndexPlain(index: string): string {
  if (index === "chat") return "Chat engines";
  if (index === "google") return "Google AI surfaces";
  return index.replace(/_/g, " ");
}

const SOURCE_CLASS_PLAIN: Record<string, string> = {
  owned: "Our site",
  competitor: "Peer or competitor",
  editorial: "News or editorial",
  gov: "Government",
  ranking: "Rankings or lists",
  forum: "Forums or community",
  other: "Other",
};

/** Plain label for a citation source class token. */
export function sourceClassPlain(sourceClass: string): string {
  return SOURCE_CLASS_PLAIN[sourceClass] ?? sourceClass.replace(/_/g, " ");
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

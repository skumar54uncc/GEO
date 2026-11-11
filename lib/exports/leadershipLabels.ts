import type { Engine, Runner } from "@/lib/capture/types";

/** Plain-language engine names for leadership PDFs (never raw enum keys alone). */
export const ENGINE_LABEL: Record<Engine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  google_ai_mode: "Google AI Mode",
  google_aio: "Google AI Overviews",
  perplexity: "Perplexity",
};

/** Plain-language runner / fidelity labels for leadership PDFs. */
export const RUNNER_LABEL: Record<Runner, string> = {
  ui_provider: "Captured from the consumer app",
  api_search: "API with web search (medium fidelity)",
  serp_provider: "Captured from Google results",
  api_parametric: "API without browsing (parametric)",
  manual_paste: "Manual paste",
};

export function engineLabel(engine: string): string {
  return ENGINE_LABEL[engine as Engine] ?? engine;
}

export function runnerLabel(runner: string): string {
  return RUNNER_LABEL[runner as Runner] ?? runner;
}

export function fidelityLabel(runner: string): string {
  return runnerLabel(runner);
}

/** From docs/METRICS.md row 1 — do not invent a new definition. */
export const WON_DEFINITION =
  "A prompt is won when the university is named in a strict majority of that prompt's answers (for example, at least 2 of 3).";

export const DEMO_PDF_BANNER =
  "Demo data. Fictional university and peers. Not UNC Charlotte results.";

export const ACCURACY_PROVISIONAL_LABEL =
  "Provisional until the 20-answer hand check is complete.";

const DIRECTION_WORDS =
  /\b(improved|declined|rose|fell|gained|lost|improvement|decline|increase[sd]?|decrease[sd]?)\b/i;

/** Reject direction language when McNemar trend is within noise. */
export function assertAnalystNoteFitsTrend(text: string, trendLabel: string | null): void {
  if (trendLabel !== "within noise") return;
  if (DIRECTION_WORDS.test(text)) {
    throw new Error(
      'Analyst note must not claim a direction (improved, declined, rose, fell, gained, lost) when the trend is "within noise".',
    );
  }
}

export function analystNoteAllowedForPdf(text: string, trendLabel: string | null, status: "draft" | "published" | null): boolean {
  if (status !== "published") return false;
  try {
    assertAnalystNoteFitsTrend(text, trendLabel);
    return true;
  } catch {
    return false;
  }
}

export function pctWhole(x: number | null): string {
  if (x == null) return "unknown";
  return `${Math.round(x * 100)}%`;
}

export function ciRange(ciLow: number | null, ciHigh: number | null): string | null {
  if (ciLow == null || ciHigh == null) return null;
  return `${pctWhole(ciLow)} to ${pctWhole(ciHigh)}`;
}

export function promptUnitLabel(prompts: number, drawsPerPrompt = 3): string {
  return `${prompts} prompts, ${drawsPerPrompt} answers each`;
}

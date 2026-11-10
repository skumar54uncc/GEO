/**
 * Prices verified on the providers' own pages on 2026-11-03 (docs/PROVIDERS.md). Estimates of tokens per
 * call are assumptions, used only as an upper bound before a call; the actual cost comes from the response.
 */
export const PRICES_CHECKED_ON = "2026-11-03";

export const DATAFORSEO = {
  llmScraper: { standard: 0.0012, live: 0.004 },
  aiMode: { standard: 0.0012, live: 0.004 },
  organic: { standard: 0.0006, live: 0.002 },
  /** load_async_ai_overview adds one base price; refunded when no async overview is present. */
  llmResponsesTask: { standard: 0.0002, live: 0.0006 },
} as const;

/** Per tool call. Anthropic and OpenAI: $10 per 1,000. Perplexity standard web_search: $2.50 per 1,000. */
export const SEARCH_CALL_USD = { anthropic: 0.01, openai: 0.01, perplexity: 0.0025, gemini: 0.014 } as const;

/** USD per 1M tokens, input and output, standard tier. Unknown models have no entry: cost is null. */
export const TOKEN_RATES: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "gpt-6-astra": { in: 10, out: 50 },
  "gpt-6.1-sol": { in: 2, out: 10 },
  "gpt-6-sol": { in: 2, out: 10 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "perplexity/sonar": { in: 0.25, out: 2.5 },
  // Through 2026-12-31; doubles on 2027-01-01.
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
};

export function tokenUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const rate = TOKEN_RATES[model];
  if (!rate) return null;
  return (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000;
}

/** Upper bound assumptions per answer for token billed APIs. */
export const TOKEN_ASSUMPTIONS = {
  anthropic: { searches: 3, input: 25_000, output: 1_200 },
  openai: { searches: 2, input: 10_000, output: 1_200 },
  perplexity: { searches: 2, input: 8_000, output: 1_000 },
  gemini: { searches: 3, input: 3_000, output: 1_200 },
  parametric: { input: 300, output: 1_200 },
} as const;

export function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

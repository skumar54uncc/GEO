# Phase 3 prompt: Capture layer (most important)

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode.

Goal: measure what real users see, labeled honestly, for ChatGPT, Claude, Google AI Overview, Google AI Mode, Gemini, and Perplexity.

## Step 0: providers (stop for approval)

Recheck every row of `docs/PROVIDERS.md` with web search: provider exists, method (UI capture, SERP, API with search, API without browsing), location support, price per call, terms notes. Update the date and tags. Specifically confirm or mark unknown: DataForSEO LLM Scraper (ChatGPT, Gemini), DataForSEO AI Mode and AI Overview, a UI provider for Perplexity, Bright Data, Anthropic web search pricing, OpenAI web search pricing, Perplexity Sonar pricing. **Ask for approval before coding adapters.**

## Build

1. **Adapter interface** exactly as ARCHITECTURE 5.1 (`supports`, `estimate`, `capture` that never throws). Registry by provider id.
2. **SerpAPI adapter** from the existing `lib/serpapi.ts`. Fix the known issue: `draw_index` in the cache key, `no_cache=true` for measurement draws, so 3 draws are 3 real captures. AI Overview state recorded explicitly (shown, not shown, failed, blocked).
3. **Adapters** for each approved provider: UI providers for ChatGPT and Gemini, SERP providers for AI Overview and AI Mode, API with search for Claude, Perplexity, and the ChatGPT and Gemini fallbacks, API parametric (no browsing) for the monthly sample. Each stores the raw payload, model build (or "unknown"), region honored, cost, latency.
4. **Local SERP adapter** (`provider = local_serp`), configured by `SERPAPI_BASE_URL`. Disabled unless `parity-report.md` exists, passed, and is less than 35 days old. Its draws are labeled experimental until then.
5. **Regions.** Region rows (country, state, city, language, serp_location). SERP providers get native location. APIs get approximate location where supported. Record `region_honored` yes, no, unknown per ARCHITECTURE 5.4.
6. **Cost guard** generalized for every provider: estimate per draw, per scan cap, monthly cap from `provider_accounts`, ledger rows per call. No automatic retries. A "retry failed draws" action shows cost first.
7. **Judge extension.** Deterministic alias matching first (aliases with `requires_context` never match alone). Judge returns strict JSON with character spans for mentions, citations, claims, list position, prominence, and sentiment with its justifying span. One repair call. Raw output stored. `judge_prompt_version` bumped.
8. **Fan out.** Store `fanout_queries` from provider fields or visible UI. For each new fan out query, fetch organic results into `serp_snapshots` (budgeted).
9. **Calibration job** (monthly): 20 prompts per engine, primary and fallback runner, plus manual paste where available. Store mention agreement and citation domain Jaccard with n.
10. **Canary.** One fixed prompt per engine before every scan. If the parser cannot find the expected structure, the scan for that engine is refused and an alert is raised.
11. **Manual paste** stays for every engine, runner `manual_paste`, fidelity high.
12. **Screen.** Settings: providers with status, last canary, budget used. A capture test page: pick prompt, engine, region, run one draw, see the raw payload and parsed result.

## Tests

Each adapter against recorded fixtures (never live in CI). `capture` never throws on network error, 4xx, 5xx, malformed JSON. Cost guard refuses over budget. Draw index changes the cache key. Alias matcher on "Charlotte" city traps. Judge JSON repair path. Calibration math.

## Do not

Build our own logged in automation of any chat UI. Label an API answer as a UI answer. Use a local model to produce engine answers. Retry paid calls automatically.

## Verification gate

1. Typecheck, lint, tests pass.
2. A live dry run: 3 prompts × 6 engines × 3 draws × 1 region, with the estimate shown and approved first. Paste the per engine status counts, runner, fidelity, and actual cost vs estimate.
3. The 3 draws of one prompt on one engine are distinct raw payloads.
4. Every draw has runner, fidelity, region honored, and model build or "unknown".
5. Old legacy draws still render.

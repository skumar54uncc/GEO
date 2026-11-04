# Providers and Budget

Rechecked on **2026-11-03** (Phase 3, step 0) with web search and the providers' own pages. The previous pass was 2026-10-21.

- **[V]** means verified on the provider's own pricing or docs page on 2026-11-03.
- **[E]** means an estimate. The assumption is written next to it.
- **unknown** means nobody could confirm it from public pages. The row says how to find out.

Adapters are coded only for rows approved by the project owner. Approval status is recorded in section 7.

---

## 1. Paid providers for engine capture

| Provider | Engines | Runner | Location | Price per call | Notes |
|---|---|---|---|---|---|
| DataForSEO LLM Scraper | ChatGPT, Gemini only [V] | ui_provider | `location_code` / `location_name` from a per engine locations list, plus language [V]. Country is shown in the docs example (2840 = United States). Whether state or city codes exist: **unknown**. Check `GET /v3/ai_optimization/chat_gpt/llm_scraper/locations` once an account exists (the list endpoint is part of the API) | $0.0012 standard queue (up to 45 min), $0.0024 priority (up to 5 min), $0.004 live [V]. Billed per task set [V] | `force_web_search` flag exists, but the docs say web sources are not guaranteed even when it is on [V]. Collection method: scrapes what the interface shows. Logged in or logged out: **unknown**. Ask DataForSEO support before use |
| DataForSEO Google AI Mode SERP | Google AI Mode | serp_provider | Any location and language, desktop or mobile [V] | $0.0012 standard (~5 min avg, 45 min target), $0.0024 priority, $0.004 live (~6 s) [V] | One request is one AI Mode page [V] |
| DataForSEO Google Organic SERP with `load_async_ai_overview` | Google AI Overview, organic, PAA | serp_provider | Any location, language, device; these do not change the price [V] | $0.0006 standard, $0.0012 priority, $0.002 live per SERP. `load_async_ai_overview` adds one base price, so AIO costs 2x base: $0.0012 standard [V] | Candidate replacement for SerpAPI on AIO. Needs a side by side test before switching |
| SerpAPI (existing) | Google AI Overview, organic, PAA, Trends fallback, autocomplete | serp_provider | `location`, `uule`, `gl`, `hl` (existing code) | Free 250/mo, Starter $25 for 1,000, Developer $75 for 5,000, Production $150 for 15,000 [V] | Only successful, non cached searches count [V]. When AIO comes back as a `page_token`, the follow up `google_ai_overview` call is a second search, and the token expires within about 1 minute [V]. Measurement draws must send `no_cache=true` [V] |
| Bright Data AI scrapers | ChatGPT, Perplexity, Gemini, Google AI Mode, Copilot [V] | ui_provider | `country` field per request [V]. ChatGPT also takes `geolocation` (lat,long) [V]. City or state for Perplexity and Gemini: **unknown**. Ask Bright Data or test | $1.50 per 1,000 successfully delivered records pay as you go; 5,000 free records per month, shared across the whole account [V]. Scale plan $499/mo [V] | **The only UI provider found for Perplexity.** Stated collection: "automated requests", "only publicly available data", KYC and acceptable use review [V]. Logged in or logged out: **unknown**. Needs procurement or legal review (ARCHITECTURE 5.2) |
| OpenAI Responses API, `web_search` tool | ChatGPT fallback, calibration | api_search | `user_location` approximate: country, region, city, timezone [V] | $10 per 1,000 tool calls plus search content tokens at model rates [V]. Model token rates: not read in this pass, check the OpenAI pricing page for the chosen model | Not what ChatGPT users see. Medium fidelity |
| Anthropic Messages API, `web_search` tool | Claude (primary) | api_search | `user_location` approximate: city, region, country, timezone [V] | $10 per 1,000 searches plus tokens; search results count as input tokens; failed searches not billed [V]. Sonnet 5.5: $2 in / $10 out per MTok. Haiku 5.5: see the Anthropic pricing page [V] | Which model claude.ai serves to a logged out or free user: **unknown**. Record the model ID we call as `model_build` |
| Perplexity Agent API, `web_search` tool | Perplexity fallback | api_search | `user_location` on the tool: country (required with lat/long), region, city, latitude, longitude [V] | `web_search` $0.0025 per call standard, $0.001 fast [V]. `perplexity/sonar` tokens $0.25 in / $2.50 out per MTok [V] | **Sonar Chat Completions support ended 2026-09-27** [V]. New work must use the Agent API (`POST /v1/agent`). Web search is not automatic; it must be offered and can be forced with `tool_choice` [V] |
| Perplexity Search API | Not an engine answer. Ranked results only | none | Country bias [V] | $5 per 1,000 requests, $1 per 1,000 fast [V] | Not used for capture. Possible input for fan out SERP checks |
| Gemini API, Grounding with Google Search | Gemini fallback, calibration | api_search | `toolConfig.retrievalConfig.latLng` [V]. City name: no | Gemini 3 and newer: **billed per search query the model runs**, 5,000 free per month, then $14 per 1,000. Default cap 1,500 grounded requests per day per project [V]. Gemini 2.5: $35 per 1,000 grounded prompts after 1,500 RPD free [V] | Changed from the 2026-10-21 note (it was per prompt). One prompt can cost several queries |
| DataForSEO LLM Responses | API parametric series (ChatGPT, Claude, Gemini, Perplexity) [V] | api_parametric | n/a | $0.0002 + $0.01 refundable advance per task (standard, up to 72 h), or $0.0006 live, plus the LLM's own token cost [V] | Alternative to calling each vendor's API directly for the parametric sample |
| Fireworks (existing judge) | Judging answers | none | n/a | Token priced [E]. Not rechecked in this pass | About $3 to $10 per scan at 1,800 judge calls [E] |

## 2. Paid providers for demand data (Phase 4, not built now)

| Provider | Price | Notes |
|---|---|---|
| DataForSEO Google Ads search volume | $0.06 per task standard (1 to 3 h), $0.09 live; up to 1,000 keywords per task [V] | Exact volumes [V per vendor claim] |
| DataForSEO AI Keyword Search Volume | $0.01 per task plus $0.0001 per row, live only [V] | Proprietary model built from People Also Ask data [V]. Label it as modeled, not observed |
| Exa | $10 free credits each month (up to 2,500 lite searches). `/search` lite $4 per 1K, auto $7 per 1K, `/answer` $5 per 1K [V] | |

## 3. Free Google and public APIs

| API | Why it matters | Access needed | Status in this repo |
|---|---|---|---|
| Google Search Console API | Real queries that bring people to charlotte.edu | Property access from the web team | Not connected |
| GA4 Data API | AI referral traffic (chatgpt.com, perplexity.ai, gemini.google.com) | Property access from the web team | Not connected |
| Google Trends API (alpha) | Demand and seasonality | Application. Approval status: unknown | Not connected |
| Google Ads Keyword Planner | Keyword volume ranges | A Google Ads account | Not connected |
| Knowledge Graph Search API | How Google's entity graph describes UNC Charlotte | API key (`GOOGLE_KG_API_KEY`) | Wired in Phase 2 entity check |
| PageSpeed Insights API | Page health inside the site audit | API key (`PAGESPEED_API_KEY`) | Wired in Phase 2 audit |
| Bing Webmaster Tools API | Bing's index feeds several AI assistants | Site verification | Not connected |
| College Scorecard API | Peer suggestions, program data | api.data.gov key (`DATA_GOV_API_KEY`) | Wired in Phase 2 peers |
| IPEDS data files | Carnegie class, enrollment, peers | None | Used via Urban Institute API in Phase 2 |
| Wikidata and Wikipedia APIs | Entity consistency | None | Wired in Phase 2 |
| crt.sh | Subdomain discovery | None. Be polite | Wired in Phase 2 |

## 4. Budget for the default campaign

Assumptions: 100 prompts, 6 engines, 3 draws, 1 region (Charlotte, US), a scan every two weeks. That is 300 draws per engine per scan.

| Item | Per scan | Per month (2 scans) |
|---|---|---|
| ChatGPT via DataForSEO LLM Scraper, standard (300) | $0.36 [V math] | $0.72 |
| Gemini via DataForSEO LLM Scraper, standard (300) | $0.36 [V math] | $0.72 |
| AI Mode via DataForSEO, standard (300) | $0.36 [V math] | $0.72 |
| AI Overview via SerpAPI (300 to 600 searches, depending on `page_token`) | inside a plan | $75 Developer plan [V] |
| AI Overview via DataForSEO instead (300, with `load_async_ai_overview`) | $0.36 [V math] | $0.72 |
| Perplexity via Bright Data UI (300 records) | $0.45, or $0 inside the 5,000 free records [V math] | $0.90 or $0 |
| Perplexity via Agent API instead (300) | about $2 [E: $0.0025 search + ~5k search tokens + ~600 output tokens on `perplexity/sonar`] | about $4 |
| Claude via API with web search (300) | $10 to $30 [E: 1 to 3 searches at $0.01, 10k to 25k input tokens and ~800 output tokens on Sonnet 5.5] | $20 to $60 |
| Judge (1,800 calls) | $3 to $10 [E] | $6 to $20 |
| Calibration and parametric sample | | about $5 to $10 [E] |
| Development and testing | | about $20 [E] |
| Exa, Trends, Search Console, GA4 | | $0 |

Totals [E]:

- **With SerpAPI Developer kept for AIO:** about $130 to $190 per month.
- **With AIO moved to DataForSEO and SerpAPI on the free tier (parity checks only):** about $55 to $115 per month.
- Claude is now the largest variable cost. Setting `max_uses: 1` on the web search tool and a smaller model would lower it, but would also change what we measure. That is a decision for the owner, not a default.

Up front: DataForSEO needs a $50 minimum top up (credits do not expire) [V]. Bright Data's free tier needs no card [V].

The Phase 3 gate dry run (3 prompts x 6 engines x 3 draws = 54 draws) is estimated at under $3 in total [E], most of it Claude.

## 5. Local options

| Piece | Local? | Condition |
|---|---|---|
| Google organic, PAA, AI Overview, AI Mode, autocomplete | Experimental, via the openserp based local SERP service | Counts as high fidelity only after `parity-report.md` passes, rechecked monthly. Prompt: `docs/prompts/LOCAL_SERP.md`. Observed 2026-10-27/28 in `SerpAPI/openserp/logs.txt`: AI Mode requests mostly blocked (403/429) from one IP. Treat as unreliable until proven |
| Google Trends | No | Official Trends API, SerpAPI Trends as fallback |
| Judge | Maybe | Only if it passes the gold set gate. Prompt: `docs/prompts/LOCAL_MODELS.md` |
| Embeddings | Yes | Ollama |
| Crawler, cited page fetch, audit, stats, database | Yes | Built locally in Phase 2 |
| ChatGPT, Gemini, Perplexity, Claude answers | No | A local model's answer is not what users see |

## 6. Known issue to fix in Phase 3 (fixed 2026-11-03)

Fixed: legacy measurement calls now send `no_cache=true` and a draw index in the cache key, skip the local cache, and the estimate assumes two uncached calls per prompt (`lib/serpapi.ts`). The new SerpAPI adapter does the same.

Before the fix, the AI Overview capture stored one draw per prompt and cached by params. Repeated draws must not reuse the cache, or the 3 draws are copies of one answer. The fix: include `draw_index` in the cache key and send `no_cache=true` for measurement draws. SerpAPI confirms that cached searches are free and served when all parameters match, for up to 1 hour [V], so without `no_cache` the copies are real.

## 7. Terms, collection notes, and approval

- No logged in automation of any chat UI, by us or on our behalf without a procurement review.
- Third party UI providers (DataForSEO LLM Scraper, Bright Data) state they collect what the interface shows through automated requests. Neither page says whether sessions are logged in or logged out. ARCHITECTURE 5.2 requires a legal or procurement review of the collection method before production use.
- Automated Google queries from the local SERP service may conflict with Google's terms and campus IT policy. Ask IT before running it from the campus network.

| Provider | Approved for adapter | Approved by | Date |
|---|---|---|---|
| DataForSEO LLM Scraper (ChatGPT, Gemini UI) | Yes, pending procurement review of collection method before production data | Project owner | 2026-11-03 |
| Bright Data AI scrapers (Perplexity UI) | Deferred: OneIT blocks brightdata.com on campus. Adapter remains in code for later. Not an approved primary route. | Project owner | 2026-11-04 |
| DataForSEO Perplexity LLM Responses (`sonar`) as Perplexity primary | Yes. Runner `api_search`, fidelity **medium**. Not the perplexity.ai UI. Country via `web_search_country_iso_code` only. | Project owner | 2026-11-04 |
| DataForSEO Google AI Mode and Organic with AI Overview | Yes. Primary for both Google surfaces. SerpAPI drops to the free tier for parity checks; legacy SerpAPI draws keep rendering | Project owner | 2026-11-03 |
| Anthropic web search (Claude primary) | Yes | Project owner | 2026-11-03 |
| OpenAI web search (ChatGPT fallback) | Yes | Project owner | 2026-11-03 |
| Perplexity Agent API (Perplexity fallback) | Yes | Project owner | 2026-11-03 |
| Gemini Search grounding (Gemini fallback) | Yes | Project owner | 2026-11-03 |
| DataForSEO LLM Responses (parametric sample) | Yes | Project owner | 2026-11-03 |

Adapters are built against documented sample responses first. Keys are added before the live gate run.

## 8. Implementation notes (Phase 3, 2026-11-03)

- **DataForSEO runs in live mode only.** The standard queue (post a task, poll `tasks_ready`, then `task_get`) is not built, because its status codes and polling behavior have not been checked against a real response. Cost impact for the default campaign (300 draws per engine per scan): ChatGPT, Gemini and AI Mode at $0.004 each, and AI Overview at 2 × $0.002, come to $4.80 per scan instead of $1.44 on the standard queue [V math]. That is about $6.70 more per month at 2 scans. Switch after the live gate, once one standard task has been observed end to end.
- **Unknown price means refused.** Token-billed adapters (Anthropic, OpenAI, Perplexity, Gemini) are priced only for the model names in `lib/capture/pricing.ts` (`TOKEN_RATES`). Any other model gives an "unknown" estimate and the cost guard refuses the call. To add a model, copy its rate from the provider's pricing page into `TOKEN_RATES` with the date checked.
- **Estimates are upper bounds** from `TOKEN_ASSUMPTIONS` (for example Claude: 3 searches, 25k input and 1.2k output tokens). The actual cost of each draw comes from the provider's usage fields and is what the ledger records.
- **Parametric series** through DataForSEO LLM Responses: the model per engine is set by `DATAFORSEO_PARAMETRIC_MODEL_<ENGINE>`; there is no default. Its estimate assumes the model's tokens at $10 / $50 per MTok, an upper bound, because DataForSEO bills the model's own token cost [V] and the rate depends on the model chosen.
- **Bright Data** uses the Perplexity dataset `gd_m7dhdot1vw9a7gc1n` from the docs sample. When the scrape returns 202 (still running), the adapter polls the snapshot (a free GET) for at most 8 minutes, then records an error draw.
- **Budgets.** Default caps per provider (monthly / per scan, USD): DataForSEO 20 / 10, Bright Data 5 / 2, OpenAI 20 / 10, Anthropic 60 / 30, Perplexity 10 / 5, Gemini 20 / 10. Admins edit them on Settings > Providers. Monthly spend is summed from this UTC month's ledger rows.
- **Gate dry run.** 3 prompts × 6 primary routes × 3 draws, plus 1 canary per route, is 60 draws. Upper bound with `claude-sonnet-5-5`: DataForSEO UI/SERP 4 × $0.04, Perplexity via DataForSEO LLM Responses about $0.06 (task + tokens [E]), Claude about $0.92; about $1.15 in total [E: upper bound assumptions above]. Run it with `npm run capture:dry-run`.
- **Perplexity primary (2026-11-04):** DataForSEO `POST /v3/ai_optimization/perplexity/llm_responses/live` with `DATAFORSEO_PERPLEXITY_MODEL` (e.g. `sonar`). These draws are medium fidelity. Do not chart them with ChatGPT/Gemini UI series.

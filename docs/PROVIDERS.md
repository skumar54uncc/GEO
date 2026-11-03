# Providers and Budget

Prices were checked on 2026-10-21 by a prior research pass. They were **not** rechecked when this file was written into the repo on 2026-11-03.

- **[V]** means verified on the provider's own page on 2026-10-21.
- **[E]** means an estimate.
- **unknown** means nobody has checked yet.

Phase 3 must recheck every row with web search before coding adapters, update the date, and ask for approval.

---

## 1. Paid providers

| Provider | Used for | Price | Notes |
|---|---|---|---|
| DataForSEO LLM Scraper | ChatGPT and Gemini as users see them (UI) | $0.0012 per result standard queue, $0.0024 priority, $0.004 live [V] | Only ChatGPT and Gemini are supported [V]. Location options: unknown, check docs |
| DataForSEO Google AI Mode SERP | Google AI Mode | $0.0012 per request standard, $4 per 1K live [V] | States any location and language [V] |
| DataForSEO LLM Responses | API answers for the parametric series | $0.0002 per task plus the model's token cost [V] | |
| DataForSEO AI Keyword Search Volume | Modeled AI prompt volume | $0.01 per task plus $0.0001 per row [V] | Modeled, not observed. Label it as modeled |
| DataForSEO Google Ads keyword data | Keyword volume | unknown | Check price page in Phase 3 |
| SerpAPI (existing) | Google AI Overview, organic, PAA, Trends fallback, autocomplete | Free 250/mo, Starter $25 for 1,000, Developer $75 for 5,000 [V] | AIO needs 2 calls per draw today. DataForSEO may cover AIO cheaper. Test in Phase 3 |
| Bright Data (candidate) | ChatGPT, Perplexity, Gemini UI capture | unknown | Named in an earlier draft spec. Collection method, terms, and price unverified |
| Perplexity API | Perplexity answers (API, medium fidelity) | Search API $5 per 1K requests [V]. Answer model token rates not read [E] | No UI capture provider confirmed for Perplexity. Status: unknown, check in Phase 3 |
| Anthropic API with web search | Claude answers (API, medium fidelity) | Roughly $10 per 1K searches plus tokens [E] | Verify on Anthropic pricing page |
| OpenAI API with web search | ChatGPT fallback and calibration | Roughly $10 to $30 per 1K calls plus tokens [E] | Verify |
| Gemini API, Search grounding | Gemini fallback and calibration | 5,000 grounded requests free per month, then $14 per 1K [V] | Free tier covers calibration volume |
| Exa | How the web discusses a topic, Reddit and forum questions | $10 free credits monthly, about 2,500 lite searches. Then $4 to $7 per 1K [V] | Free tier is enough at first |
| Fireworks (existing judge) | Judging answers | Token priced [E] | About $3 to $10 per scan at 1,800 judge calls [E] |

## 2. Free Google and public APIs

| API | Why it matters | Access needed |
|---|---|---|
| Google Search Console API | Real queries that bring people to charlotte.edu. The best real demand data we can get | Property access from the web team |
| GA4 Data API | AI referral traffic (chatgpt.com, perplexity.ai, gemini.google.com). The business outcome metric | Property access from the web team |
| Google Trends API (alpha) | Demand and seasonality | Application. Approval status: unknown |
| Google Ads Keyword Planner | Keyword volume ranges | A Google Ads account. Exact volumes need active spend [E] |
| Knowledge Graph Search API | How Google's entity graph describes UNC Charlotte | API key |
| PageSpeed Insights API | Page health inside the site audit | API key |
| Bing Webmaster Tools API | Bing's index feeds several AI assistants | Site verification |
| College Scorecard API | Peer suggestions, program data | api.data.gov key |
| IPEDS data files | Carnegie class, enrollment, peers | None |
| Wikidata and Wikipedia APIs | Entity consistency. Wikipedia is a heavily cited source | None |
| crt.sh | Subdomain discovery | None. Be polite, it is a shared public service |

## 3. Budget for the default campaign

Assumptions: 100 prompts, 6 engines, 3 draws, 1 region (Charlotte, US), scans every two weeks.

| Item | Per scan | Per month |
|---|---|---|
| ChatGPT, Gemini, AI Mode via DataForSEO (900 calls) | about $1.10 [V math] | about $2.20 |
| Google AI Overview via SerpAPI (600 searches) | inside subscription | $75 Developer plan [V] |
| Perplexity via API (300 calls) | $2 to $5 [E] | $4 to $10 |
| Claude via API (300 calls) | $3 to $8 [E] | $6 to $16 |
| Judge (1,800 calls) | $3 to $10 [E] | $6 to $20 |
| Calibration and parametric sample | | about $10 [E] |
| Development and testing | | about $20 [E] |
| Exa, Trends, Search Console, GA4 | | $0 |
| **Total** | | **about $125 to $155 per month [E]** |

Ask: a $150 a month cap, about $1,800 a year, plus a one time $100 for setup testing. Vendor tools at this scope run about $3,500 to $9,600 a year (see `docs/COMPETITOR_MATRIX.md` section 5). If DataForSEO handles AI Overview well in Phase 3 testing, SerpAPI can drop to the free tier and the total falls to roughly $50 to $80 a month [E].

## 4. Local options

| Piece | Local? | Condition |
|---|---|---|
| Google organic, PAA, AI Overview, AI Mode, autocomplete | Experimental, via the openserp based local SERP service | Counts as high fidelity only after `parity-report.md` passes, rechecked monthly with the SerpAPI free tier. Prompt: `docs/prompts/LOCAL_SERP.md`. Observed 2026-10-27/28 in `SerpAPI/openserp/logs.txt`: AI Mode requests mostly blocked (403/429) from one IP. Treat as unreliable until proven |
| Google Trends | No | Official Trends API, SerpAPI Trends as fallback. Scraped Trends is not used |
| Judge | Maybe | Only if it passes the gold set gate. Prompt: `docs/prompts/LOCAL_MODELS.md` |
| Embeddings | Yes | Ollama |
| Crawler, cited page fetch, audit, stats, database | Yes | Planned local |
| ChatGPT, Gemini, Perplexity, Claude answers | No | A local model's answer is not what users see. Using one would fake the data |

## 5. Known issue to fix in Phase 3

Today the AI Overview capture stores one draw per prompt and caches by params. Repeated draws must not reuse the cache, or the 3 draws are copies of one answer and the statistics are fake. The fix: include `draw_index` in the cache key and send `no_cache=true` for measurement draws.

## 6. Terms and collection notes

- No logged in automation of any chat UI, by us or on our behalf without a procurement review.
- Any third party UI capture provider: record its stated collection method here before use.
- Automated Google queries from the local SERP service may conflict with Google's terms and campus IT policy. Ask IT before running it from the campus network.

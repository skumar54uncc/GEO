# Architecture

Status: **Approved 2026-11-03, with the additions marked "(added 2026-11-03)".** Phase 1 builds sections 2, 3, 4, 7, 13 and 14.
Inputs: `docs/COMPETITOR_MATRIX.md`, `geo-reports-pdf-md/SYNTHESIS.md`, `docs/ROADMAP.md`, and the current codebase (Next.js 14, SQLite, about 4,800 lines).

---

## 0. Principles (these override everything below)

1. **Raw first.** Every answer, provider payload, and judge output is stored once, never overwritten. All metrics can be recomputed from stored data.
2. **Runners are never averaged.** A UI answer, an API answer with web search, and an API answer with no browsing are three different measurements. They get separate series on every chart.
3. **Indexes are never pooled.** Chat engines, Google AI surfaces, and shopping assistants each get their own score. Share of voice is computed inside one index.
4. **Every number has n and an interval.** No chart ships without its denominator.
5. **Frozen prompt sets.** A score names a prompt set hash. Editing a prompt starts a new version and a new series.
6. **The writer never grades itself.** The model that drafts content recommendations is not the judge that scores visibility.
7. **Model version is a dimension.** When an engine changes its model, the series is annotated, not silently continued.

---

## 1. What exists today and what we keep

| Today | Keep? | Notes |
|---|---|---|
| Wilson CI in `lib/domain.ts` | Keep | Extend with prompt level cluster bootstrap (section 6) |
| Judge JSON contract and repair call (`lib/judge/`) | Keep, extend | Add character spans and a judge version field |
| SerpAPI cost guard and param hash cache (`lib/serpapi.ts`) | Keep, generalize | Becomes the cost guard for every paid provider |
| City vs university disambiguation rule | Keep | Moves from prompt text into alias config plus judge rule |
| Manual paste capture | Keep forever | Becomes ground truth for calibration |
| `seed/facts.ts` fact bank | Keep | Becomes a versioned fact store |
| SQLite plus JSON fallback | Replace | Postgres. The JSON fallback goes away |
| Single energy campaign hardcoded in seeds | Replace | Campaigns become data |
| `Audience` enum (5 values) | Replace | Personas become data |

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 14 App Router, TypeScript (existing) | No reason to churn |
| Database | Postgres 16 | Concurrency for scheduled scans, JSONB, full text search |
| ORM | Drizzle | Typed SQL, plain migrations, no heavy runtime |
| Jobs | pg-boss | Queues live in the same Postgres. No Redis to run |
| Worker | Separate Node process (`worker/index.ts`), same repo | Next.js route handlers must not run long scans |
| Crawl | Crawlee with Playwright | Sitemaps, robots, JS rendering, rate limits built in |
| Embeddings | pgvector | Prompt dedupe, page matching for gap analysis |
| UI | shadcn/ui, Recharts (existing) | Phase 9 |
| Tests | Vitest, plus Playwright for end to end | |
| Local dev | `docker compose up` for Postgres with pgvector | |
| Hosting (added 2026-11-03) | This Mac only. Postgres and the app bind to 127.0.0.1. No paid database | Shailesh's decision. Public path in `docs/PUBLIC_LAUNCH.md` |

---

## 3. Data model

Postgres, Drizzle. `id` is a uuid unless noted. Every table has `created_at`. Tables marked **immutable** never get UPDATE in application code.

### 3.1 Tenancy and access
- `organizations` (name, slug)
- `users` (email, name)
- `memberships` (org_id, user_id, role: admin | editor | viewer)

### 3.2 Brand, peers, and facts
- `brands` (org_id, name, root_domain, entity_type: university, ipeds_unitid nullable)
- `brand_aliases` (brand_id, alias, kind: full | short | unit | program, `requires_context` bool). "Charlotte" alone is stored with `requires_context = true` and never counts by itself.
- `brand_domains` (brand_id, domain, is_owned)
- `competitors` (org_id, name, ipeds_unitid, source: ipeds_suggested | manual), plus `competitor_aliases`, `competitor_domains`
- `fact_sets` (brand_id, version, frozen_at) and `facts` (fact_set_id, text, source_url, tags[], needs_confirmation). Migrated from `seed/facts.ts`.

### 3.3 Site and audit (Phase 2)
- `sites` (brand_id, root_url)
- `site_hosts` (site_id, host, discovered_via: sitemap | ct_log | link | manual, included bool)
- `crawl_runs` (site_id, status, started_at, finished_at, page_count)
- `crawl_pages` (crawl_run_id, host_id, url, canonical, status_code, title, h1, headings jsonb, meta_description, word_count, lastmod, schema_types[], schema_raw jsonb, faq jsonb, render_mode: static | js, content_hash, text_ref, embedding vector)
- `audit_rules` (id text, title, why, evidence_strength: strong | moderate | weak | speculative)
- `audit_findings` (crawl_run_id, rule_id, severity, host_id, page_id nullable, detail jsonb)
- `bot_hits` (site_id, host_id, path, user_agent, bot_name, status_code, hit_at, source_file_sha256) (added 2026-11-03). Filled from uploaded server or CDN logs. Answers "which AI crawlers fetch which pages".
- `entity_checks` (brand_id, source: knowledge_graph | wikidata | wikipedia | ipeds | scorecard, field, observed jsonb, expected jsonb, status: match | mismatch | missing, raw_payload_id, checked_at) (added 2026-11-03)

### 3.4 Campaigns, personas, regions, prompts
- `campaigns` (org_id, brand_id, name, topic, status: draft | active | archived)
- `personas` (org_id nullable for library items, name, goal, background, vocabulary, notes)
- `seasonal_events` (org_id, name, kind: admissions_deadline | orientation | commencement | aid_deadline | term_start | custom, starts_on, ends_on, recurrence, source_url) (added 2026-11-03). Used by Phase 4 and Phase 8 to time prompts and content.
- `regions` (country, state, city, language, serp_location string)
- `campaign_engines` (campaign_id, engine, runner), `campaign_regions`, `campaign_personas`
- `prompts` (campaign_id, text, persona_id, intent: discovery | comparison | evaluation | decision, funnel_stage, branded bool, **provenance**: observed_ai_log | web_query | paa | fanout | synthesized | custom, demand_evidence jsonb, status: draft | approved | rejected, embedding vector)
- `prompt_sets` (campaign_id, version int, sha256 hash, frozen_at) **immutable once frozen**
- `prompt_set_items` (prompt_set_id, prompt_id, prompt_text_snapshot) **immutable**

### 3.5 Demand signals (Phase 4)
- `demand_signals` (campaign_id, source: google_trends | keyword_volume | paa | autocomplete | related_search | exa | search_console, term, region_id, value jsonb, raw_payload_id, fetched_at)
- `search_console_queries` (site_id, query, page, country, device, clicks, impressions, ctr, position, date) (added 2026-11-03). Real queries that reach our site. Needs property access from the web team.
- `ai_referral_traffic` (site_id, source: chatgpt | perplexity | gemini | claude | copilot | other, landing_page, sessions, engaged_sessions, conversions jsonb, date) (added 2026-11-03). From the GA4 Data API. The business outcome metric. Never mixed into visibility scores.

### 3.6 Scans and the draw ledger (the core)
- `schedules` (campaign_id, cadence: biweekly | monthly | manual, prompt_set_id, next_run_at, budget_cap_usd)
- `scans` (campaign_id, prompt_set_id, schedule_id nullable, status: estimating | awaiting_approval | running | partial | complete | failed, estimate jsonb, approved_by, approved_at)
- `draws` **immutable after capture**. One row per single engine answer.
  - scan_id, prompt_id, prompt_set_id
  - engine: chatgpt | gemini | claude | perplexity | google_aio | google_ai_mode
  - **runner**: ui_provider | serp_provider | api_search | api_parametric | manual_paste
  - **fidelity**: high | medium | low (derived from runner, stored for audit)
  - provider (e.g. serpapi, dataforseo, openai), **model_build** (whatever the provider reports, else "unknown")
  - region_id, region_honored: yes | no | unknown
  - draw_index (1..k)
  - status: ok | empty | error | blocked
  - answer_text, raw_payload_id, cost_units, cost_usd, latency_ms, captured_at
  - unique (scan_id, prompt_id, engine, runner, region_id, draw_index)
- `raw_payloads` (sha256 primary key, content jsonb or text, bytes, **storage: inline | file**, **path** nullable, **media_type**). Content addressed, deduplicated. **Immutable.** Payloads over 256 KB (raw HTML, screenshots) are written once to `data/raw/<sha256>` and only the path is stored (storage and path added 2026-11-03).
- `fanout_queries` (draw_id, query, source: provider_field | ui_visible)
- `serp_snapshots` (query, region_id, engine, fetched_at, raw_payload_id, organic jsonb: position, url, domain, title) (added 2026-11-03). Google organic results for fan-out queries and prompts. Feeds the fan-out to rank join in section 9.

### 3.7 Parsing and judging
- `judge_runs` (draw_id, judge_model, judge_prompt_version, raw_output, parsed jsonb, repair_used bool, error, manual_override jsonb nullable, **sentiment**: positive | neutral | negative | mixed | none, **sentiment_span_start**, **sentiment_span_end**). A re-judge is a new row. Latest valid row wins. Sentiment always points at the sentence that justifies it (sentiment fields added 2026-11-03).
- `mentions` (judge_run_id, entity_type: brand | competitor, entity_id, alias_matched, span_start, span_end, list_position nullable, prominence: headline | first_paragraph | body | footnote_only)
- `citations` (draw_id, url, canonical_url, domain, position, linked bool, source_class: owned | competitor | editorial | ranking | reference | gov | ugc | other)
- `claims` (judge_run_id, text, span_start, span_end, fact_id nullable, verdict: supported | contradicted | unverifiable)
- `cited_pages` (canonical_url unique, fetched_at, status_code, title, h1, h2s[], published_at, updated_at, word_count, schema_types[], faq jsonb, content_type, text_ref, embedding vector). Shared cache across scans.
- `gold_labels` (draw_id, labeler_user_id, field, value jsonb). Human labels for judge evals.

### 3.8 Action and outcomes (Phases 7 and 8)
- `recommendations` (campaign_id, kind: gap | content | technical | earned_media, payload jsonb, evidence jsonb, target_prompt_ids[], status: open | in_progress | published | dismissed, baseline_scan_id, published_at, followup_scan_id)
- `strategy_reports` (campaign_id, topic, inputs jsonb, output jsonb, created_by). Each output item carries persona, prompt cluster, format, headline terms, FAQs, **owner**, **publish_by** (tied to `seasonal_events`), score, and evidence ids (owner and publish_by added 2026-11-03).

### 3.9 Ops
- `provider_accounts` (provider, monthly_budget_usd, spent_usd_month, per_scan_cap_usd)
- `cost_ledger` (provider, scan_id, draw_id nullable, units, usd, at). Generalizes today's `serp_events`.
- `model_events` (engine, occurred_on, note, source_url). Drawn as annotations on every time series.
- `alerts` (org_id, campaign_id nullable, kind: significant_decline | canary_failed | budget_threshold | provider_error_rate | blocked, payload jsonb, status: open | acknowledged, acknowledged_by) (added 2026-11-03)
- `audit_log` (org_id, user_id nullable, action, entity_type, entity_id, before jsonb, after jsonb, at) (added 2026-11-03). Every write route records one row. Append only.
- `sessions` (user_id, token_hash, expires_at) (added 2026-11-03). For the Phase 1 dev login.

### 3.10 Implementation additions (Phase 1, 2026-11-03)

Needed to keep the legacy screens and data lossless. Schema source of truth: `lib/db/pg/schema.ts`.
- `provider_cache` (provider, engine, params_hash, params jsonb, raw_payload_id, units). Cache by full params for every paid provider. A refresh is a new row; lookups take the latest. Replaces `serp_cache`.
- `seq` bigint identity on `prompts`, `draws`, `judge_runs`. Numeric handles the legacy screens use; migrated rows keep their SQLite ids.
- `sort_order` on brand aliases, brand domains, competitors and their aliases and domains, facts. Preserves list order from the legacy config.
- `campaigns.settings` jsonb (subtopics, assets, last location note, migration marker) and `campaigns.updated_at`.
- `regions.label` (unique). The legacy location note, kept verbatim. Structured fields are filled only for the two known notes.
- `personas.legacy_key` (legacy audience value). `facts.external_id`, `source_label`, `names[]`.
- `provider_accounts.org_id`, `credits_starting`, `credits_remaining`, `per_run_cap_units`, `credit_unit_usd` (null when the plan price is unknown).
- `cost_ledger.org_id`, `engine`, `params_hash`, `ok`, `cached`, `error`, `prompt_id`; `usd` nullable (unknown price). Generalizes `serp_events`.
- `serp_snapshots.prompt_id`. `scans.name`. `prompts.tags[]` (legacy subtopics) and `prompts.version`.
- Nullable where the legacy data cannot say: `draws.prompt_set_id` (ad hoc capture of a prompt in no frozen set), `scans.prompt_set_id`, `citations.linked`, `prompts.intent`.
- Embedding columns are `vector` without a fixed dimension, plus `embedding_model`, so the model can be chosen in Phase 4 without a migration.

### 3.11 Implementation additions (Phase 2, 2026-11-03)

Migration `drizzle/0002_phase2_site_audit.sql`. Code in `lib/site/`.
- `entity_checks` table created (Phase 1 had only its enums). Append only; the latest row per (source, field) is current.
- `sites`: status (new | discovering | discovered | failed), discovery summary jsonb, discovery error, updated_at.
- `site_hosts`: `discovered_via_all[]` (every way a host was found; `discovered_via` keeps the first), `included_by_user` (rediscovery never overrides a person's choice), resolves, root status and final URL, login_portal, exclude_reason, robots status and raw store ref, sitemap counts and a raw store ref to the host's sitemap entries, llms.txt status, checked_at.
- `crawl_runs`: page_cap_per_host, host_ids[], hosts_done[], user_agent, error, created_by. The last host to finish completes the run.
- `crawl_pages`: raw_word_count (render mode evidence), outbound_links jsonb, visible_dates[], robots_meta, content_type, fetch_error. A failed page is a row with fetch_error; it never stops the run.
- `audit_runs` (crawl_run_id, rules_version, finding_count, findings_sha256). `audit_findings.audit_run_id`. A rerun adds a new audit run; the sha256 over the sorted findings proves reruns are identical. Freshness is measured against the crawl's finish time, never "now".
- `entity_candidates` (kind: name | alias | college | program | research_center | ranking_claim | location; source_url and source_urls on every item; method: schema | title | heading | navigation | text; group_label from the LLM step; requires_context; status: proposed | confirmed | rejected). Confirming a name sets `brands.name`; confirming an alias writes `brand_aliases` with its requires_context flag. Other kinds stay here for later phases.
- `brands.profile` jsonb: the user confirmed values entity checks compare against. `competitors.reasons`.
- `peer_suggestions` (ipeds_unitid, reasons, score, status, competitor_id). Accepting creates a `competitors` row with source ipeds_suggested.
- `pagespeed_results` (one PageSpeed run per crawl, reused by every audit rerun).
- `bot_log_imports` (file sha256, format, line counts). `bot_hits.host`. Only AI bot lines are stored; IPs and query strings are dropped.
- Job notes: `botlog.import` runs inside the upload request rather than as a queued job, so the uploaded file (which contains visitor IPs) never touches disk. Phase 2 jobs are sent with `retryLimit: 0`.
- AI user agents come from a vendored copy of the ai.robots.txt list (`lib/site/data/ai-robots.json`, MIT). 48 of them are tracked by the robots.txt audit, each with a category: search, user_fetch, or training.

### 3.12 Implementation additions (Phase 3, 2026-11-03)

Migration `drizzle/0003_phase3_capture.sql`. Code in `lib/capture/` and `lib/judge/`.
- `draws.attempt` (default 1). The unique cell is now (scan_id, prompt_id, engine, runner, region_id, draw_index, **attempt**). A retry of a failed draw is a new row with attempt + 1; the failed row stays.
- `draws.error`, `draws.experimental` (local SERP before its parity report passes), `draws.params_hash` (the cache key: full params including scan, draw index and attempt).
- `scans.kind`: scan | capture_test | dry_run | calibration | canary.
- `canary_runs` (engine, runner, provider, draw_id, ok, reason). One canary per route before each scan, in its own scan of kind canary with a fixed prompt tagged `system:canary`. A failure inserts a `canary_failed` alert and removes that route from the scan.
- `calibration_runs` (month, engine, primary and fallback runner, n_prompts, mention_pairs, mention_agreement, jaccard_pairs, citation_jaccard_mean, details). Mention agreement carries a Wilson interval; citation domain Jaccard a normal 95% interval; both in `details` with n.
- `citations.title`, `span_start`, `span_end`. `regions.latitude`, `longitude`, `timezone`.
- Monthly budget: the guard sums this UTC month's `cost_ledger.usd` for the provider. `provider_accounts.spent_usd_month` is still incremented but no longer read, because nothing reset it.
- Judge v2 (`judge_prompt_version = v2-2026-11-03`): mentions, spans, list position and prominence come from deterministic alias matching (longest match wins, acronyms case sensitive, aliases needing context are dropped). The LLM gives only sentiment with a quoted sentence, claims and named sources; spans are found by exact quote search. At most one repair call; both raw outputs are stored. A draw with no tracked entity is judged without a model call (`judge_model = deterministic`).
- Google surfaces captured through DataForSEO also write a `serp_snapshots` row (engine `google:dataforseo`) with the organic results.
- `draws.search_used` (nullable boolean, migration `0004`): true when an api_search draw used web search; false when parametric / search did not run; null for UI, SERP and manual. Phase 5 metrics count api_search only when true.

---

## 4. Migration from SQLite

Script: `scripts/migrate-sqlite.ts`, idempotent, dry run by default.

| SQLite | Postgres |
|---|---|
| `config` | `brands`, `brand_aliases`, `brand_domains`, `competitors` (+aliases, domains), `fact_sets`/`facts` |
| `prompts` | One campaign "Energy", `prompts` (provenance = synthesized, persona mapped from `audience`), `prompt_sets` v1 frozen with all active prompts |
| `responses` | One scan "Legacy import", `draws`. `source_type manual` becomes runner `manual_paste`, fidelity high. `serpapi` becomes `serp_provider`. `location_note` goes to a region row, region_honored unknown |
| `analyses` | `judge_runs` (spans null for legacy rows), then `mentions` and `citations` derived from judge JSON |
| `serp_cache` | `raw_payloads` plus `provider_cache` |
| `serp_organic` | `serp_snapshots` (organic summary for the prompt's own query) |
| `trends`, `autocomplete` | `demand_signals` |
| `serp_events` | `cost_ledger` |
| `recommendations` | `recommendations` (status open) |

Verification test: row counts match per table, and for 20 random responses the sha256 of `raw_text` equals the hash of `draws.answer_text`. Metrics computed by the old `computeMetrics()` and the new metric service must match on the legacy scan, to the decimal.

Legacy audience to persona map: undergrad → prospective first year student, grad → grad applicant, industry → employer or industry partner, hel → higher ed leader, government → government or policy staff.

---

## 5. Engine capture layer

### 5.1 Adapter interface

```ts
type Runner = "ui_provider" | "serp_provider" | "api_search" | "api_parametric" | "manual_paste";

interface CaptureRequest {
  drawId: string;
  engine: Engine;
  runner: Runner;
  prompt: string;
  region: Region;
  drawIndex: number;
}

interface CaptureResult {
  status: "ok" | "empty" | "error" | "blocked";
  answerText: string;
  citations: Array<{ url: string; position: number; linked: boolean }>;
  fanoutQueries: string[];
  modelBuild: string | "unknown";
  regionHonored: "yes" | "no" | "unknown";
  raw: unknown;            // stored to raw_payloads as is
  costUnits: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

interface ProviderAdapter {
  id: string;                          // "serpapi", "dataforseo", "openai", ...
  supports(engine: Engine, runner: Runner): boolean;
  estimate(req: CaptureRequest): { units: number; usd: number };
  capture(req: CaptureRequest): Promise<CaptureResult>;  // never throws
}
```

Rules: `capture` never throws. One failed call becomes a draw with status `error` and the scan continues. No automatic retries on paid calls. A manual "retry failed draws" button creates new attempts with the cost shown first.

### 5.2 Default runner per engine

Provider availability and pricing are **not yet verified**. Phase 3 starts by filling `docs/PROVIDERS.md`. Until then this is the plan, not a fact.

| Engine | Primary runner | Fallback | Fidelity |
|---|---|---|---|
| Google AI Overview | serp_provider (SerpAPI, existing) | none | high |
| Google AI Mode | serp_provider (SerpAPI or DataForSEO) | none | high |
| ChatGPT | ui_provider (a third party UI capture service) | api_search (OpenAI with web search, approximate location) | high / medium |
| Perplexity | ui_provider | api_search (Sonar) | high / medium |
| Gemini | ui_provider | api_search (Google Search grounding) | high / medium |
| Claude | api_search (web search tool) | manual_paste | medium |
| Any | manual_paste | | high, small n |
| Google AIO, AI Mode (added 2026-11-03) | serp_provider via local SERP service (`provider = local_serp`) | SerpAPI or DataForSEO | high **only after** `parity-report.md` passes and is rechecked monthly. Until then the series is labeled experimental and never replaces the paid provider |

As built in Phase 3 (2026-11-03, approved in `docs/PROVIDERS.md` section 7; routes in `lib/capture/registry.ts`):

| Engine | Primary | Fallback | Parametric | Parity |
|---|---|---|---|---|
| ChatGPT | ui_provider, DataForSEO LLM Scraper | api_search, OpenAI | api_parametric, DataForSEO LLM Responses | |
| Gemini | ui_provider, DataForSEO LLM Scraper | api_search, Gemini grounding | api_parametric, DataForSEO LLM Responses | |
| Perplexity | api_search, DataForSEO LLM Responses (`sonar`; medium, not UI). Bright Data UI deferred (campus block) | api_search, Perplexity Agent API | api_parametric, DataForSEO LLM Responses | |
| Claude | api_search, DataForSEO LLM Responses (`web_search` true, country + city; medium, not UI) | api_search, Anthropic (calibration only) | api_parametric, DataForSEO LLM Responses | |
| Google AI Overview | serp_provider, DataForSEO organic with `load_async_ai_overview` | none | | SerpAPI (free tier), local SERP |
| Google AI Mode | serp_provider, DataForSEO AI Mode | none | | SerpAPI (free tier), local SERP |

Region honored, as coded: a provider told the location natively at the region's own granularity is yes; approximate location (the API user_location fields) is unknown; coarser than the region, or none, is no.

Local SERP rules (added 2026-11-03): it runs from one Charlotte IP, so any other region is `region_honored = no`. It is logged out, uses a fresh profile per draw, never solves CAPTCHAs, and stops a batch for at least one hour on any block. Its prompt lives in `docs/prompts/LOCAL_SERP.md` and is run inside the openserp project, not this repo.

Plus an **api_parametric** series (no browsing) on a 20 prompt sample per campaign each month. This is Evertune's split: weak in both runners means a brand awareness problem; strong in parametric but weak in UI means a content and SEO problem.

**We do not build our own logged-in browser automation of chat UIs.** It breaks terms of service, it breaks every few weeks, and it is a bad look for a public university. If a third party UI provider is used, legal or procurement should review its collection method.

### 5.3 Calibration (our differentiator)

Monthly job: for 20 prompts per engine, capture both the primary and fallback runner (and manual paste where possible). Store mention agreement and citation domain overlap (Jaccard). Show it on the dashboard as "how much to trust medium fidelity data". No vendor in the matrix publishes this.

### 5.4 Regions

- SERP providers: pass `serp_location` natively. `region_honored = yes`.
- APIs with approximate location: pass it. `region_honored = unknown` unless the response confirms it.
- APIs without location: `region_honored = no`.
- Dashboards filter by region only on draws where region_honored is yes or unknown, and say so.

### 5.5 Personas

A persona changes **how the prompt is written**, not who is logged in. We cannot reproduce a real user's account history and we will say that on the persona screen. No vendor states this honestly.

---

## 6. Statistics

### 6.1 Units
- **Draw**: one answer.
- **Prompt presence rate**: share of draws for one prompt where the brand is mentioned.
- **Prompt "won"**: brand mentioned in a majority of draws (at least 2 of 3).

### 6.2 Headline metric (answers the "x out of 100 prompts" question)
**Prompts won = count of prompts where the brand appears in at least 2 of 3 draws, per engine, per runner.** Reported as "41 of 100 prompts (95% CI 32 to 51)".

### 6.3 Intervals
Draws inside one prompt are correlated. Treating 300 draws as 300 independent trials overstates precision. So:
- Prompt level rates use Wilson on prompt counts.
- Draw level rates use a **cluster bootstrap over prompts** (resample prompts, 2,000 iterations).
- Cells with fewer than 30 draws are shown greyed with "too few draws".

Rough width of a 95% interval at a 50% rate, assuming independent draws (real width is wider):

| Draws in the cell | ± points |
|---|---|
| 30 | 18 |
| 100 | 10 |
| 300 | 5.7 |
| 600 | 4.0 |

So 100 prompts × 3 draws gives an engine level number to within about ±6 points. A single persona slice of 10 prompts (30 draws) is ±18 points. **Persona and region cells will be noisy unless prompt counts grow.** The UI must show this, not hide it.

### 6.4 Comparing two scans
Same frozen prompt set, so pairs are matched by prompt. Use **McNemar's test** on "won" status per prompt, and a paired bootstrap for the presence rate difference. Output label: "significant improvement", "significant decline", or "within noise". Scans on different prompt set versions cannot be compared. The UI blocks it.

### 6.5 Visibility formula (published, like SE Ranking)
- Mention rate = draws with a brand mention / valid draws.
- Citation rate = draws citing an owned domain / valid draws.
- Share of voice (within one index) = brand mentions / all tracked entity mentions.
- Position = list position of the first brand mention in a ranked list, else null. Median across draws.
- First mention rate = valid draws where the brand is the first tracked entity named / valid draws (added 2026-11-03).
- Consistency = for each prompt, the share of its draws that agree with the majority outcome (mentioned or not), averaged over prompts. Shown next to every visibility number.
- Branded prompts are reported as their own series and never inside the headline number (added 2026-11-03).
- Every formula lives in `docs/METRICS.md` and a unit test.

---

## 7. Job system (pg-boss)

| Queue | Triggered by | Concurrency |
|---|---|---|
| `crawl.discover` | onboarding | 1 per site |
| `crawl.page` | discover | 4 per host, polite delay |
| `audit.run` | crawl complete | 1 |
| `demand.fetch` | prompt generation | per provider limit |
| `prompts.generate` | user action | 1 per campaign |
| `scan.estimate` | user or schedule | 1 |
| `scan.draw.<provider>` | scan approved | per provider limit |
| `judge.run` | draw ok | 4 |
| `citation.fetch` | judge done, URL not cached | 4, polite |
| `metrics.rollup` | scan complete | 1 |
| `schedule.tick` | every hour | 1 |
| `calibration.run` | monthly | 1 |
| `health.ping` (added 2026-11-03) | Phase 1 smoke test | 1 |
| `botlog.import` (added 2026-11-03) | log file upload | 1 |
| `entity.check` (added 2026-11-03) | onboarding, monthly | 1 |
| `connectors.sync` (added 2026-11-03) | daily: Search Console, GA4 | 1 |
| `canary.run` (added 2026-11-03) | before every scan | 1 |
| `alerts.evaluate` (added 2026-11-03) | scan complete, budget change | 1 |
| `scan.run` (Phase 3) | scan approved | 1 job; inside it, 2 draws at once per provider, providers in parallel. Runs canaries first, then calibration stats for calibration scans, then sends `judge.run` |
| `capture.retry` (Phase 3) | "retry failed draws", after the cost is shown and approved | 1 |
| `fanout.run` (Phase 3) | user action, approved estimate | 1 |

Phase 3 runs canaries inside `scan.run` rather than as a separate `canary.run` job, and draws inside `scan.run` rather than one `scan.draw.<provider>` job per draw. All Phase 3 jobs are sent with `retryLimit: 0`; paid calls are never retried automatically.

Scheduled scans compute the estimate and auto run only if under `budget_cap_usd`. Otherwise they wait for approval and notify.

---

## 8. Cost model

Per scan:

```
draws  = prompts × Σ(engine, runner) × regions × draws_per_prompt
cost   = Σ draws × unit_cost(provider)
       + draws × judge_cost
       + new_unique_cited_urls × fetch_cost
       + demand and generation calls (one time per campaign)
```

Volumes for the default campaign (unit prices go in `docs/PROVIDERS.md`):

| Scenario | Draws per scan | Per month (biweekly) |
|---|---|---|
| 100 prompts, 6 engines, 3 draws, 1 region | 1,800 | 3,600 |
| Same, 2 regions | 3,600 | 7,200 |
| Same, 3 regions | 5,400 | 10,800 |
| Plus monthly calibration (20 prompts × 6 engines × 2 runners × 3 draws) | | +720 |
| Plus monthly parametric sample (20 prompts × 4 APIs × 3 draws) | | +240 |

Judge calls equal draws. Recommendation: **start with 1 region (US, Charlotte metro) and add regions only after the first two scans prove the pipeline.**

---

## 9. Gap analysis and content strategy design (Phases 7 and 8)

For prompts the brand did not win:
1. Pull all citations and `cited_pages` for those draws.
2. Pull `fanout_queries`. Check whether cited pages rank for them (SerpAPI organic). This is the Optimist mechanism, made reproducible.
3. Cluster cited page headings, schema, FAQ questions, and content types. Extract terms that appear in cited pages far more than in our matching pages.
4. Find our closest page by embedding. If similarity is low, recommend a new page.
5. Output a recommendation with: headline terms, FAQ questions (from PAA and cited page FAQs), format, target URL, third party sources to pursue, and **the evidence rows**. Labeled correlation, not cause.
6. **Pre-registration**: the recommendation stores its target prompts and the baseline scan. After publishing, the next scans on the same prompt set test only those prompts.

Content strategy for a new topic runs demand (Trends, keyword volume, PAA), a small sample scan, our site supply from `crawl_pages`, then gap analysis, and scores ideas by demand × gap × effort. No idea without evidence attached.

---

## 10. Evals (built in, not bolted on)

| Eval | Method | Bar |
|---|---|---|
| Mention detection | 200 hand labeled draws in `gold_labels`, including "Charlotte" city traps | Precision and recall ≥ 0.95, shown in Settings |
| Citation extraction | Same set | Domain agreement ≥ 0.95 |
| Claim verdicts | 100 claims labeled against facts | Report agreement and n |
| Runner calibration | Section 5.3 | Shown as a series |
| Canary prompt | One prompt with a known stable answer per engine per scan | Alert if it breaks |

Judge prompt changes bump `judge_prompt_version` and must rerun the gold set before merge.

---

## 11. Where we can win and where we cannot

**We can win on:**
- Honest statistics: intervals, cluster aware CIs, significance on scan comparisons. No vendor shows these.
- Published UI vs API calibration. Nobody does it.
- Higher ed depth: IPEDS peers, program entities, admissions seasonality, rankings sources as a citation class, the city vs university problem.
- Fan out stored and joined to rank, so gap analysis is testable.
- Pre-registered before and after tests on content changes.
- Cost: likely well under a mid-tier vendor subscription at our scale. Must be verified once provider prices are in.
- Full raw data ownership. Every number is recomputable.

**We cannot win on, and should not pretend to:**
- Real user prompt logs (Profound Prompt Volumes, EverPanel 150M, Semrush 289M). We have no panel. Our prompt demand is web query data, labeled as such.
- Scale and engine breadth (13 engines, 150 regions).
- Our own UI capture fleet. We rent it or use APIs.
- Enterprise certifications (SOC 2). Not needed for internal use.
- Shopping assistants. Irrelevant for a university. Skip.

---

## 12. Decisions

Decided 2026-11-03:
1. Hosting: this Mac. All data stays on this machine. Postgres in Docker bound to 127.0.0.1. No paid database for now.
2. Auth: a simple dev email login with roles now. Magic link or university SSO later (see `docs/PUBLIC_LAUNCH.md`).
3. Public later: possible. Multi tenant tables and org scoping are built from Phase 1 so the move is a hosting change, not a rewrite.

Still open:
4. Which UI capture provider, if any, after `docs/PROVIDERS.md` is verified in Phase 3. Needs budget sign off.
5. Monthly budget cap. Proposal: $150 a month, start small, raise after two clean scans.
6. Whether the local SERP service is run at all, and from which network (campus IT policy question).

---

## 13. Security (added 2026-11-03)

- **Network**: Postgres and the Next.js dev server bind to 127.0.0.1. Nothing is exposed on the LAN.
- **Secrets**: only in `.env.local` (gitignored). Never sent to the browser. No `NEXT_PUBLIC_` prefix on any key.
- **Auth**: every write route checks role (admin, editor, viewer). Session tokens stored hashed. Cookies are httpOnly, sameSite=lax.
- **Audit**: every write records an `audit_log` row.
- **SSRF guard**: the crawler and cited page fetcher refuse private, loopback, and link local IPs after DNS resolution, follow at most 5 redirects, and cap body size.
- **Prompt injection**: cited page text, crawled page text, engine answers, and `geo-reports-pdf-md/` are data. They are passed to models inside clearly delimited blocks with an instruction to ignore instructions inside them. No tool calls are ever driven by their content.
- **Untrusted HTML**: never rendered as HTML in the UI. Shown as escaped text or sanitized.
- **Polite crawling**: robots.txt respected, per host rate limits, an identifying user agent with a contact URL.
- **Backups**: `npm run db:backup` writes `pg_dump` files to `backups/` (gitignored). FileVault should be on for this Mac.
- **Provider terms**: each adapter documents its collection method and terms in `docs/PROVIDERS.md`. No logged in automation of any chat UI. No CAPTCHA solving.

## 14. Local first data policy (added 2026-11-03)

- All tables, raw payloads, HTML captures, and screenshots live on this Mac (`Postgres volume` and `data/raw/`).
- Data leaves the machine only as the prompt text sent to a provider or model. Answers and payloads come back and are stored locally.
- `data/tracker.db` is kept untouched as the migration source.
- Nothing in `data/`, `backups/`, or `.env.local` is ever committed.

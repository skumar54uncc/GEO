# Local SERP service prompt (openserp)

Where to run this: open `SerpAPI/openserp` as its own project in Cursor (not the GEO repo). Fresh chat, plan mode, strongest model. Paste everything below the line.

Before you run it:
- Automated Google queries may conflict with Google's terms. Running from the campus network may break university IT policy and get the campus IP flagged. Ask IT first or use a home network.
- Your own `logs.txt` (2026-10-27/28) shows AI Mode mostly blocked (403, 429) from one IP even at 15 requests a minute. Expect this service to cover a small share of draws. The paid SERP provider stays primary.

---

You are hardening my local SERP service so the GEO platform (github.com/skumar54uncc/GEO) can use it as an optional, parity gated provider for Google surfaces. GEO measures how Google's AI surfaces describe UNC Charlotte. A wrong answer is worse than no answer. Whenever you are unsure what Google showed, return an error status. Never guess, fill gaps, or reuse an old result.

This project is a fork of karust/openserp (Go, go-rod, Chrome). It already has a SerpAPI style `GET /search` in `core/serpapi.go` with engines `google`, `google_light`, `google_ai_mode`, `google_ai_overview`, `google_trends`, `google_trends_autocomplete`, `google_trends_trending_now`. Build on that. Do not rewrite in another language.

## Step 0: read, then report gaps

Read this whole codebase, especially `core/serpapi.go`, `core/serpapi_trends.go`, `google/search.go`, `google/features.go`, `google/url.go`, `google/selectors.go`, `core/browser.go`, `core/proxy_lane.go`, `core/cache.go`, `core/captcha.go`, `core/circuit_breaker.go`, `config.yaml`, and `google/testdata/`.

Then read these GEO files (clone github.com/skumar54uncc/GEO read only, do not edit it): `lib/serpapi.ts`, `lib/demand.ts`, `lib/domain.ts` (`flattenTextBlocks`), `docs/ARCHITECTURE.md` sections 0, 5, 6, 13, and `docs/PROVIDERS.md` sections 4 and 5. They are the contract.

Compare against SerpAPI's public docs and sample JSON for each engine below. Before writing code, give me a gap report: what exists, what is missing, what is wrong. Known gaps to confirm or refute:
- Sticky lanes reuse a browser profile and cookies per engine (`lanes.enabled: true`). Draws are not independent.
- An in memory response cache (120 s TTL). Repeat draws can be copies.
- 2captcha solver code exists (`core/captcha.go`), off by default.
- No raw HTML or screenshot is stored.
- No AI Overview or AI Mode HTML fixture. The `aimc` selectors are untested against real pages.
- Streaming wait is a fixed 3 to 6 s poll. Long answers can be cut off.
- PAA questions are not expanded.
- AI Mode returns only top level text_blocks.
- Trends is fetched over plain HTTP from trends.google.com.

## 1. GEO measurement mode

Add a config profile and a request flag `geo_mode=true` (default on for `/search`) that:
- Disables lanes, sticky profiles, and cookie reuse. A fresh, logged out browser profile per draw. No history carried between draws.
- Disables the response cache. Add a `draw_index` parameter. If any cache remains for non measurement use, `draw_index` and every parameter are in the key, and `no_cache=true` always fetches live.
- Removes every CAPTCHA solver path from the build used in GEO mode. Not just off by config: unreachable.
- Disables proxies unless an approved proxy for the requested region is configured. No proxy rotation to dodge blocks.
- No fingerprint spoofing beyond a normal desktop Chrome.

## 2. API contract, a drop in for serpapi.com

`GET /search` with SerpAPI parameter names and the same response field names and nesting. GEO switches by changing only its base URL.

Every response includes `search_metadata`:
- `id`
- `status`: Success, Error, Blocked, NoResult
- `created_at`
- `raw_html_file`, `screenshot_file`
- `parser_version`
- `location_requested`, `location_used`, `region_honored` (yes, no, unknown)
- `browser_profile_id` (unique per draw)
- `draw_index`

Plus top level: `provider: "local_serp"`, `cost_usd: 0`, `fidelity_candidate: "high"`.

## 3. Engines

**engine=google.** Params: q, location, gl, hl, uule, device, num.
- `organic_results[]`: position, title, link, displayed_link, snippet, source.
- `related_questions[]` (PAA): question, snippet, title, link. Expand each question to capture its answer.
- `related_searches[]`: query.
- `ai_overview`:
  - `state`: shown, not_shown, failed_to_load, blocked. Never collapse not_shown and failed_to_load.
  - `text_blocks[]`, recursive: type (paragraph, heading, list, table), snippet, title, list[] with nested text_blocks[], reference_indexes[].
  - `references[]`: index, title, link, snippet, source.

**engine=google_ai_overview** with page_token. Kept for compatibility. Return the AI Overview captured in the first page load.

**engine=google_ai_mode** with q, location, gl, hl. Same text_blocks and references shape, recursive, plus `fanout_queries[]` whenever the page shows the searches it ran.

**engine=google_autocomplete**: q, gl, hl, returning `suggestions[]` with value. This is the Google search box autocomplete, not Trends autocomplete.

**engine=google_trends**: return status Error with message "use the official Trends API". Do not scrape or estimate. Keep the existing code path out of GEO mode.

## 4. Capture accuracy

- Match hl and gl to Accept-Language, timezone, and geolocation for the requested location.
- The IP decides the real location, and it is Charlotte, NC. If a different region is requested and no approved proxy for it exists, return `region_honored = no`. Never claim a region you did not use.
- Replace the fixed streaming wait with an end of stream signal: the answer container stops changing for a stable interval and the loading indicators are gone, with a hard ceiling. If the ceiling is hit, status Error, `ai_overview.state = failed_to_load`.
- Click "Show more" and every expander so the full text and every source are captured, including collapsed sources.
- Store raw HTML and a full page screenshot for every request, named by sha256, under a configurable directory.
- Parsers are pure functions of stored HTML, so old captures can be reparsed after a fix. Add `POST /reparse` taking a stored file id. Bump `parser_version` whenever any parser changes.

## 5. Blocks and safety

- Detect CAPTCHA pages, "unusual traffic" pages, consent walls, and empty result pages. Mark them Blocked.
- On any Blocked: trip the circuit breaker, stop the batch, cool down at least 1 hour (today it is 60 s). Log it.
- Throttle: random delay between requests, default 25 to 60 s. Configurable daily cap, default 150 queries. A persistent queue (file or SQLite) that spreads a large scan across sessions and resumes cleanly after restart.
- Every request is logged with its status. Nothing fails silently.
- No account logins of any kind.

## 6. Tests and the accuracy gate (required)

- **Fixtures.** At least 15 real stored pages: AI Overview with lists, with a table, with nested lists, no AI Overview, AI Overview failed to load, AI Mode, AI Mode with fan out queries, PAA, related searches, CAPTCHA, unusual traffic, consent, empty results. Assert parsed JSON equals expected output exactly.
- **Schema test.** Validate every response against a JSON schema built from SerpAPI's documented fields per engine.
- **Independence test.** Two draws of the same query in GEO mode have different `browser_profile_id`, different raw files, and no shared cookies.
- **Parity test** (`make parity` or `go run ./cmd/parity`). Take 30 prompts from GEO's seed list. Run each through real SerpAPI twice (free 250 a month) and through the local service twice, all in the same hour. For each pair measure: AI Overview shown agreement, Jaccard overlap of reference domains, overlap of top 10 organic domains, whether UNC Charlotte is mentioned. Pass rule: local vs SerpAPI is no worse than SerpAPI vs itself by more than 5 points on each measure. Write `parity-report.md` with n for every number.
- **Canary.** Before every batch, run one fixed query and check the parser still finds the expected structure. If it fails, refuse the batch.

## 7. Output for GEO

README section "How to point GEO at this": base URL env var (`SERPAPI_BASE_URL` on the GEO side), start command, health check, daily cap, where raw files are stored, how to run parity.

## Do not

- Change GEO's code.
- Add anything that logs into Google, ChatGPT, or any other account.
- Mark anything Success unless the full answer and every source were captured.
- Solve CAPTCHAs, rotate proxies to dodge blocks, or spoof fingerprints.

## Finish with

The gap report, files changed, test results, the parity report, and anything still unreliable.

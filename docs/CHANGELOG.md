# Changelog

## 2026-11-03: Phase 2, Onboarding and site audit

You can now enter a root URL (charlotte.edu), choose which discovered hosts to include, crawl them, confirm the entity profile and peers, and read an AI readiness audit filtered by host, severity and rule, with a page drilldown. New screens: Onboarding, Audit, Bot hits.

Added:
- Discovery (`crawl.discover`, `lib/site/discovery.ts`): robots.txt, sitemaps (indexes and .gz), links on the home page and on sitemap pages, and certificate transparency from crt.sh (cached). Every host records how it was found. Hosts start excluded when they do not resolve, fail or error at the root, redirect elsewhere, are sign-in portals, or look like dev, test or staging servers (that last rule is an addition beyond the spec). Your include and exclude choices survive rediscovery. The root host and the host it redirects to are always checked first. A cap (`DISCOVERY_MAX_HOST_CHECKS`) limits how many hosts get a request; the rest are listed as "not checked".
- SSRF guard (`lib/site/net/ssrf.ts`): checks DNS and refuses private, loopback, link-local, carrier NAT and IPv4-mapped addresses. It connects to the address it validated, follows at most 5 redirects (each checked), and caps the body.
- Crawl (`crawl.page`, `lib/site/crawl.ts`): Crawlee with Playwright. robots.txt is enforced for our own token, with Crawl-delay honored. At most 4 requests per host at once, a per-minute rate limit, and the user agent `UNCCGEOAudit/0.2 (+CRAWLER_CONTACT_URL)`. Crawls refuse to start without a contact. Every browser request is answered from a guarded Node fetch, with redirects followed in Node. The browser runs with no DNS and a dead proxy, so nothing it does can reach a private address. Each page stores canonical, status, title, H1, H2/H3, meta description, word counts (raw and rendered), lastmod, visible dates, JSON-LD types and raw blocks, FAQ blocks, outbound links, render mode and content hash. Page text goes to the raw store. A failed page is recorded with its reason and never stops the run.
- Entities (`lib/site/entities.ts`): deterministic extraction of name, aliases, colleges, programs, research centers, rankings claims and locations, each with its source URL. Rankings claims are labeled as the site's own words, not verified. "Charlotte" alone is stored with requires_context. The optional LLM step (Fireworks, through the cost guard and cache) can only group and relabel existing items; answers that add facts are rejected. Confirming a name or alias writes `brands` or `brand_aliases`.
- Peers (`lib/site/peers.ts`): College Scorecard. It finds the school by name and website, then suggests schools with the same Carnegie class, region and control, ranked by program overlap (CIP 4-digit code plus credential level). Every suggestion lists its reasons. Accepting one creates a competitor with its IPEDS unit id. Manual peers are supported.
- Entity consistency (`entity.check`, `lib/site/entityCheck.ts`): Knowledge Graph, Wikidata, Wikipedia infobox, IPEDS (Urban Institute directory) and Scorecard, compared with the profile you confirm. Results are match, mismatch or missing, with the source's date where it gives one. A source with no key is reported as not checked and never stored as missing.
- Audit (`audit.run`, `lib/site/audit/`): 23 rules, each with why and evidence strength. They cover AI crawler access for 48 tracked agents per host (blocking a search or user-fetch bot is high; blocking a training bot is info), robots.txt availability, CollegeOrUniversity, Organization sameAs, program, course, event and FAQPage schema, FAQ blocks, staleness, unknown freshness, JS-only content, thin pages, duplicate titles and H1s, missing meta descriptions, broken canonicals, PageSpeed, llms.txt (speculative, "low evidence of impact"), and entity mismatches. Every run is a new `audit_runs` row with a sha256 over the sorted findings.
- PageSpeed (`lib/site/pagespeed.ts`): runs once per crawl for the home page plus the most linked pages on each host. It is checked against the cost guard as a batch, at $0 per call but counted. Later audit reruns reuse the stored results.
- AI bot hits (`lib/site/botlog.ts`, Bot hits screen): upload combined, common or Cloudflare JSON logs. The file is hashed and parsed inside the request. Only AI bot lines are kept (by user agent, matched against the vendored ai.robots.txt list of 202 agents). IPs and query strings are dropped. Importing the same file twice adds nothing.
- `lib/site/providerCall.ts`: one path for every external API, combining cache by full params, budget check, ledger row and raw store. No retries. Provider accounts are seeded for pagespeed, scorecard, google_kg, crtsh, wikidata, wikipedia, urban_ipeds and fireworks.
- Tests: 9 new test files, 119 new tests (169 in total). They cover discovery on fixture robots and sitemaps, the crt.sh parser on a stored real response, the SSRF guard (private IPs, metadata IP, names resolving private, redirect chains, unfollowed redirects), render mode, every audit rule, all three log formats, entity extraction including noise seen on charlotte.edu, peer scoring and entity checks on stored real Scorecard, Wikidata, Wikipedia and IPEDS responses, and an end to end run on a local multi-host fixture site: onboard, discover, exclude a host, crawl with Playwright, extract, audit twice, then report.
- `scripts/inspect-entities.ts` (read only).

Changed:
- Schema: see ARCHITECTURE 3.11. The `entity_checks` table now exists; Phase 1 had only its enums.
- Nav: Onboarding, Audit, Bot hits.
- `tests/migration.test.ts`: the SQLite fixture is checkpointed before hashing. A full-suite run failed once on its "file unchanged" or "20 answers" hash check. The cause was most likely the fixture's WAL being flushed into the main file when the open connection was garbage collected. Both full runs since the fix pass.

Verification gate (run 2026-11-03 on this Mac):
1. `typecheck` passes. `lint` passes; the one warning in `app/analyze/page.tsx` predates Phase 1. `npm test` passes 169 tests in 17 files, in two full runs after the migration test fix.
2. Live run on charlotte.edu, crawler contact mailto:skumar54@charlotte.edu.
   - Discovery found 1,391 hosts: 1,319 names from crt.sh, 31 hosts linked from the home page, and 2,109 sitemap URLs from 70 sitemap files (the file cap was reached). To avoid anything that looks like a scan, the run capped host checks at 60. 62 hosts were requested (the cap plus 2 redirect targets), 55 were included by default, and 1,329 are listed as "not checked". Checked hosts that were excluded: 4 redirect elsewhere, `my.charlotte.edu` is a sign-in portal, `campusevents` timed out, and `ninercentral` fails TLS verification.
   - Crawl `844ae994`, 4 pages per host across 55 hosts: 199 pages, 7 failed pages (timeouts and redirects to off-site sign-in hosts), 2 URLs skipped by robots.txt.
   - Entities proposed: 1 name, 4 aliases ("Charlotte" alone needs context), 21 colleges, 12 programs, 12 research centers, 3 rankings claims, 1 location.
   - Peers: Scorecard matched unit id 199139 (Carnegie basic code 16, Southeast) and proposed 12 peers.
   - Audit: 408 findings. 0 critical, 53 high, 1 medium, 200 low, 154 info.
   - The host list, entity profile, peers and audit report (with page drilldown) render in the browser.
3. Rerunning the audit on crawl `844ae994` gave 408 findings with the identical fingerprint `5162ac16e524d152…` both times.
4. All 408 findings carry why and evidence strength (0 missing).
5. Every page (`/`, `/campaigns`, `/capture`, `/analyze`, `/serpapi`, `/demand`, `/recommend`, `/config`, `/onboarding`, `/audit`, `/bots`, `/login`) returns 200. The dashboard still reads 80.0% (32 of 40; 95% Wilson CI 65.2% to 89.5%). `data/tracker.db` is unchanged (sha256 04bfc5e4…8cc8).

Findings by host and severity (high, medium, low, info; blank means 0; no host had a critical finding):

| Host | High | Medium | Low | Info |
|---|---|---|---|---|
| 49erfinish | | | 3 | 1 |
| academics | | | 3 | 1 |
| admissions | | | 6 | 1 |
| alumni | | | 3 | 1 |
| assessment | | | 5 | 2 |
| aux | | | 5 | 1 |
| belkcollege | | | 1 | 2 |
| cci | | | 5 | 2 |
| chancellor | | | 2 | 1 |
| chess | | | 2 | 2 |
| coaa | | | 1 | 1 |
| dining | | | 4 | 1 |
| directory | | | 7 | 5 |
| dpl | | | 1 | 2 |
| education | | | 3 | 2 |
| emergency | | | 3 | 1 |
| engineering | | | 2 | 2 |
| facilities | | | 4 | 2 |
| facultygovernance | | | 5 | 2 |
| finance | | | 6 | 2 |
| giving | | | 3 | 1 |
| gradadmissions | | | 6 | 1 |
| graduateschool | | | 5 | 2 |
| greeklife | | | 6 | 4 |
| health | | | 2 | 1 |
| honorscollege | | | 3 | 1 |
| housing | | | 5 | 3 |
| hr | | | 4 | 2 |
| incidentreport | | | 4 | 2 |
| inside | | | 4 | 2 |
| ir | | | 8 | 2 |
| jobs | 25 | | | 24 |
| lc | | | 1 | 1 |
| legal | | | | 1 |
| library | | | | 1 |
| maps | | | | 3 |
| myhealth | | | 8 | 2 |
| ncresidency | | | 5 | 2 |
| ninerengage | 3 | | | 5 |
| ninernet | | | 8 | 4 |
| ombuds | | | 5 | 2 |
| oneit | | | 3 | 3 |
| online | | | 2 | 3 |
| pats | | | 3 | 2 |
| professional | | | 2 | 3 |
| provost | | | 4 | 2 |
| registrar | | | 5 | 2 |
| research | | | 5 | 2 |
| sac | | | 6 | 4 |
| safety | | | 5 | 2 |
| safetyandsecurity | | | 5 | 2 |
| science | | | 2 | 2 |
| services.help | 25 | | | 24 |
| staffcouncil | | | 6 | 2 |
| www | | 1 | 4 | 1 |
| All hosts | 53 | 1 | 200 | 154 |

What the high findings are: `jobs.charlotte.edu` and `services.help.charlotte.edu` have `User-agent: * / Disallow: /`, so every tracked AI search and user-fetch bot is blocked (25 high and 23 info for training bots on each host, plus the llms.txt note). The three `ninerengage.charlotte.edu` pages have no text in their raw HTML (0 words raw versus 152 rendered, for the home page). The one medium finding: the `www.charlotte.edu` home page marks itself as a generic `Organization` with no `sameAs`, not as `CollegeOrUniversity`.

Still unverified or limited:
- PageSpeed was not run: `PAGESPEED_API_KEY` is not set. Knowledge Graph is "not checked": `GOOGLE_KG_API_KEY` is not set. Scorecard used `DEMO_KEY` (about 10 calls an hour).
- The live entity check was not run, because it needs a profile you confirm. The candidates are proposals; nothing on charlotte.edu was confirmed on your behalf. The 12 peer suggestions are also unreviewed.
- Scorecard still reports Carnegie basic code 16 (high research activity), while the site states UNC Charlotte was designated R1 in February 2025. Peers chosen by Scorecard's class may be based on outdated data.
- The LLM grouping step was not run on live data. Fireworks' price per token is not recorded (unknown), so only its unit cap applies.
- Only 62 of 1,391 hosts were checked in this run. Raise `DISCOVERY_MAX_HOST_CHECKS` (default 1,500) once campus IT is comfortable with one request to the root of every crt.sh name.
- `ninercentral.charlotte.edu` fails TLS verification in Node (likely a missing intermediate certificate; browsers may still load it). It stays excluded until you include it.
- Bot hits were tested on sample lines only; no real server log has been uploaded. User agents are claims and are not verified, since no IPs are kept.
- AI bot categories (search, user_fetch, training) are this repo's reading of the ai.robots.txt `function` field, fetched 2026-11-03. Evidence strengths are our judgment, not measured effects.
- An earlier crawl, `55aa53fa` (193 pages, 398 findings), ran before the redirect fix and is kept as history. Crawl `844ae994` predates the fix that puts spaces between adjacent elements' text, so word counts may shift slightly on the next crawl.
- The gate account `gate-phase2@example.test` remains as an editor. No admin exists, so the first real sign-in still becomes admin.

## 2026-11-03: Phase 1, Foundation

The app now runs on local Postgres 16 with pgvector (Postgres.app on this Mac), Drizzle, and a pg-boss worker. Every original screen works on migrated data.

Added:
- Full schema for ARCHITECTURE section 3, including the 2026-11-03 tables, in `lib/db/pg/schema.ts` and `drizzle/`. Implementation additions are listed in ARCHITECTURE 3.10.
- Immutability in two layers: `lib/db/pg/immutable.ts` refuses updates and deletes on `draws`, `raw_payloads`, `prompt_set_items`, `audit_log` and frozen `prompt_sets`, and Postgres triggers (`drizzle/0001_immutability.sql`) reject them too. No items can be added to a frozen set.
- Content-addressed raw store (`lib/rawstore.ts`). Payloads over 256 KB go to `data/raw/<sha256>`. The hash is verified on every read.
- `scripts/migrate-sqlite.ts`. Dry run by default; `--apply` runs in one transaction and stamps a marker, so re-running changes nothing. It reads a temporary copy, so `data/tracker.db` is never opened for writing.
- Campaigns: CRUD API (`/api/campaigns`), a campaigns page, engines with runner, regions, personas, archive. The migrated Energy campaign is marked as legacy.
- Prompt set freezing (`lib/promptSets.ts`). The hash is sha256 over the JSON array of sorted prompt texts. Freezing an unchanged set returns the existing version. Comparing scans across versions is refused.
- Worker skeleton (`worker/`): `health.ping`, plus an hourly `schedule.tick` that only logs.
- Dev email login with hashed session tokens. Roles admin, editor and viewer are enforced on every API route. Every successful write records an `audit_log` row; campaign changes record before and after.
- Cost guard (`lib/cost/guard.ts`) on `provider_accounts` and `cost_ledger`. SerpAPI capture behavior is unchanged.
- Scripts: `db:up`, `db:backup`, `db:restore`, `user:role`, `worker:ping`; `typecheck` and `test`.
- CI workflow (`.github/workflows/ci.yml`) and an optional `docker-compose.yml`.

Changed:
- The `Store` methods behind the original screens keep their shapes but are now async. The SQLite and JSON stores are removed.
- Saving a manual capture that already exists with different text now returns 409 instead of overwriting. Saving identical text is a no-op. A re-judge adds a judge run (latest wins) instead of replacing the old one.
- The app binds to 127.0.0.1. Signed-out pages redirect to `/login`, and signed-out API calls get 401. `/api/health` stays public and reports counts only.
- Metrics and briefs load judge results in one query instead of one per answer. The output is identical, as the legacy-equality test checks.
- Header title is "UNC Charlotte AI Visibility Platform".

Verification gate (run 2026-11-03 on this Mac):
1. `db:up`, `typecheck`, `lint` pass. The one lint warning in `app/analyze/page.tsx` predates this phase. `npm test` passes all 50 tests across 8 files.
2. Real `data/tracker.db` (sha256 04bfc5e4…8cc8, unchanged after migration). The dry run wrote nothing. `--apply` moved: prompts 50, draws 46, judge_runs 40, provider_cache 47, serp_snapshots 10, Trends signals 16, autocomplete signals 11, cost_ledger 55, recommendations 0. A second `--apply` reported "already migrated" with identical counts.
3. 20 random answers have identical sha256 before and after. Legacy `computeMetrics()` (frozen copy in `tests/legacy/`) equals the new metrics on the real data and on a fixture covering every legacy table.
4. Raw SQL `UPDATE draws`, `DELETE FROM raw_payloads`, `UPDATE prompt_set_items` and `UPDATE prompt_sets` on the frozen v1 all fail with `immutable_violation`.
5. Live server: a viewer gets 403 creating a campaign. An editor creates one (201) and archives it (200). All of it is in `audit_log`.
6. Every page (`/`, `/capture`, `/analyze`, `/serpapi`, `/demand`, `/recommend`, `/config`, `/campaigns`, `/login`) returns 200 and renders content in a browser, with no console errors and no server errors. Dashboard on migrated data: visibility 80.0% (32 of 40; 95% Wilson CI 65.2% to 89.5%).
7. `npm run worker` processed `health.ping`.
8. `db:backup` then `db:restore` into a scratch database gave identical counts on 11 tables. The triggers are present after restore.

Still unverified or limited:
- Legacy draws keep `region_honored = unknown` and `model_build = unknown`; the source never recorded them. Mentions and citations derived from legacy judge JSON have no character spans, and citation URLs are domains only.
- Legacy SerpAPI events have USD = null because the plan's price per credit is unknown. Set `credit_unit_usd` once the plan is confirmed.
- The dev login has no password. It is safe only because the app listens on 127.0.0.1. Real auth (magic link or SSO) is in `docs/PUBLIC_LAUNCH.md`.
- Next.js's dev server redirects signed-out pages to `localhost:3000` rather than `127.0.0.1:3000`. Browsers handle it; command-line clients may need `-L` and IPv4.
- The gate used throwaway `gate-*@example.test` accounts. Their memberships were removed afterwards, so the first real sign-in becomes admin. Their audit rows and an archived "Gate check (archived)" campaign remain.
- The SerpAPI draw-index cache issue (repeated draws can be cache copies) is unchanged, as planned. It is fixed in Phase 3.

## 2026-11-03: Planning docs for Phases 1 to 9

Docs only. No application code changed.

Added:
- `docs/ROADMAP.md`: objectives with acceptance tests, vendor gaps we target, feature list per phase, UI rules, model roles, verification gates, risks.
- `docs/PROVIDERS.md`: provider table and budget carried over from a 2026-10-21 research pass, with [V]/[E] tags. Added Bright Data and Keyword Planner rows (unknown price). Local SERP marked experimental.
- `docs/PUBLIC_LAUNCH.md`: path to a multi tenant public version.
- `docs/prompts/MASTER_CONTEXT.md` and `docs/prompts/PHASE_2.md` to `PHASE_9.md`.
- `docs/prompts/LOCAL_SERP.md` (written for the openserp fork) and `docs/prompts/LOCAL_MODELS.md`.

Changed:
- `docs/prompts/PHASE_1.md` upgraded: local only binding, backup and restore, raw store with file backing, `audit_log`, sessions, CI, verification gate.
- `docs/ARCHITECTURE.md`: new tables (`bot_hits`, `entity_checks`, `seasonal_events`, `search_console_queries`, `ai_referral_traffic`, `serp_snapshots`, `alerts`, `audit_log`, `sessions`), raw payload file storage, sentiment span on `judge_runs`, owner and publish by on strategy items, first mention rate, branded series kept separate, local SERP rules, new job queues, section 12 decisions, section 13 security, section 14 local first data policy.
- `docs/SPEC.md`: thin UI per phase, added features per phase, McNemar instead of a two proportion test, verification gate in the definition of done.

Reconciled with an earlier draft spec: kept McNemar and cluster bootstrap (the draft's two proportion test and Wilson on draws overstate precision for paired, correlated data), kept 5 runners including api_parametric, kept table names from ARCHITECTURE, kept 20 calibration prompts. Took from the draft: master context block, journalist, donor, research partner personas, Keyword Planner and Bright Data candidates, first mention rate, owner and publish by date, dashboard parts.

Unverified:
- Every price in `docs/PROVIDERS.md` (last checked 2026-10-21). Phase 3 rechecks.
- Whether a UI capture provider exists for Perplexity.
- Whether the local SERP service can pass parity. Its own logs show heavy blocking.

Pending (needs a non markdown edit):
- `.gitignore`: add `SerpAPI/`, `backups/`, `data/raw/`.

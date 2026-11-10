# Changelog

## 2026-11-10: R1 — restore FK orphan root cause

- `db:restore` fails when `audit_log.org_id` points at deleted orgs (demo teardown used `session_replication_role=replica` and never removed audit rows).
- Root cause + live counts: `docs/R1_ORPHAN_FK.md`. Scanner: `lib/db/pg/orphanFks.ts`.

## 2026-11-10: Wave 7C — Fireworks spend, model retirement, judge bake-off

- **C1–C2:** Ledger records real Fireworks usage tokens (`usage_estimated` when missing); `max_tokens: 8192`; `finish_reason: length` is an error.
- **C3–C4:** `JUDGE_MODEL` required (no deepseek default); model preflight via OpenAI-compatible `/inference/v1/models` before approve; schedules pause if retired.
- **C5–C9:** `judge_runs.judge_model` already stored; bake-off script `npm run judge:bakeoff`; runbook deferred capture→judge path; Fireworks $25 prepaid cap; BACKLOG dep notes.

## 2026-11-10: Freeze retarget — `v1.0-rc2`

Pilot freeze docs now point at **`v1.0-rc2`** (was `v1.0-rc1`). Drift check: `git diff v1.0-rc2 -- lib/capture lib/judge lib/metrics`. What changed since rc1 on this branch:

- Localhost login fix (`835c85f`); Host/Origin allowlist (middleware + `withRole`), including `/_next/image`; no localhost→127.0.0.1 redirect loop.
- Shared `safeHref` / SafeLink; `images.unoptimized: true`; provider `cache: "no-store"`; worker-ping `retryLimit: 0`; gitleaks fixture fingerprint allowlist.
- **Bright Data removed** (campus IT ban): adapter, registry, budget/env/fixtures; ban test.
- Funding brief: Bright Data out of caps; Judge (Fireworks) units formula + **PRICE NEEDED** for `deepseek-v4-pro`.

## 2026-11-10: Wave 7 Phase B rework (`hardening/v1.0-rc2`)

- Split into one commit per finding (F01 / F05 / F11 / F16 / F17). Login fix `835c85f` remains on the branch.
- **Bright Data removed** (IT + locked rules): adapter, registry, budget row, env, fixtures; ban test in `tests/capture/brightdataBanned.test.ts`.
- **F05 extended:** Host/Origin allowlist on every middleware path including `/_next/image`; same check in `withRole` / `withLegacyRole`; accepts `127.0.0.1` and `localhost`.
- **Images:** `images.unoptimized: true` (local `/brand/*.svg` only; no remotePatterns).
- Branch only — **not tagged, not merged**.

## 2026-11-09: Bugfix — localhost login on loopback bind

- Passwordless login accepts `localhost` / `::1` as well as `127.0.0.1` when `APP_BIND_HOST=127.0.0.1` (Chrome often rewrites the IP). Still refuses non-loopback hosts and non-127.0.0.1 binds.
- Middleware redirects `localhost` → `127.0.0.1` when possible so the address bar stays consistent.

## 2026-11-09: Gate 3 closed + `v1.0-rc1` freeze

- **Row 19:** Overview Search Console panel + Demand card copy “Not connected (property access pending from the web team)”; UNC never shows fixture GSC rows (`tests/gate3/row19-gsc.test.ts`). COVERAGE **19** partial (UNC web team property grant).
- **Gate 3:** All rows done / partial+external / deferred (17+21 in BACKLOG, 2026-11-09 Shailesh). Evidence table in COVERAGE.md.
- **Freeze:** Tag **`v1.0-rc1`** — bug fixes only on `main`; capture/judge/metrics frozen for the pilot. `docs/HANDOVER.md` + updated `docs/PILOT_RUNBOOK.md`. **V1: 4 of 6**.

## 2026-11-09: Gate 4 closed (Answers overlap + Visibility a11y)

- **Answers@390:** Engine/draw tabs use `flex-wrap` + `min-w-0` (no overflowing scroll strip); list/detail grid is `grid-cols-1 lg:grid-cols-2`.
- **Visibility a11y:** Coverage labels use contrast-safe `--status-gain-fg` / `--intent-evaluation-fg`; chart table twin wrapped in `.sr-only` div. Overlap checker clips to overflow ancestors and skips `.sr-only`.
- **Gate 4 evidence:** Vitest **573/573**, Playwright **7/7 ×3**, `tsc` clean, lint (pre-existing analyze warning only), contact sheet 78 PNGs **0** overflow/**0** overlap, Lighthouse a11y **100** on overview/visibility/answers/gaps/budget. **V1: 3 of 6**.

## 2026-11-09: Gate 3 builds + Gate 4 layout/a11y

- **Gate 3 builds:** Row 9 no-audit banner on campaign create → `/audit`. Row 12 citation-rate trend on Visibility (displayable rule). Row 15 Answers sentiment + span, list position, cited page. Row 18 Overview GA4 panel (not connected; no numbers). Row 22 role landing (viewer Overview, editor Visibility, admin Settings switch). Row 25 campaign annotations on every trend chart + `owned_citation_stopped` alert. Rows **17** and **21** deferred to v1.1 (2026-11-09, Shailesh) in BACKLOG.md.
- **Gate 4:** Answers filters stack / horizontal scroll with 44px targets at 390. Visibility chart gets accessible table twin + labeled controls for Lighthouse a11y.
- Migration `0015_gate3_annotations_alerts`.

## 2026-11-09: Wave 6 P2 B1 fixes + B9 + V1 gates 3–4

- **B1 fixes:** Non-demo Demand never shows fixture rows; connected sources without a real fetch show “Connected, not fetched yet” (no rows/chart). `DemandCardStatus` adds `approval_pending` — Trends with key but no live approval → “Not connected (approval pending)”; `estimated` is modeled estimates only. DataForSEO `GET /v3/serp/google/locations` (cost 0) confirms US `2840`, NC `21160`, Charlotte `1021048` (pinning tests unchanged).
- **B9:** Prompt library CSV/PDF per frozen set (`…/prompt-sets/[setId]/library.{csv,pdf}`): text, category, persona, intent, branded, provenance, demand evidence, author, approved by, set hash, frozen date. Viewers + editors; cross-org tests. How we measure lists Wave 6 metrics linked to METRICS.md. COVERAGE **11** done. Migration `0014_b9_prompt_library`.
- **V1 gates 3–4:** COVERAGE Gate 3 re-audit — **Neither** rows 9, 12, 15, 17, 18, 21, 22, 25 (gate 3 open). Gate 4: Vitest **568/568**, Playwright journeys **7/7 ×3**, `tsc` clean, lint (pre-existing analyze warning only), contact sheet `docs/phase9-screenshots/v1g4-*` (78 PNGs both orgs × 13 screens × 390/1024/1440), no horizontal overflow; Answers@390 button overlaps recorded; Lighthouse a11y overview/answers/gaps/budget **100**, visibility **96**. Gate 4 remains **open** on those overlaps. **V1: 2 of 6**.

## 2026-11-09: Wave 6 P2 B3 (Regions)

- Campaign settings: multi-region picker (US national, NC statewide, Charlotte metro, SC/VA/Raleigh/Atlanta) mapped to DataForSEO `location_code` in `lib/capture/regions.ts` (cited `GET /v3/serp/google/locations`). Default remains 1 region.
- Scan estimate multiplies by region count and exposes `usdPerRegion`. Visibility region comparison: yes/unknown only, honored/unknown/no mix, displayable rule, never pooled; parametric/manual → “region not supported”.
- Screenshots `p2b3-regions-*` / `p2b3-campaign-regions-*`. COVERAGE **8** updated. **V1: 1 of 6**.

## 2026-11-09: Wave 6 P2 B1 (Demand) + Journey 6 flake + matrix note

- Journey 6: org-switch waits for navigation + explicit `demo-data-banner` / `role=status` visibility (AppShell shows shell before campaigns/budget). Playwright **15/15** three times in a row.
- Coverage matrix: viewer note when most cells suppressed — “Cells fill in as more prompts are measured (needs 10+ prompts per cell).” Threshold unchanged.
- **B1 Demand** under Content intelligence (`/campaigns/[id]/demand`); legacy `/demand` redirects. Per-source cards: connected / not connected / estimated, last fetch, provenance; never zeros when not connected. Demo uses `demo_seed:v1` fixtures. Exa free-tier live when key exists; Trends live only if `GOOGLE_TRENDS_LIVE_APPROVED`; GSC when granted; DataForSEO keywords + LLM Mentions estimate-gated. Add as custom prompt + evidence links from Prompts. Screenshots `p2b1-demand-{demo,unc}-{390,1024,1440}.png`. COVERAGE **2, 3, 6** updated. **V1: 1 of 6**.

## 2026-11-09: Wave 6 P2 B4 (Competitors + coverage matrix)

- Competitors: SoV trend us vs top 3 peers per index (never pooled), grouped bars for latest scan, peer-average benchmark on SoV KPIs.
- Visibility: intent × engine coverage matrix (strong ≥60% / partial ≥20% / invisible; displayable rule; METRICS.md §6–7).
- COVERAGE **13, 14, 23** done. Screenshots `p2b4-*-{390,1024,1440}.png`.

## 2026-11-09: Wave 6 P1d review + real leadership PDF

- Leadership PDF returns `Content-Type: application/pdf` (binary via `lib/exports/simplePdf.ts`); demo sample `docs/phase9-screenshots/p1d-leadership-demo.pdf` with analyst note, Baseline/Target, headline CI, DEMO DATA watermark on every page.
- Cross-org: other org → 404, right-org viewer → PDF, unauthenticated → 401.
- Row **23** was briefly partial pending B4; closed with peer-average benchmark in P2 B4.

## 2026-11-09: Wave 6 P1c checks + P1d (closes P1)

- **P1c checks:** Freeze rejects `provenance=fixture` outside demo (UI: “Fixture — cannot be frozen”); live Fireworks writer behind key + estimate/cost guard with `CONTENT_MODEL ≠ JUDGE_MODEL` (no key → “not connected”, fixture stays); cosine **0.92** documented in `docs/PERSONAS.md`; near-dupes kept as `similar to: …` (custom carries `provenance=custom` + author); freeze enforces ≥70% unbranded with override reason + audit.
- **P1d:** Baseline on first scan per prompt set; optional campaign target (dashed Target); analyst note 3–5 sentences (AI draft labeled Draft; writer≠judge); leadership Overview+Visibility PDF. Screenshots `p1d-overview-{390,1024,1440}.png`. **V1: 1 of 6**.

## 2026-11-09: Wave 6 P1b checks + P1c generation UI

- **P1b checks:** One late catch-up per schedule on wake (original due stamped; never N catch-ups). Per-run re-estimate pauses when >20% over approved estimate or a provider cap would be crossed (editor re-approval). Admin **Pause all schedules** + audit. `docs/V1_EXIT.md` (6 gates; reports end with **V1: x of 6**) and `docs/BACKLOG.md`.
- **P1c:** Prompts page generation UI (editors): 3–5 personas + intents, fixture-labeled builtin pack, drafts into approval queue with demand evidence + embedding dedupe; Add custom prompt (intent, persona, branded). Openings/fixture stems brand-safe (existing + extended test). Screenshots `p1c-prompts-generate-{390,1024,1440}.png`. COVERAGE row **2** updated (still partial — live keys). **V1: 0 of 6**.

## 2026-11-08: Wave 6 P1a checks + P1b Schedules UI

- **P1a checks:** Demo `cited_pages` tagged `demo_seed:v1` with fictional domains; forbid-list/.edu test. Gap terms exclude brand+aliases and stopwords, require ≥2 pages. Share table uses `displayableCitedPagesShare` (n&lt;3 → “Too few cited pages”; raw for editors). Features labeled “detected automatically” with tooltip; freshness uses published/modified only (never `fetched_at`; no date → `unknown`).
- **P1b:** Settings Schedules UI (editors): create / pause / resume / delete; frozen prompt sets only; biweekly or monthly; next run in America/New_York; per-run estimate + monthly projection vs provider caps; create requires explicit estimate approval; audit on every change. Screenshots: `p1b-schedules-{390,1024,1440}.png`. COVERAGE row **7** evidence updated (still **partial** — live schedule pending funding).

## 2026-11-08: Wave 6 P1a (B2) + P0 approval fixes

- P0 approval fixes: provider error rate **strictly > 0.20** (exactly 20% does not alert); METRICS + renamed test. COVERAGE row **14** stays **missing**; counts **3 done / 19 partial / 6 missing**. `docs/phase9-screenshots/` gitignored; no tracked PNGs.
- **P1a B2:** Answer Explorer citations panel shows cited-page title/H1/H2s, dates, source class, features; gap terms highlighted via `highlightGapTermsHtml` (escape-per-segment). Gap cards render structured **What cited pages share** table with n and `correlation, not cause`. Demo seed writes `cited_pages` + `citedPagesShare` payload. Screenshots: `p1a-*-{390,1024,1440}.png`.

## 2026-11-07: Wave 6 P0 (approved)

- Coverage: row **16** partial→done; row **28** stays **missing** (Budget PDF ≠ Overview+Visibility leadership PDF). Row **14** remains missing (matrix). Final **3 / 19 / 6**.
- Overview questions: intent from stored `prompts.intent` or `"untagged"` (no position-based fabrication).
- Won rule: strict majority `floor(n/2)+1` (n=2 → **2 of 2**); METRICS.md + rollup/`HowMeasured` `w.rule` copy.
- Answer Explorer: `highlightAnswerHtml` applies spans on raw UTF-16 text then escapes segments; returns `{html,skipped}`; sole `dangerouslySetInnerHTML` input. XSS / overlap / null-offset tests in `tests/analysis/highlightAnswerHtml.test.ts`.
- Screenshots: `scripts/p0-review-screenshots.ts` → `docs/phase9-screenshots/p0-*-1440.png` (gitignored).

## 2026-11-06: Pilot ready, pending funding and prompt approval

- Wave 5 complete: stop-loss enforced in `runScan`, fixture rehearsal (`npm run pilot:rehearse`), `docs/PILOT_RUNBOOK.md`, `docs/FUNDING_BRIEF.md`, gold-label sample UI/API.
- **Do not** freeze `energy-core-v1` or run paid capture until content-team approval and funding decision.
- Budget one-page PDF remains `/api/budget/pdf` (estimator-backed).

## 2026-11-06: Wave 4 closed (exit evidence)

- `npx tsx scripts/audit-metrics.ts` → **25 checks, 0 mismatches**.
- `tests/security/crossOrgApiRoutes.test.ts` walks every `app/api/**/route.ts` (61 files); skips unauthenticated `/api/health`, logout (session destroy), and citations aggregates echo heuristic — all other handlers probed with foreign-org ids.
- `npm audit` (omit=dev snapshot varies): Next **14.2.35** still lists critical/high Image Optimizer / RSC DoS advisories; **not exploitable** in our setup (app binds `127.0.0.1`, no `images.remotePatterns`, no untrusted uploads). PostCSS highs are transitive via Next; fix requires Next 15/16 major. Dev-tool transitive highs (Lighthouse/Puppeteer/eslint) accepted.
- **DNS rebinding deferral:** `guardedFetch` already resolves once and pins that address on the socket (`lib/site/net/ssrf.ts`). Deferred work is optional deeper hardening (re-pin every redirect hop against a malicious resolver in production egress) beyond the current pin-on-connect path — not required for localhost pilot.
- **`.env.local` hygiene:** File is gitignored and was never committed in this Wave. Keys live only on the laptop. **Rotate any key that was ever printed in a shared log, pasted into chat, or committed on another branch.** No key material was printed by Wave 4/5 scripts in this closeout; if earlier sessions logged provider secrets, rotate those provider keys in the vendor consoles.

## 2026-11-06: Wave 5 in progress (pilot readiness)

- **Docs:** `docs/PILOT_RUNBOOK.md`, `docs/FUNDING_BRIEF.md` (pilot upper **$12.888** from estimator).
- **Rehearsal:** `npm run pilot:rehearse` (Demo University fixtures + fault modes).
- **Gold-label pull:** Settings → Gold-label sample + `scripts/export-gold-label-sample.ts`.

## 2026-11-06: Wave 4 e2e follow-up (suppression / RBAC / shell)

- Client Role types import from `lib/auth/roles` (not server `lib/auth`) in AppShell / SessionRole / CanAct / rbac.
- Viewer on legacy operator URLs: hard `window.location.replace("/")` so RBAC e2e always leaves the route.
- Visibility: `ShowRawToggle` always at prompt-set card level for editors (not only inside headline cards).
- Suppression e2e asserts on `metric-suppressed` text (no brittle `td` xpath).

## 2026-11-06: Wave 4 implementers pass (security + UX)

**Fixed (high)**

- CSV strategy export: `csvEscape` prefixes cells starting with `=`, `+`, `-`, `@` to block formula injection; `tests/strategy/csvEscape.test.ts`.
- `next.config.mjs`: `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff` on all routes (**production only** so `next dev` + Playwright keep working).
- AppShell **Alerts** navigates to Overview `#alerts` and scrolls; **Download** opens `/api/budget/pdf` (printable budget) with clear labels.
- Prompts table **Persona** uses `personaTaxonomyLabel` from `lib/ui/labels.ts` instead of raw `persona_key`.

**Fixed (medium)**

- `withRole`: unexpected handler errors return generic `{ error: "Something went wrong." }` (500); details logged with `console.error`.
- `HowMeasured`: “technical id: {runner}” visible to editor/admin only when `SessionRoleProvider` is present; hidden from viewers (uses client-safe `lib/auth/roles.ts` so the shell does not bundle server auth).
- AppShell: viewer redirect off legacy operator URLs no longer skips loading campaigns (restores `campaign-switcher` for e2e).
- Citations: plain-language index labels (`searchIndexPlain`); `sourceClassPlain` for source type list.
- Strategy: lever badges use `leverTypeToLabel` from `lib/gaps/display.ts`.
- Budget vendor note: user-facing copy (no internal doc filenames).
- Overview Questions table: `sr-only` `<caption>`.
- AppShell icon rail: removed duplicate `sr-only` expand control (one focusable expand remains).
- Dependencies: `next` **14.2.35**, `zod` **^4.6.6** (installed 4.6.7).
- `GET /api/health`: returns `{ ok, backend }` only (no prompt/credit counts; no error strings on 503).

**Remaining lows / accepted risk (reviews + audit)**

- `.env.local` on disk (gitignored): rotate keys if shared; never commit (security review high → ops hygiene).
- `npm audit`: **Next** and **PostCSS** still flagged critical/high in the advisory database for the 14.2.x line; **accept** until a planned major upgrade (Wave 4 exit asked for zero high/critical — unmet without Next 15/16). **Transitive highs** from **Lighthouse** / **Puppeteer** / **chromium-bidi** (nested **zod** &lt;4.6.6), **glob** via **eslint-config-next**, **esbuild** via **drizzle-kit**, **Crawlee**/**minimatch** tree: accept as dev-only / tooling.
- DNS rebinding: full resolver hardening deferred; `lib/site/net/ssrf.ts` documents pin-on-connect expectation (security review).
- Restore bundle timing in CI: ops follow-up (security review).
- UX review lows: em dash copy polish; shell budget fetch failure silent; `/` search when icon rail; Overview Activity placeholder; site-audit route vs sitemap — unchanged this pass.
- Statistics.md lows (Reviewer 1): unchanged this pass.
- Citations aggregates echo of query `campaign_id` on empty results (security low).

## 2026-11-06: Wave 4 Reviewer 2 (security report + tests)

- `docs/reviews/security.md`: findings (IDOR/citations aggregates note, CSV formula injection, missing security headers, npm audit counts, health exposure, secrets hygiene, backups timing TBD, SSRF/DNS caveat).
- `tests/security/crossOrgApiRoutes.test.ts`, `tests/security/viewerWriteRoutes.test.ts`: automated API probes (`npx vitest run tests/security`).

## 2026-11-06: Wave 4 steps 0A–0C (metric display, questions tabs, copy)

- **0A:** `MetricValue` / `MetricValueScout` centralize displayable suppression; `ShowRawToggle` + `SessionRoleProvider` / `MetricShowRawProvider` in `AppShell`. Overview, Visibility dashboard, and Competitors use them; visibility chart uses hatched columns when suppressed (`data-suppressed="1"`, no `data-rate` for viewers). Position and consistency cells use `displayable()` for k/n thresholds.
- **0B:** `listOverviewQuestions` returns `tabCounts` and `hiddenBrandedCount`; Overview Questions tabs use counts; empty state with hidden branded prompts matches the required copy and button to include branded.
- **0C:** Overview partial notice uses unjudged count when available; overview cards expose `unjudgedCount` and `scanStatus`. KPI captions use comma before `n=`.
- Tests: `tests/phase9/viewerMetricSuppression.test.ts`, `tests/metrics/visibilityChart.test.ts`, `tests/overview/questionsTabCounts.test.ts`.

## 2026-11-06: Phase 9B — Demo peers + stalled scans

- Demo seed (`lib/demo/seedMarked.ts`): inserts five named competitors (NC State, UNC Chapel Hill, Duke, Clemson, Virginia Tech) with `.edu` domains and aliases; judge `mentions` include 1–2 competitor entities per draw on a deterministic hash so share of voice is not 100%; answer text varies more by draw (`drawIdx` / angle); citations skew owned vs competitor mix by engine while McNemar signal engines keep a stable two-citation shape. Demo teardown deletes competitor aliases/domains before competitor rows.
- Stalled scans: `lib/scans/stalled.ts` (`STALL_AFTER_MS`, `isScanStalled`, `reconcileStalledScans`), `tests/scans/stalled.test.ts`, `scripts/reconcile-stalled-scans.ts` (same `DATABASE_URL` guard as seed script).

## 2026-11-06: Wave 4 Step 0 (before reviewers)

- 0A: `MetricValue` + `ShowRawToggle` (editors/admins only); hatched suppressed chart columns; viewer suppression test.
- 0B: Questions `tabCounts` + `hiddenBrandedCount` empty state (“N prompts hidden as location-biased. Show them.”).
- 0C: Partial copy uses unjudged count; metric captions use commas before `n=`.
- 0D: Realistic location-neutral demo prompts; fictional peers only; list positions seeded; forbid-list test.
- 0E: `lib/metrics/apiTypes.ts` + overview parse; `noImplicitAny` explicit; headlines no longer coerce missing promptsWon to 0.

## 2026-11-06: Phase 9B review fixes (pre–Wave 4)

- Overview chart reads `trend.series[].promptsWon` (gradient columns + whiskers); Questions table loads real prompts via `/overview-questions` (no placeholder); institutions from dashboard peers.
- Single suppression rule: `lib/metrics/displayable.ts` used on Overview, Visibility, Competitors.
- KPI badges: rate KPIs get significant / within noise / no previous scan; "Needs review" only on Accuracy.
- Stalled scans: `lib/scans/stalled.ts` + reconcile script; legacy Energy Nov 3 → partial with `stalled: true`.
- Demo: 5 named peers, competitor mentions, varied engine/campaign results; leadership display name Lauren.
- Contrast: muted/demo text darkened; header switchers no truncation at 1440; Answers location-biased badge + Scout filters.

## 2026-11-06: Phase 9B — Scout redesign

- Brand: product name **Scout** (“Scouting what AI says about us”); Inter; tokens in `globals.css` + Tailwind; Charlotte Green accent; Niner Gold logo-only (never text); lucide-react icons; favicon/logo from `public/brand/`.
- App shell: 270px sidebar with nav groups, search (`/`), account spend bars, Open budget; header greeting + campaign/alerts/scan/download; DEMO banner full width; icon rail &lt;1280px, drawer &lt;1024px.
- Overview rebuilt to match `scout-overview-v2` layout using `/api/overview` + dashboard APIs only (engine chips, KPI cards, visibility chart with whiskers, top engine track, questions table, activity/alerts). KPI gain badge only via `kpiStatusFromComparison` when McNemar is significant.
- Remaining screens restyled to Scout cards/tables/pills; new Competitors page; motion (Framer + CSS) with `prefers-reduced-motion` off-switch.
- Tests: no raw hex in app/components, no blended visibility index, within-noise KPI fixture, reduced-motion hooks.

## 2026-11-06: Phase 9 screenshot review round 2 (pre–Wave 4)

- Budget: per-provider pilot/monthly shares from primary route plan only; fallback / calibration / parity are $0 unless scheduled. One role label per row (DataForSEO active; SerpAPI and Local SERP parity check only; Perplexity fallback only; OpenAI/Anthropic/Gemini calibration only; Bright Data not used, blocked by IT). Steady state as core $/mo, persona $/mo (quarterly ÷ 3), total $/mo, total $/yr. Vendor table summary row: "This platform, upper estimate: $X/mo, $Y/yr".
- Demo reseed: 30 prompts × 3 answers × 6 engines per campaign scan; scan 2 differs from scan 1 with at least one McNemar-significant series and others within noise; `demo_seed:v1` markers kept.
- Intervals: no cluster bootstrap when prompt count k &lt; 10 (approximate Wilson or "too few prompts (k=…)"); suppress by prompt and answer count, never mention count; paired comparison never returns a zero-width interval. Tests for k=3 and identical scans.
- Gaps leadership cards: plain-English title, lever, owner, lost questions, shared cited-page traits (with n), evidence with links, suggested action, correlation note. No raw keys.
- Answer Explorer: group by prompt, engine tabs, draws 1–3, filters for engine / named us / persona / runner.
- AIO citation backfill (`lib/citations/backfillFromRaw.ts`, `scripts/backfill-aio-citations.ts`): new citation rows only from draw raw JSON or SerpAPI `provider_cache` when migration stored answer text instead of the full payload; draws untouched. Applied for UNC Charlotte (6 legacy google_aio draws, 69 citations).
- Legacy campaign renamed to "Energy (legacy captures)". Persona display names map to taxonomy labels. Location-biased prompts (brand alias or city) excluded from headlines with a visible note. Em dashes removed from UI copy.

## 2026-11-06: Demo org full seed + admin fixture cleanup

- `seedFullDemoOrg` / `seedMarkedDemoOrg`: 30 approved prompts per campaign (`import:content_team_v1`), one frozen set each, 2 complete scans, 30×3×6 primary-engine draws per scan (540 draws per scan, six engines), judges with brand mentions and supported claims, citations, 2+ gap cards per campaign (structured payload for leadership UI), one cross-campaign strategy report (Energy), `cost_ledger`, `ensureCaptureProviders`, `DEMO_SEED_MARKER` on applicable tables. Per campaign, scan 2 vs scan 1 includes one engine series with McNemar-significant change (6 discordant pairs, `mcnemarExact` alpha 0.05) and other series from a deterministic base mention pattern. Idempotent via `deleteAllDataForOrg` (slug `demo-university-leadership` or duplicate `Demo University` demo org).
- Gaps leadership API (`listCampaignGaps`): enriches rows with `displayTitle`, `leverLabel`, `lostQuestionTexts`, shared-cited-pages summary, evidence links, `suggestedAction`. UI (`app/campaigns/[id]/gaps/page.tsx`) shows plain English only.
- Scripts: `scripts/seed-demo-org.ts` (loads `scripts/env`, requires `DATABASE_URL` ≠ `TEST_DATABASE_URL`), `scripts/admin-cleanup-fixture-contamination.ts` (dry-run default; `--apply` + audited deletes under UNC Charlotte; refuses `TEST_DATABASE_URL` without `--allow-test-db`).
- Typecheck fix: `tests/budget/funding-pdf.test.ts` `FundingPageData` fixture matches `buildFundingPage` (pilot/steady-state fields, `capWarnings`).

## 2026-11-06: Phase 9 review fixes (pre–Wave 4)

- Provenance: prior review screenshots came from `geo_test` (Journey 6 fixture `prompt 0–3`), not
  `DATABASE_URL` (`geo`). Real `geo` has no `prompt N` / fixture-answer contamination. Admin cleanup
  script `scripts/admin-cleanup-fixture-contamination.ts` (dry-run default; `--apply` audits then deletes).
- Tests refuse to start when `TEST_DATABASE_URL === DATABASE_URL`. Fixture draws default to
  `test_fixture:v1`; isolation counts both `demo_seed:v1` and `test_fixture:v1` under UNC Charlotte.
- Full Demo University seed (`seedFullDemoOrg` / `scripts/seed-demo-org.ts`): 3 campaigns, 2 scans each,
  all 6 engines, citations, gap cards, strategy report, budget figures — all `demo_seed:v1`.
- Budget: draft-prompt estimates labeled “based on N draft prompts, pending approval”; provider table
  uses display names + active/calibration/blocked roles; cap-exceeded warnings.
- Intervals: never show zero-width; n&lt;30 shows “too few answers (n=…)” with optional approximate Wilson;
  tests for 0 of 4 and 4 of 4.
- Polish: auto-select first active campaign; single nav active state; Answer Explorer opens first answer
  with prompt/engine/date/persona; dashboard table scrolls at 1024px; one legacy badge; PageStates on
  Site Audit + Onboarding; viewers redirected from legacy operator pages (tested).
- Screenshots: `scripts/phase9-screenshots.ts` against real `DATABASE_URL` only (gitignored output).

## 2026-11-06: Wave 3 — Phase 9 frontend (all 10 screens)

- Production shell wired to UX.md sitemap: Overview, Campaigns + dashboard, Prompts, Answer Explorer, Citations,
  Gaps, Strategy, Site Audit (`/sites` → audit / onboarding), Budget & Funding, Settings. Campaign nav + switcher.
- Leadership copy: `lib/ui/labels.ts` (“AI answers checked”, plain runner/fidelity). Chart captions + HowMeasured
  on headline metrics; tables accompany color. Viewer RBAC hides estimate/approve/edit/run (`OperatorOnly`).
- Budget & Funding: estimator pilot (Energy core) + steady state, provider spend/caps, DataForSEO $50 top-up,
  stop-loss, vendor comparison with source dates, one-page PDF with upper-estimate labels; demo PDF carries exact
  `DEMO DATA, not real results` banner.
- Empty / loading / partial / error states on primary screens; legacy energy scans labeled “legacy method”.
- Playwright journeys in `tests/phase9/` (shared `next dev` on test DB): all 6 UX journeys including leadership
  login → Overview → Budget → PDF; landmark a11y checks.
- Row-level demo isolation: `DEMO_SEED_MARKER` (`demo_seed:v1`) on seeded
  draws / raw_payloads / citations / judge_runs / recommendations / strategy_reports / cost_ledger;
  `tests/phase9/demoIsolation.test.ts` asserts UNC Charlotte has zero marked rows (not merely `orgs.is_demo`).
- Review screenshots stay local under `docs/phase9-screenshots/` (gitignored; public repo).
- Lighthouse + load gates via `scripts/phase9-lighthouse.ts` against `next build` + `next start` (not journey timeouts):
  Overview / Campaign dashboard / Budget for UNC Charlotte and Demo, a11y ≥95, TTFB+FCP+load under 2s.
- `npm run test:e2e` runs `tests/phase9`; `npm test` includes the full Vitest suite.

## 2026-11-06: Wave 2d — Phase 8 content strategy

- Strategy pipeline runs in order: demand → landscape → supply → gaps → plan. Saved as
  `strategy_reports` with hashed inputs; same inputs produce the same report (tested).
- Landscape reuses an existing campaign scan when the topic relates; a new sample is estimate →
  approval → cost guard, fixtures only in tests.
- Missing Trends / Search Console / keywords never score as zero — items show "demand unknown" in
  a separate unscored list.
- Score = demand × gap size × effort; each factor shows source and n; editor edits are audited and
  keep `originalScore` / `originalFactors`.
- Publish-by dates from seeded higher-ed calendar (FAFSA Oct 1, early action Nov 1, regular
  decision Jan, decision day May 1, fall start Aug) plus Trends-ready seasonality hooks.
- Plan items require a playbook lever, owner, evidence grade, and evidence IDs (unknown IDs rejected).
- Off-site section: third-party domains that cite peers but not us. CSV export; demo org gets the
  DEMO DATA banner. Thin strategy screen at `/campaigns/[id]/strategy`.

Verification: 444 tests pass; typecheck passes; lint passes with one pre-existing
`app/analyze/page.tsx` hook warning. No paid provider calls.

## 2026-11-06: Persona taxonomy (content team)

- Source of truth: `docs/PERSONAS.md` — 7 audience groups, 20 menu personas, retained general
  `undergrad`/`grad`, and `business_leader` as a legacy alias of `business_partner` (one persona for
  leaders and potential partners). Five content-team IDs and 459 imported prompts unchanged.
- Migration `0009`: `personas.persona_group`. Openings must not contain brand aliases (tested).
- Metrics cells include `personaGroup`. Dashboards report by group by default; specific personas only
  at ≥30 draws. Campaign picker groups personas and recommends a 3–5 subset.

Verification: typecheck and lint pass (pre-existing `app/analyze/page.tsx` hook warning). Persona,
contracts, and metrics tests pass; full suite 436 tests after Playwright browsers available. No paid
provider calls.

## 2026-11-06: Wave 2c — Phase 7 gap analysis

- Persona note: the industry_partner/employer split shipped in this wave was superseded by the
  content-team taxonomy above (`business_partner` only).
- Lost cohorts per engine × runner using METRICS won rules; branded excluded; `api_search`
  requires `search_used`.
- Fan-out → organic join is fixture-only and estimate-gated. Term lift uses Dirichlet prior,
  requires ≥10 cited pages per cohort, shows n, and labels `correlation, not cause`.
- Nearest owned page reports `dedupe`/embedding disabled or `no matching page, consider a new page`.
- Recommendation cards: playbook lever, owner, evidence grade, grounded writer (evidence IDs
  required; unknown IDs rejected). `CONTENT_MODEL` must differ from `JUDGE_MODEL`. Writer path
  is estimate → approval → cost guard.
- Truth layer shows our fact, conflicting value, and source URL (no auto-correct).
- Pre-registration locks targets, baseline scan, and prompt-set hash; McNemar outcomes are
  improvement / decline / within noise on matching hashes only.
- End-to-end fixture: lost energy prompt → recommendation → publish → follow-up → outcome.

Verification: 436 tests pass; typecheck passes; lint passes with one pre-existing
`app/analyze/page.tsx` hook warning. No paid provider calls.

## 2026-11-06: Wave 2b — Phase 4 personas and prompt generation

- Citation follow-ups before Phase 4: org-scoped `source_class_overrides`, Charlotte/higher-ed domain
  lists (including review sites), top unclassified domains plus `other` share with n on citation
  aggregates, answer-capsule near flag (15–40 words) with word count, and `docs/EVALS.md` pending a
  20-page hand-check after the pilot.
- Seeded the 11 canonical personas. Content-team keys stay mapped explicitly
  (`undergrad`→`prospective_first_year`, `grad`→`grad_applicant`, `business_partner` owns selectable
  `employer`, `business_leader` is a legacy alias, `research_partner` unchanged). The five seeded IDs
  and 118+341 imported prompts remain unchanged.
- Fixture-only demand adapters: Trends, Search Console, PAA, autocomplete, related searches, Exa,
  DataForSEO keywords, LLM Mentions. Each reports `not_connected` when keys/access are missing.
  Seasonal event seed requires a source URL.
- Prompt generation is estimate → approval → cost guard, fixture-only in this wave. Drafts only;
  provenance plus verified demand evidence ids, or the explicit label `no demand evidence`. Branded
  detection uses the alias table (Charlotte alone is not branded) and warns under 70% unbranded.
  Embedding dedupe shows `dedupe disabled` when the local model is unavailable.

Verification: 403 tests pass; typecheck passes; lint passes with one pre-existing
`app/analyze/page.tsx` hook warning. No paid provider calls.

## 2026-11-06: Wave 2a — Phase 6 response and citation analysis

- Added canonical cited-page caching and a `citation.fetch` worker. Fetches use the identifying
  `UNCCGEOAudit/<version> (+<CRAWLER_CONTACT_URL>)` User-Agent, apply robots.txt before every redirect
  hop, route every request through the SSRF guard, and record blocked/error outcomes without retries.
- Third-party extracted text is forced into the ignored local raw store. Stored/exportable page data is
  limited to derived features and evidence metadata.
- Added tested cited-page structure features and the approved source classes, with higher-ed kinds for
  rankings, listings, Wikipedia, Reddit, YouTube, news, government, and peer `.edu` sites.
- Added an organization-scoped Answer Explorer API with safe UTF-16, code-point, and UTF-8 byte spans,
  plus citation aggregates that require explicit engine, runner, fidelity, and chat/Google index bounds.
  Every aggregate rate includes `n` and a Wilson 95% interval.
- Added a fixture-only Content Analysis adapter. Capability and price remain `unknown`; there is no live
  transport, and execution requires an exact estimate approval plus the normal cost guard.

Verification: 381 tests pass, including the 6 browser-backed crawler tests; typecheck passes; lint passes
with one pre-existing `app/analyze/page.tsx` hook warning. No paid provider call or live cited-page fetch
was made.

## 2026-11-06: Local-only passwordless login guard

- The development email login now refuses production, any bind other than explicit `127.0.0.1`, and requests addressed to another host.
- `APP_BIND_HOST=127.0.0.1` is required and set by the local `dev` and `start` scripts. Real hosting requires magic-link authentication or university SSO.
- Added tests for production, `0.0.0.0`, and `localhost` refusal.

## 2026-11-06: Wave 1 security hardening

- Legacy compatibility APIs now refuse requests unless the active membership belongs to the original legacy organization. This closes the single-tenant `PgStore` path to demo or other organizations.
- Only the first local account can bootstrap the first admin membership. Later accounts receive no implicit tenant access; an administrator grants an explicit org-scoped role with `npm run user:role -- <email> <role> [org-slug]`.
- Added tests for cross-org legacy API refusal, active-org role isolation, switch auditing, protected cookies, and complete legacy-route gating.
- API tokens remain deferred because the local pilot has no external API consumer.

## 2026-11-06: Wave 1 secure app shell

- Authentication now keeps the session token and active-organization selector in separate httpOnly, sameSite=lax
  cookies. The selector grants no access: every request reloads the session, explicit membership, and role.
- `GET /api/auth/me` returns all and only the user's organization memberships plus the active organization's demo
  state and validated theme. `POST /api/auth/org` refuses non-members, audits successful switches, and clears
  incompatible browser context by returning to Overview.
- Added the production shell with organization and campaign context, role/read-only state, semantic navigation,
  visible focus, skip link, landmarks, exact global `DEMO DATA, not real results` banner, and safe per-org theming.
- Replaced the pooled root dashboard with an honest Wave 1 Overview empty state. The old dashboard moved to
  `/legacy` with `Legacy, not METRICS.md compliant`; the remaining legacy demand page carries the same label. Legacy
  tools are absent from production navigation.
- Added an honest Budget shell with no typed estimate values and a Settings shell that states API tokens are deferred.
  Leadership-route tests prohibit the legacy `@/lib/metrics` module and `/api/metrics` while allowing the compliant
  `@/lib/metrics/` directory.
- Removed downloaded IBM/Source fonts. The default theme uses official green `#005035` and gold `#A49665`; local
  system/Cambria/Arial Narrow stacks are documented in `docs/BRAND.md`, including the Calluna/Interstate licensing
  requirement. No logo was recreated.

Verification: typecheck passes; lint passes with one pre-existing `app/analyze/page.tsx` hook warning; all 18 focused
auth/shell/contract tests pass. Full suite: 355 passed, 1 skipped, 2 failed only because the gitignored content-team
CSV is absent from this isolated worktree (the second failure depends on that import). Playwright used
`/Users/skumar54/Library/Caches/ms-playwright`. No paid calls or exports were run.

## 2026-11-06: Wave 1 database and operations foundation

Additive migration `0007` prepares the contracts for Phases 6, 4, 7 and 8 without changing existing IDs or raw ledgers.

- Organizations now identify demo tenants and carry per-org theme config.
- Cited pages record fetch status/error, robots evidence, identifying user agent, outbound links and structured page features; full text remains file-backed through `text_ref`.
- Personas add optional region and typical questions. Prompt, crawl-page and cited-page embeddings record their dimension.
- Recommendations retain their existing broad kind and add the separate seven-value GEO Playbook lever, owner and evidence grade.
- Scans can be paused with stop-loss config, reason and time. The default contract is 20% error/blocked in the first 60 draws or 25% over estimate; enforcement remains a backend unit.
- Added dashboard and Phase 4/6/7/8 indexes for scans/draws, latest judge runs, analysis foreign keys, cost, alerts, demand, recommendations and strategy.
- Local backups are now bundles containing `pg_dump`, a separate `data/raw/` copy and a manifest. Added an opt-in macOS 02:00 launchd installer and conflict-safe raw restore; see `docs/BACKUPS.md`.

Verification: focused schema/backup tests and typecheck are recorded in the Wave 1 handoff. A `geo_test` bundle restored into `geo_wave1_restore` with the same 60 public tables, 7 Wave 1 contract columns and 6 immutability triggers. Raw-file copy/conflict behavior is covered by a focused test (the scratch bundle contained no raw files). No paid calls were made.

## 2026-11-06: Wave 1 shared contracts

Added a contract-only `lib/contracts/` module for Phases 6, 4, 7, 8 and 9. Zod schemas now pin demo export banners, unpooled measurement metadata, safe cited-page fetch/export boundaries, the 11 canonical personas and seeded-key migration, seven evidence-backed gap levers, strategy evidence IDs, and strict pilot stop-loss thresholds. API tokens remain deferred; no schema, provider, route, or UI code changed.

Verification: typecheck and all 9 focused contract tests pass. The full suite reached 337 passed and 1 skipped; 5 unrelated tests failed because this isolated worktree does not contain the gitignored content-team CSV or a Playwright browser binary (the remaining failures are downstream assertions in those suites).

## 2026-11-06: Content-team prompt import (AI, Energy, Internships)

Stakeholder CSV import only (not Phase 4 generation). `inputs/` is gitignored (public repo). Source: `inputs/content-team/content_team_prompts_v1.csv` (PDF optional later).

- Migration `0006`: `personas.key` / `draft_prefix`; `prompts.note`, `external_id`, `persona_mode`, `doc_personas`, `suggested_personas`; `prompt_sets.label`.
- Seeded library personas (undergrad, grad, business_partner, research_partner, business_leader) with draft prefixes. Non-legacy campaigns AI / Energy / Internships (`settings.content_team_v1`). Legacy Energy untouched.
- `npm run prompts:import` → **118 neutral + 341 persona variants** (idempotent). All `status=draft`, `provenance=custom`.
- Review UI: `/campaigns/[id]/prompts` (filters, bulk approve, near-dupe highlight). Freeze API accepts `{ filter: core|persona, label }` — **not frozen yet**.
- Estimates only (6 engines × 3 draws × Charlotte, no spend): core **2124** draws (~$50.69 upper); persona **6138** draws (~$146.49 upper); total ~$197.19. Stopped for approval.

## 2026-11-06: Phase 5 — scans, schedules, measurement

Goal: “x of N prompts” with honest intervals, schedules, and alerts. Formulas live in `docs/METRICS.md`.

**Metrics:** `lib/metrics/` — Wilson prompts-won, cluster bootstrap (2000 iters, seed 20261103), McNemar + paired bootstrap compare, rollup cells by engine×runner×region×persona×branded. Never averages runners or pools chat vs Google indexes. Branded series excluded from the headline. `api_search` counts only when `search_used = true`.

**Schedules:** `lib/schedules.ts` + migration `0005` (`schedules.enabled`, `scans.period_key`, unique period). `schedule.tick` creates one scan per period; auto-runs only under `budget_cap_usd`; else awaits approval and raises `budget_threshold`.

**Alerts:** `alerts.evaluate` — significant decline, budget 80%/100%, provider error rate strictly >20%, blocked. Canary failures remain Phase 3.

**Scan hardening:** atomic `approveScan`; `assertScanOrg` on all paid worker jobs; canary reuse on `scan.run` redelivery; `runScan` only while `status=running`.

**UI/API:** `/campaigns/[id]/dashboard`, schedules + alerts + model-events routes (org-scoped, audited writes).

**Tests:** metrics / schedules / alerts suites (87+ related tests green). Full Phase 5 live gate (Energy campaign scan + second scan McNemar + scheduled tick) still needs an approved paid run when you want it.

Not done: stored rollup table; Recharts trend chart; model-event chart markers; DataForSEO Standard queue for Google SERP `40101`.

## 2026-11-06: Phase 3 live dry-run (scan `3e5984e7-75a7-42a8-a5c6-841732e27733`)

Ran `npm run capture:dry-run` against DataForSEO only (Charlotte). Estimate **$1.4320** approved; actual ledger **$0.6641**. Status **partial** (7 Google SERP errors from DataForSEO `40101 Internal SE Server Error`; recorded as error draws, batch continued). All 6 canaries ok.

| engine | runner | fidelity | ok | error | actual | estimate |
|---|---|---|---:|---:|---:|---:|
| chatgpt | ui_provider | high | 9 | 0 | $0.0400 | $0.0400 |
| gemini | ui_provider | high | 9 | 0 | $0.0400 | $0.0400 |
| perplexity | api_search | medium | 9 | 0 | $0.0619 | $0.6360 |
| claude | api_search | medium | 9 | 0 | $0.4701 | $0.6360 |
| google_aio | serp_provider | high | 4 | 5 | $0.0200 | $0.0400 |
| google_ai_mode | serp_provider | high | 7 | 2 | $0.0320 | $0.0400 |

Checks: every draw has runner, fidelity, `region_honored`, and `model_build` (or `unknown`). One ChatGPT prompt’s three draws have three distinct `raw_payload_id` and answer texts.

Manual retry of the 7 Google error draws (estimate $0.028, then remaining 2 at $0.008): **5 ok** (attempt 2), **2 still error** on `google_aio` for prompt `fde120df` (draws 2 and 3) with the same DataForSEO `40101` — failed rows kept; stopped (no retry loop). CLI helper: `scripts/retry-failed.ts`.

## 2026-11-04: Fixture redaction + CI Chromium (GitGuardian / Vitest)

Capture fixtures now use `REDACTED_FIXTURE_TOKEN` / redacted SerpAPI archive URLs instead of high-entropy sample page tokens that GitGuardian flagged on commit `47bd056` (documented provider samples, not live keys). Added `scripts/redact-fixtures.ts` and `.gitguardian.yaml` ignoring `tests/fixtures/capture/**`. CI installs Chromium before tests so the Phase 2 crawl e2e does not fail empty-page assertions on `ubuntu-latest`.

## 2026-11-04: Claude primary moved to DataForSEO; `draws.search_used` added

Approved: Claude primary = DataForSEO LLM Responses with `web_search: true`, country and city from the region (US / Charlotte). Runner `api_search`, fidelity medium. Anthropic remains as the calibration fallback only. Added nullable `draws.search_used` (migration `0004`) so Phase 5 can count api_search draws that actually searched. Paid-call retries stay manual only (`retryLimit: 0` on jobs; `planRetry` / `runRetry` require an approved estimate).

## 2026-11-04: Perplexity primary moved to DataForSEO (medium fidelity)

Bright Data’s site is blocked by campus OneIT, and DataForSEO’s LLM Scraper still covers only ChatGPT and Gemini. Perplexity’s primary route is now DataForSEO Live Perplexity LLM Responses (`DATAFORSEO_PERPLEXITY_MODEL`, e.g. `sonar`), runner `api_search`, fidelity **medium**. These draws are never labeled UI. Bright Data adapter remains in the repo but is not an approved primary. Cursor terminals get Node on PATH via `.vscode/settings.json` and `~/.zshenv`.

## 2026-11-03: Phase 3, Capture layer (code complete; live gate waits for keys)

The platform can now capture answers from ChatGPT, Gemini, Perplexity, Claude, Google AI Overview and Google AI Mode through the providers approved in `docs/PROVIDERS.md` section 7. Every draw records its runner, fidelity, region honored, model build (or "unknown"), cost and latency, and every paid call goes through the cost guard. All adapters are built and tested against the providers' documented sample responses. No live provider call has been made yet, because no capture keys are set.

Added:
- Adapters (`lib/capture/adapters/`):
  - DataForSEO: LLM Scraper for the ChatGPT and Gemini UI, AI Mode, organic results with `load_async_ai_overview`, and LLM Responses for the parametric series.
  - Bright Data for the Perplexity UI.
  - Anthropic, OpenAI, Perplexity Agent API and Gemini grounding, all with web search.
  - SerpAPI with `no_cache=true` and `page_token` follow-up.
  - Local SERP, which stays experimental until `parity-report.md` passes and is under 35 days old.
  - `capture` never throws. Network errors, 4xx and 5xx responses, malformed JSON and timeouts all become error draws, and missing keys or models become blocked draws. AI Overview state is recorded as shown, not shown, failed or blocked.
- Routing (`lib/capture/registry.ts`): primary, fallback, parametric and parity route per engine (ARCHITECTURE 5.2).
- Pipeline (`lib/capture/run.ts`, `batch.ts`):
  - Order of work: estimate, cost guard, capture, raw payload, draw row, ledger row, citations, fan-out queries, organic snapshot.
  - The cache key includes scan, draw index and attempt. Draws are idempotent per cell.
  - Up to 2 draws run at once per provider.
  - "Retry failed draws" shows its cost first and adds new attempts; the failed rows stay.
- Canaries (`lib/capture/canary.ts`): one fixed prompt per route before every scan. A failed canary raises an alert and removes that route from the scan.
- Calibration (`lib/capture/calibration.ts`): 20 prompts per engine on the primary and fallback runners. Mention agreement is reported with n and a Wilson interval; citation domain Jaccard with n and a 95% interval.
- Fan-out (`lib/capture/fanout.ts`): organic results for new fan-out queries, budgeted and approved first.
- Judge v2 (`lib/judge/aliases.ts`, `v2.ts`):
  - Mentions, spans, list position and prominence come from deterministic alias matching. "Charlotte" alone never counts as the university.
  - The LLM gives only sentiment with a quoted sentence, claims and named sources. It gets one repair call, and both raw outputs are stored.
  - Prompt version `v2-2026-11-03`.
- Screens:
  - Settings > Providers: key status, routes, last canary, this month's spend, and limits that admins can edit.
  - Capture test: pick prompt, route and region; see the estimate; approve that exact amount; run one draw; see parsed results and the raw payload.
- API routes: `/api/providers`, `/api/capture/test`, `/api/capture/batch`, `/api/capture/retry` and `/api/capture/fanout`. Worker queues: `scan.run`, `capture.retry`, `fanout.run` and `judge.run`, all with no automatic retries.
- `npm run capture:dry-run` (`scripts/dry-run.ts`): plans 3 prompts × 6 primary routes × 3 draws in Charlotte and prints the estimate. It runs only with `--approve <scan id> --usd <exact total>`.
- Tests: 7 new test files, 79 new tests, 248 in total. They cover each adapter against recorded fixtures (including network error, 4xx, 5xx and malformed JSON), the cache key per draw index, budget refusals, idempotent cells, retries, canaries, the alias matcher on "Charlotte" city traps, the judge repair path, calibration math, routes and the dry run.

Changed:
- Schema: migration `0003_phase3_capture.sql`; details in ARCHITECTURE 3.12.
- Legacy SerpAPI AI Overview capture: measurement calls send `no_cache=true` and skip the local cache. Each draw gets its own index, and the estimate assumes 2 uncached calls per prompt (PROVIDERS section 6).
- Cost guard:
  - The monthly budget now sums this UTC month's ledger rows. The old counter was never reset, so it would have refused everything from the second month on.
  - USD estimates and per-scan caps are supported.
  - Identical refusal messages are listed once.
- Nav: Capture test, Providers. Only the most specific link is highlighted.
- `.env.example`: all Phase 3 variables, with where to get each key.

Known limits:
- DataForSEO runs in live mode only, which costs $4.80 per default scan instead of $1.44 on the standard queue. The standard queue is not built yet because its polling has not been checked against a real response (PROVIDERS section 8).
- Token-billed models are priced only for the names in `lib/capture/pricing.ts`. Any other model is refused as "unknown price".
- Third-party UI providers still need the procurement review of their collection method before production data (PROVIDERS section 7).

Verification gate (live dry-run completed 2026-11-06 on this Mac):
1. `typecheck` / `lint` / tests were green before the dry-run (CI on `614a550`).
2. Live dry run: scan `3e5984e7-75a7-42a8-a5c6-841732e27733`. Estimate $1.4320 → actual $0.6641. Counts in the 2026-11-06 entry above. Anthropic not required (Claude primary = DataForSEO).
3. Distinct raw payloads: confirmed live (ChatGPT prompt `fde120df-…`, 3 unique `raw_payload_id` and answers).
4. Runner, fidelity, region honored, model build: present on all 54 measurement draws (0 missing).
5. Legacy draws still render: every page returns 200, the dashboard still reads 80.0% (32 of 40; 95% Wilson CI 65.2% to 89.5%), and `data/tracker.db` is unchanged (sha256 04bfc5e4…).

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

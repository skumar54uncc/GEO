# Coverage audit (Wave 6)

**Date:** 2026-11-07 (Part A); P0 approved 2026-11-08 with fixes folded into P1 start  
**Rule:** Status is **done**, **partial**, or **missing**. Code that exists but has never run on real (non-fixture) data is **partial**.

**Live** = paid or production org data outside pure fixtures. **Fixture** = unit/e2e/demo seed / adapter JSON.

**Review decisions:**
- Row 28: no unauthenticated/tokenized routes. Shareable = logged-in **Overview + Visibility** leadership PDF (`GET /api/campaigns/[id]/leadership-pdf`). Budget PDF alone ≠ row 28. **done** (P1d).
- Row 9: no hard gate; onboarding→audit + campaign banner (P1/P2).
- Row 11: keep 4 intents; add `prompts.category` + CSV/PDF library export (P2 B9) — **done**.
- Row 14: stays **missing** until intent × engine matrix ships (Overview intent display was a bug fix, not the matrix).
- Row 16: **done** (Overview + Visibility engine breakdown is enough).

---

## Status changes in P0 (old → new)

| ID | Old (Part A) | New | Notes |
|----|--------------|-----|-------|
| 16 | partial | **done** | Accepted; Overview + Visibility engine breakdown is enough. |
| 28 | missing | **missing** | Draft briefly marked **done** via Budget PDF; **reverted**. Needs Overview+Visibility PDF (P1d). |

No other row statuses changed in P0. Row 14 remains **missing** (matrix not built).

---

## Counts

Part A published: **2 done / 21 partial / 5 missing**.

P0: only **16** partial→done. Row 28 stays missing. Row 14 stays missing (matrix).

| Status | A1 | A2 | Total |
|--------|----|----|------:|
| done | 2 | 12 | **14** (1, 9, 11–16, 22–25, 27, 28) |
| partial | 8 | 4 | **12** (2–8, 10, 18, **19**, 20, 26) |
| missing | 0 | 0 | **0** |
| deferred to v1.1 | 0 | 2 | **2** (17, 21) |

Recount check: 14 + 12 + 0 + 2 = 28.

---

## A1. Original 10 objectives

| ID | Status | Evidence | Live/fixture | Gap |
|----|--------|----------|--------------|-----|
| 1 | **done** | Campaigns, dashboards, prompts; journeys J2–J3 | Fixture + demo | Live UNC history pending funding |
| 2 | **partial** | Personas, freeze gates, generate UI, custom prompts with demand evidence ids linking to Demand rows, Add as custom prompt from Demand | Fixture + demo | **External:** Fireworks production keys (platform ops / budget owner); content-team freeze approval (UNC Charlotte content team) |
| 3 | **partial** | 6 engines + Demand page (Content intelligence): Trends/region/rising/related, keywords, PAA, autocomplete, Exa web+Reddit, GSC, LLM Mentions; cards `connected` / `not_connected` / `estimated` (modeled only) / `approval_pending` (“Not connected (approval pending)”); non-demo never shows fixture rows (“Connected, not fetched yet”); legacy `/demand` redirects | Fixture + demo | **External:** UNC web team Search Console property grant; product owner `GOOGLE_TRENDS_LIVE_APPROVED`; DataForSEO budget owner for keywords/LLM Mentions; medium-fidelity Claude/Perplexity remains until provider UI parity |
| 4 | **partial** | Answer Explorer + `highlightAnswerHtml`; citations panel shows cited-page title/H1/H2s with gap-term highlights (`highlightGapTermsHtml`) | Fixture + demo | **External:** Funding for live UNC cited-page fetch history (pilot budget owner) |
| 5 | **partial** | Gap cards + structured **What cited pages share** table (n, terms/headlines, types, FAQs, freshness, peers; `correlation, not cause`) | Fixture + demo | **External:** Live demand fetches + richer “why they appeared” blocked on keys/funding (same owners as row 3) |
| 6 | **partial** | Strategy pipeline; Demand evidence available for prompt provenance | Fixture + demo | **External:** Live demand fetches pending keys/funding (row 3 owners) |
| 7 | **partial** | Metrics + schedules API + Settings Schedules UI (create/pause/resume/delete, frozen set only, biweekly/monthly, ET next run, estimate approval gate, audit) | Fixture + demo | **External:** Funding for first live scheduled scan (pilot budget owner) |
| 8 | **partial** | Campaign multi-region picker (US/NC/Charlotte + metros) with DataForSEO `location_code` map; estimate × region count + cost/region; Visibility region comparison (yes/unknown only, honored mix, never pooled; “region not supported” for parametric/manual) | Fixture + demo | **External:** Funding for live multi-region paid scan (pilot budget owner) |
| 9 | **done** | Onboarding + audit; campaign create shows soft banner when org has no site audit, link to `/audit` | Fixture + demo | — |
| 10 | **partial** | URL onboarding, entities | Fixture | **External:** Live knowledge-graph / entity enrichment deps (data vendor + web team site access) |

## A2. Article requirements

| ID | Status | Evidence | Live/fixture | Gap |
|----|--------|----------|--------------|-----|
| 11 | **done** | Four measurement intents + optional `prompts.category`; frozen-set library CSV/PDF (`GET …/prompt-sets/[setId]/library.{csv,pdf}`) with text, category, persona, intent, branded, provenance, demand evidence, author, approved by, set hash, frozen date; viewers+editors; How we measure lists Wave 6 metrics | Demo + tests | — |
| 12 | **done** | citationRate + Visibility citation-rate trend series (same displayable rule; engine×runner never pooled) | Demo + tests | — |
| 13 | **done** | Competitors SoV trend (us vs top 3 peers per index) + grouped latest bars; never pooled | Demo + tests | — |
| 14 | **done** | Intent × engine coverage matrix on Visibility (strong/partial/invisible; METRICS.md §6) | Demo + tests | — |
| 15 | **done** | Highlights; Answers shows sentiment + justifying span, list position, cited source page | Demo + tests | — |
| 16 | **done** | Engine chips + CellTable | Demo | — |
| 17 | **deferred to v1.1** | Variants as prompts | — | Decision 2026-11-09 (Shailesh); see BACKLOG.md |
| 18 | **partial** | Overview GA4 panel: “Not connected (GA4 access pending from the web team)” — no placeholder numbers | Fixture | **External:** UNC web team GA4 property access |
| 19 | **partial** | Overview Search Console panel + Demand `search_console` card: “Not connected (property access pending from the web team)”; UNC never shows fixture GSC rows (`tests/gate3/row19-gsc.test.ts`) | Panel + Demand | **External:** UNC web team Search Console property grant |
| 20 | **partial** | botlog /bots | Fixture | Deferred B6 — live bots **External:** UNC web/CDN team server logs |
| 21 | **deferred to v1.1** | nearestPage, preregister | — | Decision 2026-11-09 (Shailesh); see BACKLOG.md |
| 22 | **done** | Viewers → Overview; editors → Visibility; admins choose default home in Settings | Demo + tests | — |
| 23 | **done** | Baseline + targets + peer-average SoV benchmark on KPI cards (chat/google separately) | Demo + tests | — |
| 24 | **done** | Analyst note per scan (3–5 sentences, author/date); AI draft labeled Draft until edit+approval; writer≠judge | Demo + tests | — |
| 25 | **done** | Model events + campaign annotations (press release / campaign launch / content launch) on every trend chart; alert `owned_citation_stopped` per engine, deduped | Demo + tests | — |
| 26 | **partial** | Schedules worker + Settings UI; Budget PDF | Tests + demo shots | **External:** SMTP/Graph delivery (UNC IT / messaging admin); live schedule funding (pilot budget owner) |
| 27 | **done** | METRICS.md | N/A | — |
| 28 | **done** | Overview+Visibility leadership PDF: `GET /api/campaigns/[id]/leadership-pdf` (auth); headline+CI, trend, engines, analyst note, Baseline/target, methodology link, DEMO DATA watermark in demo | Auth + demo sample | Budget PDF remains separate |

### Row 28 — leadership PDF

| Item | Detail |
|------|--------|
| Route | `GET /api/campaigns/[id]/leadership-pdf` (`withRole("viewer")`) |
| Contents | Overview headline with CI, trend label, engines table, analyst note, Baseline/target labels, methodology link (`/how-we-measure`); DEMO DATA watermark in demo org |
| Also exists | Budget PDF `GET /api/budget/pdf` (funding) — not a substitute for row 28 |
| Verdict | **done** (P1d) |

---

## External access still needed

GA4 · Search Console · server/CDN logs · SMTP/Graph (deferred) · Exa/Trends/DataForSEO keys · content-team + funding for live pilot

---

## Gate 3 re-audit (2026-11-09 / closed 2026-11-09 night)

Rule: every row **done**, **partial** with a **named external blocker** (who + what), or **deferred to v1.1** by recorded decision.

| Bucket | IDs |
|--------|-----|
| **done** | 1, 9, 11–16, 22–25, 27, 28 |
| **partial + named external** | 2–8, 10, 18 (GA4 — UNC web team), **19** (Search Console — UNC web team property grant), 20 (CDN logs), 26 (SMTP/Graph + funding) |
| **deferred to v1.1** | 17, 21 (2026-11-09, Shailesh — BACKLOG.md) |
| **Neither** | **none** |

### Built / deferred confirmation (test names)

| COVERAGE | Status | Evidence (test name) |
|----------|--------|----------------------|
| 9 | done | `Gate 3 landing + audit banner` → `exposes soft no-audit banner copy with audit link intent` |
| 12 | done | `Gate 3 citation-rate trend` → `builds citation rate series and applies displayable rule` |
| 15 | done | Answers UI + judge spans; `list position and prominence` (`tests/capture/judge.test.ts`); phase6 sentiment spans |
| 18 | partial | Overview `data-testid="ga4-panel"` — GA4 access pending from the web team |
| 19 | partial | `UNC Demand Search Console shows access-pending copy with zero fixture rows`; `Overview GSC panel copy matches access-pending label` |
| 22 | done | `routes viewers to Overview and editors to Visibility` |
| 25 | done | `covers press release, campaign launch, content launch`; `owned_citation_stopped alert` (`tests/alerts/ownedCitationStopped.test.ts`) |
| 17 | deferred v1.1 | BACKLOG.md · 2026-11-09 · Shailesh |
| 21 | deferred v1.1 | BACKLOG.md · 2026-11-09 · Shailesh |

**Gate 3: done** (every row done / partial+external / deferred).

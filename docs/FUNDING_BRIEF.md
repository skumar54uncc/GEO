# Funding brief (leadership)

**Audience:** Lauren and executive sponsors  
**Product:** Scout ("Scouting what AI says about us")  
**As of:** 2026-11-11  
**Decision requested by:** 2026-11-20

---

## What Scout does

Scout shows what major AI search surfaces say about UNC Charlotte when people ask neutral questions. It asks the same prompts across engines, stores every answer unchanged, and scores whether we are mentioned, cited, and positioned fairly next to peers. Dashboards report how many prompts we win, with sample size and a likely range, so one screenshot is never treated as the whole story.

---

## What this pilot proves, and does not

| Proves | Does not prove |
|--------|----------------|
| End-to-end capture, judging, metrics, and dashboards on the approved Energy core set (30 prompts × 6 engines × 3 answers) | That every consumer app account sees the same answer as our capture |
| Cost caps and upper-bound pricing from our estimator | Exact vendor spend to the cent before the run (actuals come from the ledger after) |
| Operational readiness on the Mac-hosted stack | Cloud SLA, 24/7 staffing, or multi-campus hosting |
| Repeatable measurement on a frozen prompt set | Full persona library volume in one week |

Claude and Perplexity use API capture with web search (medium fidelity). They are labeled that way. They are not consumer app sessions.

---

## The ask

| Item | Amount |
|------|--------|
| DataForSEO top-up | $50 one time |
| Fireworks prepaid | $25 one time, auto top-up off |
| **Total cash** | **$75** |
| Expected pilot spend | Capture up to $12.89, plus judging measured during the pilot within the $25 cap |

---

## Steady state (capture plus judging)

**Planning range. Real judge cost is measured in the pilot.**

Capture alone is **$150.22/mo** (core twice per month plus persona share amortized monthly). That figure is capture only. It is not the total platform cost. It leaves out judging.

Judge calls per month (same series as the estimator; all draws as the upper bound):

| Series | Calls / month |
|--------|----------------|
| Core (118 prompts × 6 engines × 3 answers × 2 runs) | 4,248 |
| Persona (341 prompts × 6 × 3, quarterly ÷ 3) | 2,046 |
| **Upper bound (all draws)** | **6,294** |

Planning USD uses Fireworks serverless prices (source: docs.fireworks.ai/serverless/pricing, dated 2026-11-10):

| Model | Typical (2,000 in / 1,500 out, no repair) | Upper (3,000 in / 4,000 out, one repair) |
|-------|---------------------------------------------|------------------------------------------|
| Qwen 3.8 Max ($2.00 / $6.00 per 1M) | $81.82/mo | $377.64/mo |
| GLM 5.3 ($1.40 / $4.40 per 1M) | $59.16/mo | $274.42/mo |
| DeepSeek V4.1 Flash ($0.30 / $1.20 per 1M) | $15.11/mo | $71.75/mo |

**Planning total:** capture $150.22/mo plus judging = **$165/mo** (Flash typical) to **$528/mo** (Qwen upper). Never treat $150.22 as the total.

Yearly capture alone: $1,802.60. Judging adds the range above x 12 after the pilot measures the real rate.

---

## Vendor comparison

Sources captured 2026-10-14:

| Vendor | Stated price | Scope (as listed) |
|--------|--------------|---------------------|
| Scrunch Core | $250/mo | 125 prompts, 4 engines, 1 country, 1 persona |
| AthenaHQ Starter | $295/mo | ~3,600 responses / mo at 100x6x3x2 scans |
| Goodie Core | $295/mo | 110 prompts, 5 engines |
| Evertune Pro | $800/mo | Plan page scale |
| Profound Enterprise | custom | Enterprise |

In-house: about $2,000 to $6,300 per year (capture plus judging), versus about $3,000 to $10,000 per year for vendor tools.

Cost per answer (our inference from list prices): Scout at the $250/mo ceiling covers 6,294 answers per month across 6 engines (about $0.04 per answer). AthenaHQ Starter lists about 3,600 responses for $295/mo (about $0.08 per answer).

In-house figures exclude staff time and hosting, which run on one laptop today.

---

## Risks

1. **Procurement / UI capture.** Bright Data is banned by campus IT and is not used. True UI scrapers for Perplexity remain unavailable on campus; we use API search instead (medium fidelity).
2. **Model retirement.** AI vendors retire models. Our judge model was retired in October 2026. Scout now checks that a model is available before every scan.
3. **Backups.** Backups now verify by restoring into a test database. Tested on 2026-11-11.
4. **Ownership.** A named owner is needed for maintenance if staffing changes.
5. **Accuracy.** Accuracy figures are provisional until the hand check.
6. **Medium-fidelity Claude / Perplexity.** API-with-search series are comparable run-to-run but are not labeled as consumer UI.

---

## Decision requested

Approve the **$75 cash** (DataForSEO $50 + Fireworks $25) and the **pilot** (capture up to $12.89 plus judging within the $25 cap).

Approve steady state up to **$250/mo**. The judge model is chosen in the pilot to fit under it.

Scout's provider caps stop spending at the approved ceiling. Nothing runs over it.

Go / no-go on the live pilot by **2026-11-20**.

---

## Operator appendix

Operators and engineers only. Leadership section above is the decision brief.

### Product pointers

- Product framing: `docs/UX.md`
- Live numbers: Budget & Funding in Scout and its PDF export
- Pilot steps: `docs/PILOT_RUNBOOK.md`
- Provider notes: `docs/PROVIDERS.md` §7 (Claude / Perplexity medium fidelity)
- Competitor price anchors: `docs/COMPETITOR_MATRIX.md` §5; `VENDOR_COMPARISON` in `lib/budget/funding.ts` (2026-10-14)

### Ask (code contracts)

1. DataForSEO top-up minimum: `DATAFORSEO_MIN_TOPUP_USD` in `lib/budget/funding.ts`.
2. Live pilot on Energy `energy-core-v1` after content-team sign-off.
3. Caps: set in Scout to match approved budget.

Label on estimates: **“upper estimate, prices verified on 2026-11-03”** (`UPPER_ESTIMATE_LABEL`).

### Pilot capture math

Computed by `providerShareForPrompts(30, primaryRouteUsdPerDrawByProvider())` and `estimateContentTeamSeries` (same as Budget page):

| Item | Value |
|------|--------|
| Prompts | 30 (core, neutral) |
| Engines | 6 primary |
| Draws per prompt | 3 |
| Total draws | 540 (+ 6 canary draws on estimate) |
| Upper total (USD) | $12.888 → $12.89 |

### Steady-state capture math

When `import:content_team_v1` prompts are approved, estimator uses `EXPECTED_NEUTRAL = 118` and `EXPECTED_VARIANTS = 341` (`lib/contentTeam/import.ts`), 6 engines × 3 draws × Charlotte, core twice per month, persona once per quarter (monthly share = quarterly ÷ 3):

| Item | Upper USD / month | Notes |
|------|-------------------|--------|
| Core (biweekly × 2) | $101.39 | 118 × 6 × 3 × 2 |
| Persona (quarterly ÷ 3) | $48.83 | 341 × 6 × 3 amortized |
| Capture only | $150.22 / mo | Not “total platform” |
| Yearly capture (×12) | $1,802.60 | `platformSummary.yearlyUsd` in `buildFundingPage` |

Until CSV import is approved in production, Budget may show $0 for steady state; rows above are the importer + estimator contract.

### Proposed caps (app defaults)

From `CAPTURE_PROVIDER_DEFAULTS` in `lib/capture/accounts.ts`:

| Provider | Monthly cap | Per-scan cap | Role |
|----------|-------------|--------------|------|
| DataForSEO | $20 | $10 | Active (all primary capture) |
| OpenAI / Gemini | $20 | $10 | Calibration / fallback only |
| Anthropic | $60 | $30 | Calibration / fallback only |
| Perplexity | $10 | $5 | Fallback only |
| SerpAPI / Local SERP | plan/credits | — | Parity only |

Bright Data is not in this table (campus IT ban). Capture uppers never included it (`providerShareForPrompts` → $0). Caps rise to steady-state only after funding approval.

### Judge (Fireworks)

Not in the $12.89 capture upper. Estimator: `lib/judge/v2.ts` (`judgeDraw`). `JUDGE_MODEL` required (no hardcoded default); choose via `npm run judge:bakeoff`.

| Input | Value |
|-------|--------|
| Budget check (pre-call) | `estimatedUnits = Math.ceil((system.length + user.length) / 4) + 800`; reserves `estimatedUnits * 2` (one repair) |
| Ledger charge | Real `usage.prompt_tokens + usage.completion_tokens` via `fireworksChat` → `cost_ledger`. Missing usage → estimate with `usage_estimated=true` |

Prices for planning rows: `BAKEOFF_PRICES` in `lib/judge/bakeoff.ts` (`BAKEOFF_PRICE_SOURCE`, `BAKEOFF_PRICE_DATE`).

Fireworks: $25 prepaid, auto top-up off. Real cost measured on bake-off and canary draws before the full run.

### Judge call / planning formulas

```
calls_core     = 118 * 6 * 3 * 2 = 4248
calls_persona  = 341 * 6 * 3 / 3 = 2046
calls_upper    = 6294

typical_usd_per_call = (2000/1e6)*inputPerM + (1500/1e6)*outputPerM
upper_usd_per_call   = 2 * ((3000/1e6)*inputPerM + (4000/1e6)*outputPerM)  # one repair
monthly              = per_call * 6294
```

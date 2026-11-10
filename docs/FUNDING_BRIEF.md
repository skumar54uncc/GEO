# Funding brief (leadership)

**Audience:** Lauren and executive sponsors  
**Product:** **Scout** — “Scouting what AI says about us” (`docs/UX.md`)  
**As of:** 2026-11-06  
**Decision requested by:** ~**2026-11-20** (about two weeks)

---

## What Scout does (plain language)

Scout is UNC Charlotte’s in-house tool to see what major AI search surfaces say about the university when real people ask neutral questions (not ads). It runs the same prompts repeatedly across engines, stores every answer unchanged, and scores whether we are mentioned, cited, and positioned fairly compared to peers. Dashboards show **how many prompts we “win,”** with **sample size (n)** and **uncertainty bands**, so leadership can track trends without treating one screenshot as truth.

---

## What this pilot proves — and does not

| Proves | Does not prove |
|--------|----------------|
| End-to-end capture, judging, metrics, and dashboards on **approved Energy core** prompts (30 × 6 engines × 3 draws, Charlotte) | That **UI capture** matches what every student sees in every account state |
| Cost guard, caps, stop-loss, and **upper-bound** pricing from our estimator | Exact vendor spend to the cent before the run (actuals come from `cost_ledger`) |
| Operational readiness on the **Mac-hosted** stack (worker, backup, local Postgres) | Cloud SLA, 24/7 staffing, or multi-campus hosting |
| Repeatable measurement on a **frozen** prompt set (hash auditable) | Persona-voice or full **341** variant library at full quarterly volume in one week |

Claude and Perplexity primaries use **DataForSEO LLM Responses with web search** (`api_search`, **medium** fidelity). They are labeled accordingly; they are **not** consumer UI sessions (`docs/PROVIDERS.md` §7).

---

## The ask

1. **One-time DataForSEO top-up: $50** minimum (`DATAFORSEO_MIN_TOPUP_USD` in `lib/budget/funding.ts`; vendor note in `docs/PROVIDERS.md`).
2. **Approval to run one live pilot scan** on Energy **`energy-core-v1`** after content-team sign-off (upper **~$12.89** — see below).
3. **Ongoing monthly budget** for steady-state measurement at upper estimates below (adjust caps in Scout to match what you approve).

All dollar figures below are **upper estimates** from code (`estimateContentTeamSeries`, `buildFundingPage`), not handwritten. Label: **“upper estimate, prices verified on 2026-11-03”** (`UPPER_ESTIMATE_LABEL`).

### Pilot (Energy core, 30 prompts)

Computed by `providerShareForPrompts(30, primaryRouteUsdPerDrawByProvider())` and `estimateContentTeamSeries` — same math as the Budget page:

| Item | Value |
|------|--------|
| Prompts | 30 (core, neutral) |
| Engines | 6 primary |
| Draws per prompt | 3 |
| Total draws | 540 (+ 6 canary draws on estimate) |
| **Upper total (USD)** | **$12.888** → **$12.89** |

### Steady state (after full content-team import & approval)

When `import:content_team_v1` prompts are approved, the estimator uses **`EXPECTED_NEUTRAL = 118`** core prompts and **`EXPECTED_VARIANTS = 341`** persona prompts (`lib/contentTeam/import.ts`), **6 engines × 3 draws × Charlotte**, core series **twice per month**, persona series **once per quarter** (monthly share = quarterly ÷ 3). Same per-prompt upper as pilot:

| Item | Upper USD / month | Notes |
|------|-------------------|--------|
| **Core (biweekly × 2)** | **$101.39** | 118 prompts × 6 × 3 draws × 2 runs/mo |
| **Persona (quarterly ÷ 3)** | **$48.83** | 341 prompts × 6 × 3 draws, amortized monthly |
| **Total platform** | **$150.22 / mo** | |
| **Yearly (×12)** | **$1,802.60** | `platformSummary.yearlyUsd` pattern in `buildFundingPage` |

*Until CSV import is approved in production, the Budget page may show $0 for steady state; the rows above are the contract from the importer counts + estimator.*

### Proposed caps (starting defaults in app)

From `CAPTURE_PROVIDER_DEFAULTS` in `lib/capture/accounts.ts` (operator can tighten):

| Provider | Monthly cap | Per-scan cap | Role |
|----------|-------------|--------------|------|
| DataForSEO | $20 | $10 | Active (all primary capture) |
| OpenAI / Gemini | $20 | $10 | Calibration / fallback only |
| Anthropic | $60 | $30 | Calibration / fallback only |
| Perplexity | $10 | $5 | Fallback only |
| SerpAPI / Local SERP | plan/credits | — | Parity only |

Bright Data is **not** in this table (removed from the product; campus IT ban). Capture upper estimates never included it (blocked / non-primary → $0 in `providerShareForPrompts`); pilot **$12.89** and steady-state **$150.22/mo** are unchanged.

Provider caps above are the app starting defaults (`CAPTURE_PROVIDER_DEFAULTS`). They are raised to steady-state levels only after funding approval.

### Judge (Fireworks) — pilot, 540 draws

Not included in the **$12.89** capture upper. Estimator: `lib/judge/v2.ts` (`judgeDraw`).

| Input | Value |
|-------|--------|
| Model | `JUDGE_MODEL` default `accounts/fireworks/models/deepseek-v4-pro` (`lib/fireworks.ts` `judgeModel()`) |
| Budget check (pre-call only) | `estimatedUnits = Math.ceil((system.length + user.length) / 4) + 800`; reserves `estimatedUnits * 2` (one repair) |
| Ledger charge | **Real** `usage.prompt_tokens + usage.completion_tokens` from Fireworks (`fireworksChat` → `cost_ledger`). Chars/4 is not written to the ledger. |
| Example estimate lengths (budget only) | system **1069** chars; user **165** chars → **1109** estimated units/draw (reserve **2218**) |
| USD / unit for this model | **PRICE NEEDED** — not in `lib/capture/pricing.ts` `TOKEN_RATES`; Phase 2 `fireworks` account seeds `credit_unit_usd: null` (`lib/site/providerCall.ts`) |

Fireworks is funded as a **$25 prepaid cap**. Real cost is measured on the **6 canary draws** before the full run. That is a cap, not a price claim.

Until a verified Fireworks price for `deepseek-v4-pro` is recorded in-repo, do not add a judge dollar line to the pilot ask.

---

## Vendor comparison (external anchors)

From `VENDOR_COMPARISON` in `lib/budget/funding.ts` (sources captured **2026-10-14**, `docs/COMPETITOR_MATRIX.md` §5):

| Vendor | Stated price | Scope (as listed) |
|--------|--------------|---------------------|
| Scrunch Core | $250/mo | 125 prompts, 4 engines, 1 country, 1 persona |
| AthenaHQ Starter | $295/mo | ~3,600 responses / mo at 100×6×3×2 scans |
| Goodie Core | $295/mo | 110 prompts, 5 engines |
| Evertune Pro | $800/mo | Plan page scale |
| Profound Enterprise | custom | Enterprise |

**Our platform (upper estimate, in-house):** ~**$150.22/mo** steady state vs **~$3,000–$10,000/yr** vendor bracket in COMPETITOR_MATRIX §5 (*inference* for comparable scope).

---

## Risks

1. **Procurement / UI capture** — Bright Data is banned by campus IT and is not used. True UI scrapers for Perplexity remain unavailable on campus; we use DataForSEO API search instead (medium fidelity).
2. **UP-315 code ownership** — Long-term maintainer and bus factor for the Mac-hosted deployment.
3. **Laptop hosting & backups** — Postgres and app on one machine (`127.0.0.1`); nightly backup discipline required; restore must stay tested.
4. **Medium-fidelity Claude / Perplexity** — API-with-search series are comparable run-to-run but not labeled as consumer UI.

---

## Decision requested

Approve **$50 DataForSEO top-up**, **pilot upper ~$12.89**, and **~$150/mo upper steady-state** (with caps above as guardrails), targeting go/no-go on live pilot by **~2026-11-20**.

Details for operators: `docs/PILOT_RUNBOOK.md`. Live numbers on **Budget & Funding** in Scout and PDF export.

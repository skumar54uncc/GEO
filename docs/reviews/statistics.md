# Wave 4 — Reviewer 1: Statistics and data accuracy

Independent review. No product fixes were applied in this pass.

## Audit script: `scripts/audit-metrics.ts`

**Purpose.** After connecting to `TEST_DATABASE_URL`, the script truncates the database (same helper as Vitest), seeds the **rollup DB fixture** from `tests/metrics/rollupDb.test.ts` (10 prompts × 3 draws × 2 scans with a brand mention flip), then:

- Reads **raw rows** via `loadScanDraws` (draws, latest attempts, judge_runs, mentions, citations, claims) only—no `lib/metrics/stats` or rollup formula imports.
- Recomputes one **overall unbranded** cell (`chatgpt` / `ui_provider`) with **inlined** Wilson, cluster bootstrap (2000 iter, seed `20261103`), share-of-voice ratio bootstrap, prompt-won Wilson, etc.
- Compares to `rollupScan` for that scan (same bootstrap parameters).
- Recomputes **McNemar p-value** and **paired bootstrap** presence difference for the same series and compares to `compareScans` (first vs second scan).

**Randomization.** The script builds a pool of scalar checks from the cell and the scan comparison, then shuffles with `mulberry32(AUDIT_METRICS_SEED ?? 424242)` and takes the **first 25** (deterministic “random”).

**How to run.**

```bash
# .env.local must set TEST_DATABASE_URL (and differ from DATABASE_URL)
npx tsx scripts/audit-metrics.ts
```

**Result (this review machine).** `checks: 25`, `mismatches: 0`, `sampleSeed: 424242`. JSON summary printed to stdout.

---

## Findings

| Severity | Area | File (approx.) | Issue | Reproduce | Suggested fix (for implementers) |
|----------|------|----------------|-------|-----------|----------------------------------|
| **low** | Terminology vs schema | UI / `docs/METRICS.md` | METRICS and architecture describe headline exclusion for **branded** prompts. Product copy and Overview also say **“location-biased”** prompts are excluded from headlines; that behavior is implemented by the same `branded` flag (see `tests/prompts/generate.test.ts` and backfill), not a separate column. | Open Overview “location-biased” toggle vs `headlineCells` / `prompts.branded` in DB. | Either document that “location-biased” is persisted as `prompts.branded` for headline rules, or add an explicit `location_biased` column and filter in `headlineCells`. |
| **low** | Audit coverage | `scripts/audit-metrics.ts` | The audit compares **one engine × runner** cell plus **one comparison series**; it does not exhaust every cell key (regions, persona groups, branded series) or every metric in `CellRollup`. | Run script; inspect JSON `details` (25 ids only). | Extend the script to rotate cells or add property tests in Vitest for edge cells. |
| **low** | Institution panel | `lib/metrics/rollup.ts` (institution ranks) | `institutionRanks` aggregates **unbranded chat-index draws** (or Google fallback) into one ranking list. This is **not** the same object as a single engine cell and can mix engines **within** the chat index for the sidebar. | `rollupCampaignDashboard` → `institutions` when both chat engines have draws. | Confirm product intent: if the panel must be “per engine”, split the input draws by `engine` before ranking. |

No **high** or **medium** issues were identified in this pass for the items below; rationale is inline.

---

## METRICS.md — interval methods

| Requirement | Where in code | Notes |
|-------------|----------------|-------|
| **Wilson** for prompt-level proportions (prompts won, accuracy as claim proportion) | `wilsonInterval` in `lib/domain.ts` (z = `1.959963984540054`); `promptsWon`, `wilsonRate` in `lib/metrics/stats.ts` | Matches METRICS rows 2–3 and 10. |
| **Cluster bootstrap** for draw-level rates; **k ≥ 10 prompts** else approximate Wilson | `clusterRate` + `MIN_PROMPTS_FOR_CLUSTER = 10` in `lib/metrics/stats.ts` | Matches METRICS row 13 and `RateWithCi.tooFewPrompts`. |
| **Paired bootstrap** for scan-vs-scan **presence rate difference** | `pairedRateDifference` in `lib/metrics/stats.ts`; `compareOutcomes` in `lib/metrics/compare.ts` | Resamples whole prompts; same seed/iter constants as cluster bootstrap. Zero-width CI widened using Wilson margins (documented in code). |
| **McNemar exact** (two-sided binomial) for won-status discordant pairs | `mcnemarExact` in `lib/metrics/stats.ts` | Matches METRICS row 11 and tests in `tests/metrics/stats.test.ts`. |

---

## Runners, indexes, branded headline, `search_used`, persona 30+

| Rule | Evidence |
|------|----------|
| **Runners never averaged** | `rollupCell` throws if draws mix runners (`lib/metrics/rollup.ts`). |
| **Indexes never pooled** | `assertSameIndex` on cell build and SoV (`lib/metrics/rollup.ts`, `lib/metrics/indexes.ts`). |
| **Branded excluded from headline** | `headlineCells` filters `!c.key.branded` and `promptsWon !== null` (`lib/metrics/rollup.ts`); branded cells set `promptsWon: null`. |
| **`search_used` for api_search** | Valid draw gate: `api_search` requires `search_used === true` (`lib/metrics/load.ts`). |
| **Persona detail only at ≥30 draws** | `MIN_PERSONA_DRAWS_FOR_DETAIL = 30`, `dashboardPersonaSlices` (`lib/contracts/personas.ts`, `lib/metrics/personaCells.ts`). |

---

## KPI change badges — McNemar only

Overview KPI badges for **Prompts won**, **Citation rate**, and **Share of voice** use `comparison?.label` from scan comparison, which comes from **McNemar** (`lib/metrics/compare.ts` → `mcnemarExact`). See `kpiStatusFromComparison` in `lib/ui/kpiStatus.ts` and usage in `app/page.tsx` (~lines 309–313). **Accuracy** uses a separate badge (`accuracyKpiBadge`), not McNemar—consistent with comments in `kpiStatus.ts`.

---

## Cost estimator vs hand calculation

Pilot and steady-state numbers come from `lib/budget/funding.ts` + `lib/budget/providers.ts` + `lib/contentTeam/estimate.ts`:

- **Per-draw by provider:** sum of `adapter.estimate().usd` over **primary routes** per engine (`primaryRouteUsdPerDrawByProvider`).
- **Pilot share:** `prompts × 3 draws × perDraw(provider)` for active providers; non-active roles get `0`.
- **Steady monthly:** core series `× 2` (biweekly → monthly) + persona series `÷ 3` (quarterly → monthly), then summed per provider.

**Hand check:** pick `p` approved core prompts from `estimateContentTeamSeries`, multiply by `6` engines × `3` draws × `dataforseo` upper $/draw from `primaryRouteUsdPerDrawByProvider()`, and compare to `pilotShares.dataforseo` from `buildFundingPage`. Unknown prices propagate as `null` (documented on Budget page).

---

## Demo isolation (row-level)

`lib/demo/isolation.ts` counts `FORBIDDEN_SEED_MARKERS` across draws (via scans/campaigns), raw_payloads linked from draws, citations, judge_runs, recommendations, strategy_reports, and cost_ledger—scoped by `org_id`. Covered by `tests/phase9/demoIsolation.test.ts` and `tests/phase9/journeys.test.ts` (zero markers under UNC Charlotte).

---

## Summary

- **Audit:** 25/25 scalar checks matched between inlined recomputation and `rollupScan` / `compareScans` on the seeded test fixture (`mismatches: 0` when run locally with `TEST_DATABASE_URL`).
- **Statistical methods** in code align with `docs/METRICS.md` for Wilson, cluster bootstrap with k ≥ 10, paired bootstrap for presence deltas, and exact McNemar.
- **Low-severity follow-ups:** clarify branded vs “location-biased” naming, optionally broaden the audit script, and confirm whether the institution ranking panel should ever mix engines within an index.

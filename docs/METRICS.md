# Metrics

Every number the platform shows is defined here with its unit, its denominator, and the unit test that pins it. Principles come from `docs/ARCHITECTURE.md` sections 0 and 6. Code: `lib/metrics/`.

Test status column: **built** means the test exists and passes: `tests/metrics/stats.test.ts` for the statistics, `tests/metrics/rollup.test.ts` for cell formulas and comparison (pure hand fixtures), `tests/metrics/rollupDb.test.ts` for the database rollup, dashboard and model event routes. **planned** means the formula is locked here but its test is not written yet; until then nothing may display it. Code: `lib/metrics/load.ts` (valid draw loader), `rollup.ts` (cells, scan rollup, campaign dashboard), `compare.ts` (scan comparison).

## 1. Locked decisions

| Constant | Value | Where |
|---|---|---|
| `BOOTSTRAP_ITERS` | 2000 | `lib/metrics/stats.ts` |
| `BOOTSTRAP_SEED` | 20261103 | `lib/metrics/stats.ts` |
| `TOO_FEW_DRAWS` | 30 | `lib/metrics/stats.ts` |
| `MCNEMAR_ALPHA` | 0.05 | `lib/metrics/stats.ts` |
| `PROVIDER_ERROR_RATE_THRESHOLD` | 0.20 | `lib/metrics/stats.ts` |
| `BUDGET_ALERT_THRESHOLDS` | 0.80 and 1.00 of `monthly_budget_usd` | `lib/metrics/stats.ts` |

A rollup run twice on the same data gives identical numbers: every bootstrap builds a fresh `mulberry32(seed)` and never touches `Math.random`.

## 2. Which draws count

A draw is **valid** when all of these hold:

1. `status = ok`.
2. It is the latest attempt (highest `attempt`) for its (prompt, engine, runner, region, draw_index). Earlier failed attempts stay in the ledger and are ignored by metrics.
3. For `runner = api_search`, `search_used = true`. An api_search draw where search did not run is not a search measurement and is excluded, never relabeled.
4. `experimental = false`. Experimental draws (local SERP before its parity report passes) are excluded from the official series.

Region cells use draws with `region_honored` in (`yes`, `unknown`), per ARCHITECTURE 5.4. Draws with `no` are excluded from region cells and the cell says so. Cells without a region filter use all valid draws.

Series rules (never broken):

- **Runners are never averaged.** Every cell key includes `runner`. UI, SERP, api_search, api_parametric, and manual_paste are separate series.
- **Indexes are never pooled.** `chat` = chatgpt, gemini, claude, perplexity. `google` = google_aio, google_ai_mode. Share of voice is computed inside one index. `assertSameIndex` throws if engines from both are passed.
- **Branded prompts are excluded from the headline** and reported as their own series. A cell key includes `branded`.
- **Every rate carries n and a 95% interval.** Cells with fewer than 30 valid draws set `tooFewDraws` and render greyed with "too few draws".

## 3. Formulas

| # | Metric | Formula | Unit | Denominator | Interval | Unit test |
|---|---|---|---|---|---|---|
| 1 | Prompt won | Valid draws with a brand mention >= `ceil(valid / 2)`, and valid >= 1. For n = 3 this is 2 of 3, and the UI says "at least 2 of 3 draws". Prompts with 0 valid draws are not scored | prompt | n/a | n/a | built: `won rule is at least 2 of 3 draws`, `won rule uses ceil of half for other n and needs a valid draw` |
| 2 | Prompts won (headline) | count(prompts won) / count(prompts with at least 1 valid draw), per engine, per runner, unbranded only. Shown as "x of N prompts (95% CI a to b)" | prompts | prompts with at least 1 valid draw | Wilson on prompt counts | built: `prompts won uses Wilson on prompt counts and skips prompts with no valid draw`, `prompts won flags cells under 30 draws and handles empty` |
| 3 | Wilson interval | Wilson score interval, z = 1.959963984540054, from `wilsonInterval` in `lib/domain.ts`. Empty denominator gives null | proportion | n passed in | Wilson | built: `wilson known case 8 of 10` (8/10 gives 0.4902 to 0.9433, worked by hand), `wilson empty denominator is null`, `wilson rate carries n and flags small cells` |
| 4 | Mention rate | valid draws with a brand mention / valid draws | draw | valid draws in the cell | Cluster bootstrap over prompts | built: `cluster rate reports n, interval and the too few draws flag`. built: `mention rate is a cluster bootstrap with n, numerator and a 95% interval`, `a cell of 30 draws is not flagged too few` |
| 5 | Citation rate | valid draws with at least one citation whose `source_class = owned` OR whose domain matches an owned `brand_domains` row / valid draws. A draw counts once however many owned citations it has | draw | valid draws in the cell | Cluster bootstrap over prompts | built: `citation rate counts owned source_class or an owned domain, once per draw`, `matches owned domains from brand_domains for the citation rate` |
| 6 | First mention rate | valid draws where the brand has the minimum `span_start` among tracked mentions (brand and competitors) / valid draws. A draw with no tracked mention is in the denominator and not in the numerator | draw | valid draws in the cell | Cluster bootstrap over prompts | built: `first mention rate: the brand must have the minimum span among tracked mentions`, `first mention with a missing span is unknown, kept in the denominator and reported` |
| 7 | Share of voice | brand distinct-entity draws / (brand distinct-entity draws + sum over competitors of competitor distinct-entity draws), within one index. "Distinct-entity draw" means an entity counts once per draw however many times it is named. Null when the denominator is 0 | entity-draw | brand plus competitor distinct-entity draws in the index | Cluster bootstrap over prompts | built: `index separation throws`, `same index passes and names the index`. built: `share of voice counts distinct entities per draw within one index`, `share of voice is null when no tracked entity is named, and mixed indexes throw` |
| 8 | Position | list position of the first brand mention in a ranked list, else null. Median across draws that have a position | rank | draws with a list position | none (report n) | built: `median odd`, `median even`, `median empty is null and input is not mutated`. built: `position is the median over draws that have a list position and ignores the rest` |
| 9 | Consistency | for each prompt, (draws agreeing with the majority mention outcome) / (valid draws of that prompt); then the mean over prompts. A tie counts the mentioned outcome as the majority | proportion | prompts with at least 1 valid draw | none (report n prompts) | built: `consistency averages majority agreement over prompts; a tie counts mentioned as the majority` |
| 10 | Accuracy | 1 - contradicted / (supported + contradicted + unverifiable), over claims in valid draws. Null when there are no claims. Report n claims | claim | claims in the cell | Wilson on the claim counts | built: `accuracy is null without claims and counts unverifiable in the denominator` |
| 11 | Scan comparison: won status | McNemar exact two-sided binomial on discordant prompts. b = won to lost, c = lost to won. p = min(1, 2 * P(X <= min(b, c))), X ~ Binomial(b + c, 0.5). alpha = 0.05. Label: `significant improvement` when p < alpha and c > b; `significant decline` when p < alpha and b > c; otherwise `within noise`. b + c = 0 gives p = 1 and `within noise` | prompt pair | prompts present and scored in both scans | exact p-value | built: `mcnemar b=1 c=9 is a significant improvement` (p = 22/1024), `mcnemar b=9 c=1 is a significant decline`, `mcnemar b=5 c=5 is within noise`, `mcnemar no discordant pairs is within noise`, `mcnemar alpha boundary: c=5 is p 2/32 noise, c=6 is p 2/64 significant`, `mcnemar rejects bad counts` |
| 12 | Scan comparison: presence rate difference | mention rate in scan B minus mention rate in scan A, pooled over draws. Paired bootstrap: resample whole prompts (a prompt keeps its draws from both scans), 2000 iterations, seed 20261103, percentile 2.5 and 97.5 | draw | valid draws in each scan | Paired bootstrap | built: `paired difference is exactly 1 when every prompt goes from absent to present`, `paired difference reproducible with same seed and zero when nothing changes`; in `compare.ts`: `pairs prompts per series, labels with McNemar and reports a paired presence difference` |
| 13 | Cluster bootstrap | Resample prompts with replacement (a prompt keeps all its draws), apply the statistic, repeat 2000 times with `mulberry32(20261103)`. Interval = percentile 2.5 and 97.5 with linear interpolation between order statistics. Replicates where the statistic is not finite are dropped. No clusters gives NaN | per statistic | per statistic | Percentile | built: `bootstrap reproducible with same seed`, `bootstrap defaults are 2000 iterations and the fixed seed`, `bootstrap two clusters 1 and 0 spans the full range`, `bootstrap identical clusters collapse to the estimate`, `bootstrap resamples whole prompts, not draws`, `bootstrap with no clusters is NaN` |
| 14 | PRNG | mulberry32, 32 bit state, output in [0, 1) | n/a | n/a | n/a | built: `mulberry32 is deterministic and in [0, 1)` |

### Rollup rules built in Phase 5 (`lib/metrics/rollup.ts`)

- **Cell key**: engine x runner x region x persona x persona_group x branded (plus the engine's index). `regionId = null` is the overall cell (every valid draw, all regions); a region cell drops draws with `region_honored = no` and reports the count as `regionExcluded`. `personaId = null` and `personaGroup = null` means no audience filter. Group cells set `personaGroup` (and leave `personaId` null). Specific persona cells set `personaId` (aliases such as `business_leader` remap to `business_partner`). Dashboards report by group by default and show a specific persona only when that cell has ≥30 draws. Test: `builds region and persona cells, leaves region_honored=no out of region cells and says so`.
- **Runners and indexes**: `rollupCell` throws if a draw from another engine or runner is passed, and `assertSameIndex` guards the cell. Tests: `engines and runners get separate cells and the two indexes are never pooled`, `a cell refuses draws from another runner`.
- **Branded**: branded cells have `promptsWon = null` (they are a separate series, never a headline). `headlineCells()` returns unbranded cells only. Test: `branded prompts are their own cells and never reach the headline`.
- **Valid draws** (section 2) are applied in `loadScanDraws`; it also needs a judge run (latest `judge_runs.seq` wins; mentions are recorded even when the judge's JSON failed validation). Left out draws are counted in `excluded` (`notOk`, `searchNotUsed`, `experimental`, `unjudged`). Test: `counts only valid, latest-attempt, judged draws and reports what it left out`.
- **First mention** with a tracked mention that has no span (legacy rows) cannot be ordered: the draw stays in the denominator, is not counted as first, and is reported in `firstMentionUnknownSpan`.
- **Share of voice** `n` is brand plus competitor distinct-entity draws (its own denominator, not the draw count), with `tooFewDraws` taken from the cell's valid draws.
- **Determinism**: every bootstrap uses a fresh `mulberry32(20261103)` with 2000 iterations. Only `rolledAt` differs between two rollups of the same data. Tests: `rolling up twice gives identical numbers`, `is identical when run twice on the same data`.
- **Comparison series** (`compare.ts`) are keyed by engine, runner, provider, region and branded flag; draws with `region_honored = no` are left out. Scans on different prompt sets throw `IncomparableScansError`. Tests: `refuses scans on different prompt set versions and compares scans on the same one`, `a prompt is paired only when valid in both scans, and branded prompts are a separate series`.
- **Dashboard** (`rollupCampaignDashboard`, `GET /api/campaigns/[id]/dashboard`): latest scan per frozen prompt set, a trend of prompts won (no bootstrap) over at most the last 12 scans of that set, row 11 labels against the previous scan of the same set, open campaign alerts, and `model_events` for the campaign's engines. Read only. Test: `returns the latest rollup, trend, McNemar vs previous, open alerts and model events for the campaign's engines`.

Two proportion tests are never used between scans. The frozen prompt set makes the samples paired, so rows 11 and 12 are the only comparison tests. Scans on different prompt set versions cannot be compared; the rollup refuses.

Every change shown between scans carries its row 11 label. A change without a label is not shown.

## 4. Comparison pairing

- Pairs are matched by prompt id inside one frozen prompt set (same `prompt_sets` row, or same hash).
- Compare within one cell key only: same engine, runner, provider, region, persona filter, branded flag.
- A prompt is in the pair only when it has at least 1 valid draw in both scans.
- "Won" per prompt uses row 1 independently in each scan, so n may differ between scans (for example 3 draws against 2 after an error).

## 5. Alerts (`alerts.evaluate`)

| Alert | Rule | Unit test |
|---|---|---|
| `significant_decline` | Row 11 label is `significant decline` for a cell against the previous scan on the same prompt set | planned: `alert significant decline from mcnemar label` |
| `canary_failed` | Raised by Phase 3 canary runs; Phase 5 only surfaces it | planned: `alert canary surfaced` |
| `budget_threshold` | Month to date `cost_ledger.usd` for a provider reaches 80% and again at 100% of `monthly_budget_usd`. Each threshold alerts once per provider per UTC month | planned: `alert budget at 80 and 100 percent once per month` |
| `provider_error_rate` | draws with `status = error` / all draws for that provider in the scan > 0.20. Strictly greater than | planned: `alert provider error rate above 0.20` |
| `blocked` | A draw with `status = blocked` in the scan | planned: `alert blocked captures` |

Unknown prices: a provider with `usd = null` in the ledger cannot be budget-checked; the alert says "unknown" rather than treating it as zero.

## 6. What these numbers do not say

- Mention and citation rates describe sampled answers from the captured runner, not all users. Medium and low fidelity series are shown separately and labeled.
- Draws inside one prompt are correlated, so draw level intervals come from the cluster bootstrap, not Wilson on draws.
- With 3 draws per prompt, a prompt's won status is noisy. Consistency (row 9) is shown next to every visibility number.
- Persona and region cells are often under 30 draws. They are shown, flagged, and not hidden.

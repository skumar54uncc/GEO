# Phase 5 prompt: Scans, schedules, measurement

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phase 3 must be merged.

Goal: answer "we appeared in x of 100 prompts, and after a month x + y", honestly and automatically.

## Build

1. **Scan runner** on pg-boss: `scan.estimate`, approval, `scan.draw.<provider>` with per provider concurrency, partial failure tolerance (errors become error draws), resumable after a worker restart, status estimating, awaiting_approval, running, partial, complete, failed.
2. **Schedules** per campaign: biweekly, monthly, manual. Locked to a frozen prompt set. `schedule.tick` creates a scan, estimates, auto runs only under `budget_cap_usd`, else waits for approval and raises an alert.
3. **Metrics service** (`metrics.rollup`) per ARCHITECTURE 6, computed per engine, per runner, per region (honored only), per persona, per index:
   - Prompts won (brand in at least 2 of 3 draws) with Wilson CI on prompt counts. The headline.
   - Mention rate, citation rate (owned domain cited), share of voice within one index, median position, first mention rate, consistency, accuracy (contradicted claims).
   - Draw level rates with a cluster bootstrap over prompts (2,000 iterations, fixed seed for reproducibility).
   - Cells under 30 draws flagged.
   - Branded prompts as a separate series.
4. **Scan comparison**: McNemar on per prompt won status, paired bootstrap for the presence rate difference. Labels: significant improvement, significant decline, within noise. Refuse comparison across prompt set versions.
5. **`docs/METRICS.md`**: every formula, its unit, its denominator, and the name of its unit test.
6. **Alerts** (`alerts.evaluate`): significant decline, canary failed, budget at 80% and 100%, provider error rate above a threshold, blocked captures.
7. **Model events**: a table editor for `model_events`, drawn as annotations.
8. **Campaign dashboard v1** (shadcn/ui, Recharts): headline "x of 100 prompts (95% CI a to b)", trend across scans on the same prompt set with breaks at version changes, engine by runner table, region and persona cells, McNemar label vs the previous scan, alerts.

## Tests

Every formula in METRICS.md against hand computed fixtures. Bootstrap reproducible with a seed. McNemar on known tables. Scheduler idempotency (a tick twice does not create two scans). Resume after a simulated worker crash. Budget refusal.

## Do not

Use a two proportion test between scans. Average runners or pool indexes. Show a change without its test label.

## Verification gate

1. Typecheck, lint, tests pass.
2. Run a full scan on the Energy campaign's frozen set at the default config (or a smaller approved subset). Paste the headline per engine and runner with CI and n.
3. Re-running `metrics.rollup` gives identical numbers.
4. A second scan on the same set produces a McNemar label.
5. A scheduled tick under budget runs without a click; over budget waits and alerts.

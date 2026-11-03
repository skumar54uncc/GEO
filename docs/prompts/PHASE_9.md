# Phase 9 prompt: Frontend polish and exports

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phases 1 to 8 must be merged.

Goal: one coherent, fast, honest UI for analysts and leadership.

## Build

1. **Shell.** shadcn/ui throughout. Left nav: Overview, Campaigns, Prompts, Scans, Answers, Citations, Gaps, Strategy, Audit, Settings. Campaign switcher. Light and dark mode. Keyboard accessible, WCAG AA contrast.
2. **Campaign dashboard.** Headline prompts won with CI and n. Trend across scans on the same prompt set version with breaks and model event annotations. Engine × persona heatmap with greyed small cells. Region comparison (honored regions only). Share of voice vs peers within one index. Top citations and source class mix. Open recommendations with status. AI referral traffic from GA4 as a separate outcome panel (`connectors.sync`, needs property access), never blended into visibility.
3. **Remaining screens** brought to one standard: Onboarding, Audit, Prompt review, Answer explorer, Gaps, Strategy, Settings (providers, budgets, schedules, eval scores, calibration agreement).
4. **Every chart** states its denominator, runner mix, fidelity, and interval. Metric text format: "41 of 100 prompts (95% CI 32 to 51), n = 300 draws, runner: UI".
5. **Exports.** Leadership PDF (campaign summary with methods page and denominators) and CSV for every table. Exported numbers carry n and interval columns.
6. **Read only API.** Token scoped per org, campaign metrics and draws, rate limited, audit logged.

## Tests

Playwright end to end: onboard fixture site, create campaign, approve prompts, freeze, run a fixture scan, view dashboard, export PDF and CSV. Visual check that every chart has n. API auth and scoping.

## Verification gate

1. Typecheck, lint, tests pass, Playwright suite green.
2. Screenshots of every screen with real data, pasted.
3. A PDF export opened and checked: every number has n and an interval.

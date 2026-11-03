# Phase 8 prompt: Content strategy for upcoming campaigns

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phase 7 must be merged.

Goal: a research led content plan for a new topic. No idea without evidence.

## Build

A pipeline, run in order, saved as `strategy_reports` with every input recorded:
1. **Demand.** Trends seasonality and rising queries, keyword volumes, PAA, autocomplete, Search Console queries, Exa discussion. Labeled by source.
2. **Current AI landscape.** A small sample scan (estimate and approve first) on generated and approved prompts: who owns the answers today, per engine, with n.
3. **Supply.** Our existing pages for the topic from `crawl_pages`, with their audit findings.
4. **Gaps.** Phase 7 analysis on the sample.
5. **Plan.** Items scored by demand × gap size × effort, each with: topic, persona, prompt cluster, format, headline terms, FAQs, target or new page, third party sources, owner, publish by date tied to `seasonal_events`, score breakdown, and evidence ids. Items without evidence are dropped.
6. **Screen.** Strategy report view with a calendar of publish by dates and export to CSV.

## Tests

Score function on fixtures. Items without evidence are dropped. Publish by dates respect seasonal events. Report inputs reproducible.

## Verification gate

1. Typecheck, lint, tests pass.
2. One real strategy report for a new topic: number of items, top 5 with scores and evidence, pasted. Sample scan cost vs estimate.

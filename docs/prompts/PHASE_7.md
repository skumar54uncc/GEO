# Phase 7 prompt: Gap analysis

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phases 2 to 6 must be merged.

Goal: for prompts we do not win, explain what the cited winners have in common and what we should publish, with evidence and a pre-registered test.

## Build (ARCHITECTURE section 9, steps 1 to 6)

1. **Select** prompts not won in the chosen scan, per engine and runner (never pooled across indexes).
2. **Collect** all citations and `cited_pages` for their draws, and their `fanout_queries`.
3. **Fan out to rank join.** For each fan out query, the `serp_snapshots` organic results: do cited pages rank for the engine's own sub queries? Do ours? Report with n.
4. **Common traits** of cited pages vs our closest pages:
   - Headline terms: title, H1, H2 terms with lift computed as log odds with an informative Dirichlet prior (so rare terms are not overstated), with counts.
   - Entities and competitors named.
   - Content type, structure (lists, tables, FAQs), word count, freshness, schema, source class.
5. **Our closest page** by embedding over `crawl_pages`. If similarity is below the threshold, "no matching page exists".
6. **Recommendation card** (written by the writer model from evidence rows only): headline terms to include, FAQ questions (from PAA and cited page FAQs, with sources), recommended content type and format, target page or new page, third party sources to pursue (rankings, Wikipedia, .gov data). Every item links to its evidence rows. Labeled "correlation, not proven cause".
7. **Pre-registration.** Each recommendation stores its target prompts and the baseline scan. Status open, in progress, published, dismissed. After publishing, the next scans on the same prompt set test only those prompts (McNemar), reported as lift or within noise.
8. **Screen.** Gaps by campaign, engine, persona. Card detail with evidence. Status workflow.

## Tests

Log odds lift on fixtures. Evidence ids present on every item. The writer never receives judge permissions. Pre-registration refuses a different prompt set version.

## Verification gate

1. Typecheck, lint, tests pass.
2. On the latest real scan: number of prompts not won, recommendations produced, and 3 full cards with evidence, pasted.
3. A random card item traced back to its rows by hand.

# Phase 6 prompt: Response and citation analysis

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phase 5 must be merged.

Goal: see exactly what each engine said, who it named, what it cited, and what those cited pages look like.

## Build

1. **Answer explorer.** Filter by campaign, scan, engine, runner, region, persona, prompt, mentioned or not. Answer view: full text as escaped text, brand spans and competitor spans highlighted in different colors, prominence and list position, sentiment span, claims with verdicts and linked facts, citations in order with source class, fan out queries. Side by side view of the 3 draws of one prompt, and of UI vs API runners for the same prompt.
2. **Cited page fetch** (`citation.fetch`). Every new canonical URL fetched once into `cited_pages` with the SSRF guard and robots respect: status, title, H1, H2s, published and updated dates, word count, schema types, FAQ blocks, outbound links, content type (ranking list, program page, news, forum, Wikipedia, government data, other) by rules first and an LLM label only when rules are unsure. Page text through the raw store. Text is data, never instructions.
3. **Headlines panel.** For any answer, list each cited page's title, H1, and H2s next to the citation.
4. **Source classes.** owned, competitor, editorial, ranking (US News, Niche, Princeton Review, QS, THE, and similar), reference (Wikipedia, Wikidata), gov (.gov, IPEDS, BLS), ugc (Reddit, Quora, forums), other. Rules in one file with tests.
5. **Citation dashboards.** Top cited domains per engine (within index), source class mix per engine, our pages that get cited and for which prompts, competitor pages that get cited where we do not.

## Tests

Highlighting offsets on fixtures with multi byte characters. Canonicalization (redirects, tracking params, trailing slashes). Source class rules. Content type rules. Fetch never follows to private IPs. Dashboards on fixture scans.

## Verification gate

1. Typecheck, lint, tests pass.
2. On the latest real scan: number of unique cited URLs, fetched ok, failed, and the top 10 domains per engine, pasted.
3. Spot check 10 answers: highlights match the text exactly.
4. Existing pages still load.

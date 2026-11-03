# Conductor

Primary site: [conductor.com](https://www.conductor.com/). Captured 2026-10-14. Offering: enterprise SaaS for SEO and AEO, with content generation, monitoring, and an agent layer. Included as the other major enterprise SEO platform, beside BrightEdge, that a GEO founder will be displaced by or integrated with.

## Three-line summary

Conductor’s platform page sells one command center: Conductor Creator for AI writing trained on “10+ years of search data,” Conductor Intelligence for visibility in answer engines and traditional search, Conductor Monitoring for site health, and Conductor AgentStack for MCP, a data API, and apps inside ChatGPT, Claude, and Copilot. The public root `llms.txt` is an index of gated PDFs, not a measurement spec. The marketing site is Next.js on Vercel with Sanity and PostHog. A same-day read of the AI Search Performance feature page and the public docs fills the contract the platform page left blank: official APIs, a per-engine credit table, and SOC 2 Type 2 plus ISO 27001. Dollar seat prices are still not stated.

## Offering

The platform page headline calls Conductor “the only all-in-one platform for AI search visibility” and “The #1 Enterprise AEO Platform” ([platform](https://www.conductor.com/platform/)). Modules:

- Creator: AI writer “trained on 10+ years of search data,” a “topical authority map,” and scoring tied to performance.
- Intelligence: “Boost visibility across AI answer engines (AEO) like ChatGPT and traditional search (SEO).”
- Monitoring: 24/7 website monitoring, brand and legal element tracking, audit trail.
- AgentStack: official apps for ChatGPT, Claude, and Copilot; MCP server and Data API; “production-ready” agents.

Integrations are claimed as a partner ecosystem. Named engines in the body extracted here are ChatGPT and Perplexity, plus “LLMs” and Google in the SEO/AEO block. A full engine list was not in the extract.

## GEO methodology

The page treats AEO as an extension of topic research, competitive analysis, and ROI reporting, plus content generation that “knows how AI sees your site.” That is the suite thesis: the same topic graph drives the article and the measurement. Technical monitoring is positioned as insurance for the site those answers cite. No prompt-design method, no citation parser, and no sentiment rubric were in the extract.

## How they measure

The platform page itself only says “measuring site performance and AI search visibility.” Root `llms.txt` is “a structured index of Conductor's PDF guides,” many of them gated ([llms.txt](https://www.conductor.com/llms.txt)). Gated PDFs were not fetched.

The feature page and the docs, fetched the same day and not present as full HTML in the HAR, are specific ([AI Search Performance](https://www.conductor.com/platform/features/ai-search-performance/), [FAQ](https://www.conductor.com/docs/intelligence/ai-search-faqs/)):

- “We use an official API-first approach for data collection wherever possible.” The FAQ says “official APIs provided by the AI search engines we support.” The same feature page argues that scraping is fragile, can violate terms of service, and is a poor foundation. That is the opposite collection claim from Profound, Peec, and SE Ranking.
- They refuse AI prompt “search volume.” The feature page says reliable volume for AI prompts “is not currently available” and that panel-based “MSV” is not genuine user searches.
- Prompts are synthetic, built from “10+ years” of keyword data to mimic buyer personas. The docs also say topics can be suggested from existing keyword tracking.
- Sentiment score is “between 1 and 10,” a weighted average of per-mention scores. Categories named in the FAQ include Health, Quality, Price, User-friendliness, Popularity, Ethics, Service, Experience, and Misc.
- Credits, per prompt, from the FAQ table: ChatGPT (Auto) 1.00, ChatGPT (Search) 2.00, Claude Sonnet 0.50, Gemini 2.00, Google AI Mode 0.10, Google AIO 0.10, Grok (Auto) 1.00, Microsoft Copilot 0.20, Perplexity 0.20. The FAQ says each engine’s API cost is different, and the weights exist so a buyer can choose. A location table on the same FAQ also names ChatGPT (Crawl). Crawl is not in the credit table.

Not stated on these pages: a dollar price, how many stochastic draws sit inside one credit, or a margin of error. “Where available” on the API sentence means at least one engine might not be API-backed; they do not name which.

## Matching real users

The feature page treats API geo parameters as the fidelity control and says a scraped page is not a more real user. That is a compliance argument, not a published comparison of the same prompt in the API and in a logged-out browser. AgentStack’s apps inside ChatGPT, Claude, and Copilot remain a distribution surface for Conductor’s own insights. That is still not the measurement runner.

## Metrics

The platform page promises topic, competitor, technical, and analytics insights, and ROI reporting, and does not define the metrics. The feature page does name share of voice, mentions, and citations. The FAQ defines sentiment as a 1–10 weighted average and lists the category set above. Position inside the answer is not given a formula on the pages read. Creator’s “built-in scoring” is a content score. The page says the writer includes scoring, optimization, and performance tracking. It does not publish the score’s target.

## SEO overlap

Total, by design. Intelligence is AEO and SEO in one view. Creator is trained on search data. Monitoring is technical SEO. The risk for a buyer is that AI visibility becomes a tab on an SEO score. The risk for a new entrant is that Conductor already owns the topic graph and the CMS-adjacent workflow.

## Pipeline and architecture

**Facts.** HAR: 1,577 requests to `www.conductor.com`, 158 to `cdn.sanity.io`, PostHog, Google Tag Manager, Vercel-related URLs, and 1,195 URLs containing `/_next/` (REA evidence `ev_72f38a0d5fcea624b981ba8a6457fd35a806a1701402a9ecd8cf62dc4608649e`). `robots.txt` allows `/` except a favicon pattern and lists both a site sitemap and a docs sitemap. `llms.txt` returned 200. `/llms-full.txt` returned 404.

**Inferences.** The marketing and docs site is Next.js on Vercel with Sanity as the content API. PostHog is product analytics on that site. AgentStack plus a public MCP and Data API is the architectural bet: Conductor wants to be the system of record that other agents call. The measurement workers are not in the HAR. Gated research PDFs are a content-marketing pipeline, not a data pipeline.

## Client claims

The platform page quotes Chris Carlisle, SVP Global Marketing at BraunAbility, on search-category rank over “three or four years,” which predates the current AEO pitch and is not an AI metric. Krinal Mehta, Senior SEO Manager at FreshBooks, is quoted that monitoring avoided traffic loss “easily worth $1M.” That is a testimonial about Conductor Monitoring, not about answer engines. Roxanne Nevin is quoted on content production. None of these is an AEO case study.

## Evals and QA

`llms.txt` indexes “The AI Writing Assistant Output Evaluation Report,” a gated comparison of Jasper, Semrush, Writer, and Conductor’s writer. The PDF was not fetched, so its scores are not quoted. The existence of an eval report is the fact. No public eval of AI-visibility precision was found on the open pages.

## Security

The AI Search Performance feature page states “SOC 2 Type 2” and “ISO 27001” in the same sentence as enterprise-grade security ([feature page](https://www.conductor.com/platform/features/ai-search-performance/)). The report type (Type II versus a typo for Type 2) is quoted as they wrote it. A trust-center URL was not resolved from that page.

## Pricing

Dollar prices are still not stated. The feature page says access is “a flexible, usage-based model of AI Response Credits.” The docs price those credits per engine, as listed above. A public seat price was not on the pages read for this follow-up. The HAR recorded a 200 for `/pricing/`; the HTML body was omitted because it exceeded the capture size cap.

## Strengths

AgentStack is the right distribution: MCP and in-chat apps where the buyer’s team already works. Pairing a writer trained on a long search history with a monitor is a full loop if the visibility data is real. Sanity plus Next.js is a maintainable public site, and `llms.txt` at least exists. The writing-assistant eval, even gated, shows they know output quality is a product question.

## Weaknesses

The platform page and the root `llms.txt` still hide the contract: gated PDFs, SEO-era testimonials, and “the only all-in-one.” The docs do publish engines and credits, and they disagree with the UI vendors on purpose. Variance is still unpublished. A buyer who only reads the homepage will miss the credit table.

## What to copy or beat

Copy the per-engine credit table and the refusal to invent AI search volume. Copy AgentStack’s shape: official apps plus MCP plus a data API. Beat the API-only stance by storing a paired UI draw for the same prompt, so the compliance story and the user-visible story are both on the chart. Ungate the eval summary. Split “app inside ChatGPT” from “measurement of ChatGPT.”

## Inferences, separated

Next.js, Vercel, Sanity, and PostHog are HAR observations. The system-of-record bet is an inference from AgentStack’s description. Dollar prices and a margin of error remain unpublished. The API-first sentence is their claim, not a packet capture of the runner.

## Sources

- https://www.conductor.com/platform/
- https://www.conductor.com/llms.txt
- https://www.conductor.com/robots.txt
- https://www.conductor.com/platform/features/ai-search-performance/
- https://www.conductor.com/docs/intelligence/ai-search-faqs/
- HAR and REA JSON: `rea/har/conductor.har`, `rea/json/conductor.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/conductor.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_72f38a0d5fcea624b981ba8a6457fd35a806a1701402a9ecd8cf62dc4608649e`
- Artifact SHA-256: `457c3c704058435b8a01c11a0e78439993c7ab091e47e962a5b2d91e9adcdcde`
- Artifact bytes: 20208808
- Records: 1880
- JSON: `rea/json/conductor.json`
- HAR: `rea/har/conductor.har`

Highest host counts in the capture (request counts, not unique users): `www.conductor.com` (1577), `cdn.sanity.io` (158), `us-assets.i.posthog.com` (48), `www.googletagmanager.com` (27), `pagead2.googlesyndication.com` (18), `www.google-analytics.com` (17), `cdn.drda.io` (9), `cdn.dreamdata.cloud` (9).

Response `server` header samples: `cloudflare` (973), `Google Tag Manager` (27), `UploadServer` (9), `Golfe2` (9).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.conductor.com/` (text/html; charset=utf-8)
- ordinal 113: HTTP 200 `https://www.conductor.com/?_rsc=ry-B8umWgNEV4JR9` (text/x-component)
- ordinal 116: HTTP 200 `https://www.conductor.com/pricing/?_rsc=ry-B8umWgNEV4JR9` (text/x-component)
- ordinal 125: HTTP 200 `https://www.conductor.com/?_rsc=PpB8_eiKxv1n8ApZ` (text/x-component)
- ordinal 126: HTTP 200 `https://www.conductor.com/?_rsc=7gkzWpDDCzCFk4Qo` (text/x-component)
- ordinal 132: HTTP 200 `https://www.conductor.com/pricing/?_rsc=SdPYcO4osj1xHAuI` (text/x-component)
- ordinal 255: HTTP 200 `https://www.conductor.com/?_rsc=PE58sdBclUPt8F34` (text/x-component)
- ordinal 258: HTTP 200 `https://www.conductor.com/pricing/?_rsc=PE58sdBclUPt8F34` (text/x-component)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

# Scrunch AI

Primary site: [scrunch.com](https://scrunch.com/). Captured 2026-10-14. Offering: SaaS, core self-serve and enterprise. `llms.txt` also records a Sitecore corporate relationship (“Scrunch is now a Sitecore company”).

## Three-line summary

Scrunch prices a response quota, not just a prompt quota: Core is $250 per month for 125 prompts and 5,000 responses, which is 40 responses per prompt per month if the quotas are used evenly. That arithmetic is this report’s, not a sampling design they published. A collection FAQ says they use both browser automation and official platform APIs, daily for 14 days on a new prompt, then a 72-hour default. An FAQ prices Agency Core at $500 per month. The marketing HAR shows Sanity, Osano, Cloudflare, and Akamai.

## Offering

`llms.txt` says Scrunch monitors ChatGPT, Perplexity, Meta AI, Claude, Gemini, Google AI Overviews, and more, organized as Monitoring, Insights, and an enterprise platform ([llms.txt](https://scrunch.com/llms.txt)). Customers named there: Lenovo, Clerk, BairesDev, Crunchbase, BigTime, Penn State University, Ring Central, and Ally. Pricing is requested via a meeting in that file; the pricing page itself is public ([pricing](https://scrunch.com/pricing/)).

Later posts indexed by `llms.txt` add Agent Pages, Site Optimization, a Keyword Volume Estimator, Prompt Templates, Signals and Explorer, an MCP, sentiment trends, shopping, and “panel data.”

## GEO methodology

The monitoring page describes brand presence, citations, sentiment by persona, and competitive presence ([monitoring](https://scrunch.com/platform/monitoring/)). Widgets on that page use fictional names (Tyrell, Delos, Skynet, sky.net). Those figures, including a tiled “38%” presence and “1.8M” responses, are interface examples, not customer results. A separate testimonial block claims a “364% increase in brand presence for non-branded prompts” without a named customer in the extracted text.

Methodology posts linked from `llms.txt` argue that share of voice is “table stakes,” that prompt sets have a right size, and that panel data matters. This report did not re-fetch each post; the titles are sourced from `llms.txt`.

## How they measure

From the pricing page:

- Core: 125 unique prompts, 5,000 responses per month, 4 LLMs (ChatGPT, Perplexity, Google AIO, Copilot), 1 country, 1 persona, 1 language, 5 competitors, 3 AI-search-trend topics, limited query fan-out.
- Enterprise: custom prompts and responses, 9 LLMs adding Claude, Gemini, Meta AI, Google AI Mode, and Grok, unlimited countries, custom personas and languages, full fan-out, product observability.
- Both tiers list citations, funnel stages, and sentiment on Core as included.
- Site audits: 5 per month on Core, full audits on Enterprise. Site map pages: 25 on Core.
- AI agent and bot traffic is included, with multi-domain called out for Enterprise.

**Inference, labeled.** 5,000 / 125 = 40 collected responses per prompt per month if a customer uses both quotas fully and evenly. That is not the same statement as “we sample each prompt 40 times,” and it is a monthly pool, not a per-run design. Compare with Evertune’s explicit 100 repeats.

A collection FAQ, fetched after the HAR, says both runners ([FAQ](https://scrunch.com/faqs/what-methods-does-scrunch-use-to-collect-data-from-ai-platforms/)): “including browser automation and official platform APIs,” chosen “for each AI platform,” and checked against “responses collected directly from inside AI platforms.” New prompts are collected “daily for the first 14 days,” then “a default 72-hour refresh cadence,” with refresh on demand. Position in that FAQ is “top, middle, bottom,” not a numeric rank. Sentiment examples are “positive, mixed, negative.”

Not stated: which engine uses the browser and which uses the API, logged-in versus logged-out, or a margin of error. The 14-day daily window is a cadence, not a repeat count per day.

## Matching real users

One country and one persona on Core is a fidelity ceiling they put in the price card. Enterprise is where multi-country and personas unlock. The monitoring page’s persona table (named segments with response counts) shows the product shape; the names in the demo are not real segments. Panel-data is a blog title in `llms.txt`, which suggests they know the cherry-picking problem. The post was not quoted here.

## Metrics

Brand presence (yes/no in an answer), sentiment change, citation share by owner type (brand, third party, competitor, social), competitive presence, and an “Influence Score” on the demo. Keyword Volume Estimator is the demand metric, per the `llms.txt` title. Position is not given a formula on the pricing page.

## SEO overlap

Site audits, bot-traffic logs, and page optimizations are the SEO-shaped products. Fan-out is limited on Core. They do not, on these pages, claim a web index of their own. Sitecore is a CMS distribution path (`llms.txt` links a SitecoreAI post), which is an SEO-stack overlap of a different kind: optimization inside the CMS that already publishes the site.

## Pipeline and architecture

**Facts.** HAR hosts: `scrunch.com` (740), Osano consent (`cmp.osano.com`), Adobe Typekit, Sanity CDN, Cloudflare, and Akamai references (REA evidence `ev_55cf5af2bef93483975dd9e24007dd3085c6b0bf71ce768ce528787553c7e516`). `robots.txt` allows `/` and points at `sitemap-index.xml`. `llms.txt` is HTTP 200. `/sitemap.xml` was 404; the robots file names a different sitemap URL.

**Inferences.** Sanity is the content store for the marketing site. Osano is consent, which matters because their own measurement ethics story depends on being explicit about collection. Akamai plus Cloudflare on one marketing capture usually means a CDN in front and another tag or property behind it; the HAR does not prove the measurement workers’ network. Bot-traffic analytics implies they ingest customer log files or a snippet. The snippet was not captured from an authenticated app.

## Client claims

Named logos in `llms.txt`. “Trusted by over 500 companies” on the monitoring page and “500+” on pricing. The 364% line is an unattributed testimonial in the extract. Bain is mentioned as a research collaboration in a `llms.txt` title, not as a methods audit this report read.

## Evals and QA

Not stated on the pricing or monitoring pages. Topic Prompt Optimizations, from a blog title, is a product for choosing how many prompts to track. That is an eval of the prompt set, and it is not specified here beyond the title.

## Security

Core includes Google SSO. Enterprise adds SAML and OIDC, API, Looker Studio, and MCP. No SOC 2 sentence was on the fetched pricing page. `llms.txt` says the enterprise platform combines “enterprise-grade security” without naming a report.

## Pricing

Core $250 per month, as specified above. Enterprise custom. A pricing FAQ’s JSON-LD says Agency Core is “$500 per month” and Agency Enterprise is custom ([FAQ](https://scrunch.com/faqs/what-is-the-pricing-for-scrunch-plans/)). That FAQ can lag the pricing table; both pages are quoted. AXP (Agent Experience Platform) is Enterprise-only. Content generation is “Basic” on Core and “Advanced” on Enterprise. Page optimizations: 1 per month on Core.

## Strengths

Response quotas make sampling visible in the contract even if the design is not written down. The four-versus-nine engine split stops a cheap tier from pretending to cover Claude and Gemini. Bot traffic plus site audits is the part of GEO that is actually about the customer’s own logs. Prompt templates and an MCP are distribution, not just charts.

## Weaknesses

Core’s one-country, one-persona box will mis-measure any brand whose buyers are not that persona. Demo pages use science-fiction brands, which is honest if labeled and misleading in screenshots. Share-of-voice skepticism in their own blog sits next to presence as the primary chart. Sitemap URL in robots does not match `/sitemap.xml`.

## What to copy or beat

Copy the dual quota (prompts and responses) and the engine list printed on the invoice. Beat the 40-per-prompt inference by stating the draw design: independent sessions, same session, UI or API. Publish the persona binding. If panel data is real, show the coverage curve the way Evertune shows a margin of error.

## Inferences, separated

The 40-response figure is arithmetic. Sanity, Osano, Cloudflare, and Akamai are marketing-site observations. Sitecore is from their own `llms.txt` headline.

## Sources

- https://scrunch.com/llms.txt
- https://scrunch.com/pricing/
- https://scrunch.com/faqs/what-methods-does-scrunch-use-to-collect-data-from-ai-platforms/
- https://scrunch.com/faqs/what-is-the-pricing-for-scrunch-plans/
- https://scrunch.com/platform/monitoring/
- https://scrunch.com/robots.txt
- HAR and REA JSON: `rea/har/scrunch.har`, `rea/json/scrunch.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/scrunch.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_55cf5af2bef93483975dd9e24007dd3085c6b0bf71ce768ce528787553c7e516`
- Artifact SHA-256: `eee4b2c690755e3fc0f5dac15a61207587f5e960e1b5a445e5be39691f81073e`
- Artifact bytes: 6387216
- Records: 831
- JSON: `rea/json/scrunch.json`
- HAR: `rea/har/scrunch.har`

Highest host counts in the capture (request counts, not unique users): `scrunch.com` (740), `cmp.osano.com` (53), `use.typekit.net` (13), `p.typekit.net` (13), `cdn.sanity.io` (12).

Response `server` header samples: `cloudflare` (217), `AmazonS3` (40), `nginx` (26), `CloudFront` (13).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://scrunch.com/` (text/html; charset=utf-8)
- ordinal 69: HTTP 200 `https://cmp.osano.com/` (text/html)
- ordinal 81: HTTP 200 `https://scrunch.com/pricing/` (text/html; charset=utf-8)
- ordinal 118: HTTP 200 `https://cmp.osano.com/` (text/html)
- ordinal 135: HTTP 200 `https://scrunch.com/` (text/html; charset=utf-8)
- ordinal 199: HTTP 200 `https://cmp.osano.com/` (text/html)
- ordinal 212: HTTP 200 `https://scrunch.com/` (text/html; charset=utf-8)
- ordinal 272: HTTP 200 `https://cmp.osano.com/` (text/html)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

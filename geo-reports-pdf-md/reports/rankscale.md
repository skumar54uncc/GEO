# Rankscale

Primary site: [rankscale.ai](https://rankscale.ai/). Captured 2026-10-14. Offering: self-serve SaaS for agencies and in-house teams. Legal entity named on the site: Rankscale GmbH ([imprint link in llms.txt](https://rankscale.ai/llms.txt)).

Included because public comparison matrices treat it as a multi-engine GEO tracker with a credit meter, and because its pricing page is the only one in this set that prices GUI engines and API engines as different SKUs.

## Three-line summary

Rankscale meters monitoring in credits, “typically 0.25” per engine per prompt, with higher weights for some engines, and lets the buyer pick hourly through monthly cadence and every region. The credit calculator separates GUI engines from API engines. Plans run from an Essentials yearly price the page renders as $20 and $17 per month, up to Enterprise at $780 per month for 12,000 credits. Security language on the FAQ is generic encryption, not a named audit.

## Offering

`llms.txt` calls Rankscale a GEO tool to analyze, track, and optimize presence on AI search, and names ChatGPT, AI Overviews, Perplexity, Claude, Gemini, and Deepseek ([llms.txt](https://rankscale.ai/llms.txt)). The long file adds website audits, custom prompts, citation analysis, competitor discovery, sentiment, exports, and multi-brand dashboards ([llms-full.txt](https://rankscale.ai/llms-full.txt)). A free no-registration audit “runs them through a real AI search engine.”

## GEO methodology

The FAQ defines GEO as preparing content to be synthesized into answers, as distinct from ranking a URL ([llms-full.txt](https://rankscale.ai/llms-full.txt)). Recommendations are “content improvement suggestions and side-by-side comparisons,” not full article generation. Audits score relevance, authority, engagement, and technical structure, and can “simulate AI bots” by “toggling anti-bot measures.”

## How they measure

Pricing page ([pricing](https://rankscale.ai/pricing)):

- Credits renew each cycle. “Each time Rankscale queries an AI engine, it uses a fraction of a credit (typically 0.25).”
- The calculator text distinguishes “GUI engines” (AI Overview GUI, Copilot GUI) from “API engines,” and shows weights including AI Mode 0.25, ChatGPT 0.25, Perplexity 0.25, Gemini 0.25, DeepSeek 1, and Claude 2.
- Named API engines in that same calculator text include P Sonar, P Sonar-Pro, P Sonar-R-Pro, GPT-5, GPT-5.6 Terra, GPT-6.1 Sol, Muse Spark, Gemini 3.0F, Gemini 3.8F, Gemini 3.1P, Claude 5.5S, Claude 5.5H, and Mistral Large. This report quotes the page. It does not independently verify that each name is a live provider model.
- Cadence: hourly, daily, weekly, or monthly.
- Regions: all, on the published plans.
- Shopping analysis for ChatGPT, Google AI Mode, and Bing Copilot Shopping. Ad analytics for sponsored placements in ChatGPT, AI Mode, and Copilot.
- Query fanout: internal searches the engine runs, included on every plan.

Plan quotas on the same page: Pro $99, 1,200 credits, “up to 4,800 answers”; Pro+ $229, 3,000 credits, 12,000 answers, REST API; Growth $385, 5,500 credits, 22,000 answers; Enterprise $780, 12,000 credits, 48,000 answers. Essentials is yearly only; the table’s starting-price cell reads “$20$17/mo”. Rollover caps are 2× or 3× depending on plan. The page says “Trusted by 1000+ active users.”

Not stated: how many stochastic repeats sit inside one “answer,” or a margin of error.

## Matching real users

The GUI-versus-API price split is an admission that those are different measurements. The FAQ says the free audit uses “a real AI search engine.” Anti-bot toggles on audits are a fidelity control for crawlers, not for answer sampling. Hourly cadence can track drift; it can also average together model updates and noise. No locale-personalization study was on the fetched pages. “Regions: all” is a coverage claim without a published profile design.

## Metrics

Visibility score over time, competitor benchmarks, citation frequency, sentiment, shopping-card providers, ad share of voice, and source-box analysis ([pricing](https://rankscale.ai/pricing), [llms-full.txt](https://rankscale.ai/llms-full.txt)). Position is described as ranking position in the free-audit FAQ.

## SEO overlap

The product explicitly contrasts itself with traditional SEO tools and does not claim a backlink index. Query fanout is the overlap: the searches an answer engine runs are the SEO demand underneath a prompt. Exports to CSV, Sheets, and Looker Studio are the join to whatever SEO warehouse the customer already has.

## Pipeline and architecture

**Facts.** `robots.txt` says the sitemap is “a single flat urlset (postbuild collapses Astro's index+chunk)” and allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and a list of other AI user agents ([robots.txt](https://rankscale.ai/robots.txt)). HAR hosts include `rankscale.ai`, Adobe Typekit, PostHog (`eu-assets.i.posthog.com`), Google Tag Manager, and OpenAI beacons (REA evidence `ev_b3281bbdb37b1402553520dbc393ac0d84ed6c56bb8ab218f5873461cf610dd3`). JSON-LD on captured pages includes `Offer`. Privacy policy, via `llms.txt`, names Google Analytics and Firebase.

**Inferences.** Astro is the marketing-site generator, from their own robots comment. PostHog in the EU asset host is consistent with a European company, not proof of data residency for customer prompt logs. The credit weights are the public hint that some engines are API calls (cheap or expensive per token policy) and some are GUI sessions (heavier, priced higher when the weight is higher). Claude at 2 credits versus ChatGPT at 0.25 is a cost signal, not a quality signal.

## Client claims

“1000+ active users” on the pricing page. No numeric customer case study was extracted.

## Evals and QA

The FAQ says analyses use “advanced AI algorithms” that are “continuously update[d].” No agreement rate, no gold set. Scout is described as AI suggestions over the monitoring data, which is a generation layer on top of measurement and needs its own eval. None is published on the fetched pages.

## Security

FAQ: “industry-standard encryption,” data “used solely for analysis.” No SOC 2, ISO, or SSO on the public plan cards except the custom plan line “Individual credits SSO.” That reads as SSO being a custom add-on. Privacy policy URL: [privacy](https://rankscale.ai/privacy).

## Pricing

See the quotas above. Seats are unlimited on team workspaces. MCP is listed. REST API starts at Pro+ for metrics and share links. White-label dashboards start at Growth. Rankscale GmbH “contributes 1% of purchases to remove CO₂.”

## Strengths

A founder can compute observations from credits and weights. GUI and API are not pretended to be the same product. Hourly cadence and fanout queries are features the enterprise suites describe vaguely. Agency packaging (white label, partner directory, Looker) is concrete.

## Weaknesses

Model names on a pricing calculator will go stale, and several names in the scrape are easy to misread as a single menu. Security is below the enterprise bar they will hit if the $780 plan is sold to a security review. “Trusted by 1000+ active users” is not a definition of active. Variance is unpublished, so hourly charts can look like signal.

## What to copy or beat

Copy the price list that separates GUI from API and shows the weight. Beat it by pinning each weight to a written collection method (logged-out browser, official API, third-party router) and by attaching a standard error to every score. Publish a model-menu changelog so “GPT-5.6 Terra” cannot drift into folklore.

## Inferences, separated

Astro is from the robots comment. The cost-versus-method reading of credit weights is an inference. EU PostHog is an asset-host observation only.

## Sources

- https://rankscale.ai/llms.txt
- https://rankscale.ai/llms-full.txt
- https://rankscale.ai/pricing
- https://rankscale.ai/robots.txt
- https://rankscale.ai/privacy
- HAR and REA JSON: `rea/har/rankscale.har`, `rea/json/rankscale.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/rankscale.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_b3281bbdb37b1402553520dbc393ac0d84ed6c56bb8ab218f5873461cf610dd3`
- Artifact SHA-256: `db43d263768028e61d654776d91426f569ffb04df2da3303a2fac8aef64acb8a`
- Artifact bytes: 4549724
- Records: 758
- JSON: `rea/json/rankscale.json`
- HAR: `rea/har/rankscale.har`

Highest host counts in the capture (request counts, not unique users): `rankscale.ai` (491), `use.typekit.net` (78), `eu-assets.i.posthog.com` (45), `www.googletagmanager.com` (27), `fonts.gstatic.com` (18), `bzrcdn.openai.com` (18), `pagead2.googlesyndication.com` (18), `www.google-analytics.com` (15).

Response `server` header samples: `cloudflare` (63), `Google Tag Manager` (27), `nginx` (18), `ESF` (9).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://rankscale.ai/` (text/html; charset=utf-8)
- ordinal 94: HTTP 200 `https://rankscale.ai/pricing` (text/html; charset=utf-8)
- ordinal 753: HTTP 200 `https://rankscale.ai/robots.txt` (text/plain; charset=utf-8)
- ordinal 755: HTTP 200 `https://rankscale.ai/llms.txt` (text/plain; charset=utf-8)
- ordinal 756: HTTP 200 `https://rankscale.ai/llms-full.txt` (text/plain; charset=utf-8)
- ordinal 757: HTTP 200 `https://rankscale.ai/sitemap.xml` (application/xml)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

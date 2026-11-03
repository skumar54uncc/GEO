# AthenaHQ

Primary site: [athenahq.ai](https://athenahq.ai/). Captured 2026-10-14. Offering: SaaS GEO platform with self-serve, agency, and enterprise tiers. The company describes itself as a product company, not an agency, and also sells to agencies.

## Three-line summary

AthenaHQ’s public contract is credit-denominated monitoring plus an action layer: one credit is one AI response, Starter is $295 per month for 3,600 responses across a named set of models, and Enterprise adds a citation agent, SSO, and claim review. `llms.txt` is a real product surface, not a 404. The measurement write-up names engines, personas, and a query-volume model, and does not publish a repeat-sample variance formula.

## Offering

`llms.txt` calls AthenaHQ “a generative engine optimization (GEO) platform” that monitors ChatGPT, Google AI Overviews and Gemini, Perplexity, Claude, and other answer engines, and attributes the team to “backgrounds at Google Search and DeepMind” ([llms.txt](https://athenahq.ai/llms.txt)). The same file lists monitoring, share of voice, content agents, and revenue attribution as one product. Plans are linked at [plans](https://athenahq.ai/plans/).

## GEO methodology

Two named systems sit above dashboards:

- Query Volume Estimation Model (QVEM), linked from `llms.txt` as the way they estimate AI search query volume ([article](https://athenahq.ai/articles/generative-ai-search-query-volume-estimation-model/)). This report did not re-derive that model; the existence of the claim is the sourced fact.
- Athena Citation Engine (ACE), described in `llms.txt` as autonomous content agents that create and optimize content for citation, and gated to Enterprise on the plans page.

The plans page also lists on-page and off-page actions, a content optimization agent, “self-learning content improvement,” dynamic robots.txt and llms.txt management, persona targeting, and an Athena Recommendation Engine.

## How they measure

Plans page, Starter column: visibility across ChatGPT, Perplexity, AI Overviews, AI Mode, Gemini, Claude, Copilot, Grok, DeepSeek, Meta AI, and Mistral, with “additional models available upon request.” Essential (free) is a shorter list: ChatGPT, Perplexity, AI Overviews, Gemini, Copilot.

Unit of work: “1 credit = 1 AI response.” Essential includes 300 credits and “$25 free credit.” Starter is $295 per month for 3,600 credits. API access and extra credits are paid add-ons on Starter and included on Enterprise ([plans](https://athenahq.ai/plans/)).

Also listed: unlimited competitor tracking, prompt variations and conversation context, real-time sentiment, GA4 and Google Search Console, Shopify and Webflow. Multi-language and multi-region are Enterprise features in the comparison table (“Multiple Countries” is not marked on Starter in the extracted table). Prompt volume estimation is listed for both Starter and Enterprise as a numeric estimate, with the page using a placeholder example (“XX,XXX searches”) rather than a live figure.

Not stated on the fetched plans page: how many times a single prompt is repeated, whether the response is taken from a consumer UI or a provider API, locale binding, or a variance estimate.

## Matching real users

Persona targeting and multi-region support are Enterprise line items. “Prompt variations and conversation context” is the closest public control for the fact that a single wording is not the user distribution. No published human-session agreement study was in the fetched pages.

## Metrics

Share of voice is a named concept; `llms.txt` points at a methodology article ([share of voice](https://athenahq.ai/blog/understanding-share-voice-ai-search/)) and at case-study headlines that use it. Sentiment is “real-time brand sentiment intelligence.” Citations are the thing ACE is built to move. Position is not given a formula on the plans page.

Case-study headlines in `llms.txt` (vendor claims, not recomputed here): Rootly “10x Citation Rate”; AutoRFP “10x ChatGPT Traffic”; Gruns “+10.6pp Share of Voice”; Verito “36% Share of Voice”; Popl “38% MoM Lead Growth”; Buried “300% More Leads”; NuvaDermis “3x Share of Voice.”

## SEO overlap

GA4 and Search Console are the explicit join to classic SEO. The action layer includes on-page and off-page GEO/SEO actions, so they sell the overlap as one work queue. QVEM is their attempt to put a volume number next to a prompt the way a keyword tool puts volume next to a query. The estimation method itself was not extracted beyond the article link.

## Pipeline and architecture

**Facts.** HAR host counts are dominated by `athenahq.ai`, then PostHog (`us-assets.i.posthog.com`), Google/GTM, `bzrcdn.openai.com`, HubSpot, G2, and Microsoft Clarity. Response server headers and asset URLs include Vercel (REA evidence `ev_e93d538839e55d3c75207088904c196d2d4f9165a7f3e4954baf01d8522e3a90`, see the REA section). `robots.txt` allows `/` and `/llms.txt` and includes an ASCII comment. Both `llms.txt` and `llms-full.txt` returned 200. Sitemap is an index pointing at `sitemap-0.xml`.

**Inferences.** The marketing site is a Vercel-hosted app with PostHog product analytics and HubSpot for forms. OpenAI’s beacon on a marketing page is a tag, not evidence of how prompts are executed. Credit metering implies a response ledger. Whether each credit is a UI scrape or an API call is not determined by the HAR.

## Client claims

The headlines above are the public claims. The plans page also cites G2 and Slashdot badges: “High Performer,” “Season Spring 2026,” category Answer Engine Optimization, and “4.9 out of 5.” Those are badge claims on the vendor page.

## Evals and QA

Enterprise lists “Oracle discrepancy detection” and “Knowledge Base and claim review.” That is a brand-fact QA loop. No public inter-annotator agreement, sample size, or model-drift regression was on the fetched plans or `llms.txt`.

## Security

Enterprise lists SAML and OIDC SSO, organization audit log, and access controls. Starter lists Google and Microsoft OAuth. A SOC 2 report was not stated on the fetched plans page. Privacy and terms URLs are in `llms.txt`.

## Pricing

| Plan | Price | Credits | Models named on the page |
| --- | --- | --- | --- |
| Essential | Free, $25 credit | 300 | ChatGPT, Perplexity, AI Overviews, Gemini, Copilot |
| Starter | $295/month | 3,600 | Those plus AI Mode, Claude, Grok, DeepSeek, Meta AI, Mistral |
| Enterprise | Custom | Custom | ACE, SSO, multi-region, personas, BI exports |

Source: [plans](https://athenahq.ai/plans/).

## Strengths

The credit definition is the cleanest public unit in this set: one response, one credit, so a buyer can compute cost per observation. The action layer (ACE, crawler-file management, claim review) is specified as product, not as a blog. `llms.txt` is maintained and points at comparisons, which is what they tell customers to do.

## Weaknesses

Starter’s country coverage is the constrained cell in their own table, so a multi-market brand cannot self-serve the fidelity problem AthenaHQ itself treats as Enterprise. Variance is unpublished. Badge ratings are not a measurement eval. Comparison pages are marketing; they were not used here as evidence about competitors.

## What to copy or beat

Copy the credit-equals-response meter and the split between a free observation tier and an action tier. Beat QVEM by publishing the estimator, the training window, and the error against a held-out prompt log. Beat ACE by separating “generated a page” from “the page was cited in a pre-registered prompt set after publication.”

## Inferences, separated

Vercel, PostHog, HubSpot, and Clarity are HAR observations about the marketing site. They are not the prompt runner. Founder-pedigree language is quoted from `llms.txt`, not independently biographed in this report.

## Sources

- https://athenahq.ai/llms.txt
- https://athenahq.ai/plans/
- https://athenahq.ai/robots.txt
- https://athenahq.ai/articles/generative-ai-search-query-volume-estimation-model/
- HAR and REA JSON: `rea/har/athenahq.har`, `rea/json/athenahq.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/athenahq.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_e93d538839e55d3c75207088904c196d2d4f9165a7f3e4954baf01d8522e3a90`
- Artifact SHA-256: `86d74c676cef9559e9a854f6ef3746845bad5a3ea3edc16d9c910ea7fd46bbff`
- Artifact bytes: 5618825
- Records: 1001
- JSON: `rea/json/athenahq.json`
- HAR: `rea/har/athenahq.har`

Highest host counts in the capture (request counts, not unique users): `athenahq.ai` (593), `us-assets.i.posthog.com` (64), `www.google.com` (42), `www.googletagmanager.com` (37), `bzrcdn.openai.com` (20), `bzr.openai.com` (13), `api-na2.hubapi.com` (13), `tracking-api.g2.com` (11).

Response `server` header samples: `Vercel` (246), `cloudflare` (173), `Google Tag Manager` (37), `nginx` (24).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://athenahq.ai/` (text/html; charset=utf-8)
- ordinal 117: HTTP 301 `https://athenahq.ai/pricing` (text/html)
- ordinal 996: HTTP 200 `https://athenahq.ai/robots.txt` (text/plain; charset=utf-8)
- ordinal 998: HTTP 200 `https://athenahq.ai/llms.txt` (text/plain; charset=utf-8)
- ordinal 999: HTTP 200 `https://athenahq.ai/llms-full.txt` (text/plain; charset=utf-8)
- ordinal 1000: HTTP 200 `https://athenahq.ai/sitemap.xml` (application/xml)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

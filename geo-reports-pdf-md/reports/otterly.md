# Otterly.ai

Primary site: [otterly.ai](https://otterly.ai/). Captured 2026-10-14. Offering: self-serve SaaS, with an agency-partner layer on top of the same product.

## Three-line summary

Otterly sells daily prompt tracking as a content-intelligence product: research, analytics, audits, and recommendations, with four engines in the base price and Claude, Gemini, and AI Mode as paid add-ons. Public prices start at $29 per month for 15 prompts. The HAR from this environment is a WAF denial, not a stack fingerprint: every document request returned 403.

## Offering

The homepage calls Otterly “the Content Intelligence Platform for AI Search,” covering prompt research, search analytics, content audit, and GEO optimization ([homepage](https://otterly.ai/)). Named engines in the hero: ChatGPT, Perplexity, AI Overviews, AI Mode, Gemini, and Copilot. A later block adds Claude to the analysis list. The page also says the company was “Recognized as a Cool Vendor in the 2025 Gartner Cool Vendors for AI in Marketing.”

## GEO methodology

Public workflow on the homepage: find prompts and intent, monitor mentions and citations, audit pages for crawlability and “citation potential,” then apply on-page recommendations. Off-site advice on the same page names PR, earned media, Reddit, Wikipedia, and social as the sources engines trust. A predictive score “before you publish” is claimed. The scoring function is not published.

## How they measure

Pricing page ([pricing](https://otterly.ai/pricing)):

- Lite, monthly: $29 for 15 search prompts. Annual figure shown alongside: $25 per month. The page says annual billing is 15% off.
- Standard: $189 monthly, or $160 in the annual column, for 100 prompts.
- The next tier (the page’s feature list calls it Premium in the includes section; the price card extract shows $489 monthly and $422 annual) includes 400 prompts.
- Custom: from 1,000 prompts.
- Base engines on every paid card: ChatGPT, Google AI Overviews, Perplexity, MS Copilot. Daily frequency.
- Add-on engines, monthly, by tier: Google AI Mode $9 / $59 / $149; Google Gemini $59 / $149 (Lite cell not clearly priced in the extract); Claude $29 / $109 / $439.
- Extra 100 prompts: $99 on Standard and Premium monthly. Standard is capped at 300 additional prompts before a move to Premium.
- Countries: “Multi-country support (50+).”
- Standard and above: API, MCP, agent analytics. Standard lists 2,000 API requests and 2,000 MCP requests per month, and 200k agent-analytics events. Premium lists 1M agent-analytics events.
- GEO URL audits: 1,000 / 5,000 / 10,000 per month by tier.
- Enterprise adds SSO, a quarterly GEO health check, and a success manager.

Not stated: repeats per prompt, UI versus API, or a variance estimate. “You don't need any additional OpenAI subscriptions” is a hint that Otterly runs the prompts, not the customer’s API key. It does not say whether that run is the ChatGPT UI.

## Matching real users

Fifty-plus countries is the locale claim. Daily cadence is the repeat claim. No persona model and no margin of error were on the fetched pages. Add-on engines mean a Lite customer’s “AI visibility” number is not comparable to a customer who bought Claude. That is a real fidelity bug in the way scores will be quoted.

## Metrics

The pricing includes list names Brand Visibility Index, domain ranking, link-citation analysis, and a GEO audit. The homepage adds mention and citation monitoring and competitor comparison. Sentiment is not a headline metric on these two pages. Share of voice is not named; “visibility” and domain ranking are.

## SEO overlap

The product is framed as content intelligence beside SEO, not as a rank tracker. Agent analytics (events from AI referrals) is the join to on-site behavior. Looker Studio is a connector from Standard up. No backlink index is claimed on these pages.

## Pipeline and architecture

**Facts.** The browser capture in this environment received HTTP 403 for the homepage, pricing, features, product, docs, robots.txt, llms.txt, and sitemap. The only successful third parties before the block were Google font hosts. REA evidence `ev_401fc862d1c055920e3dc7f6dd9410a25bd7ce6b75be1c8909154a53b2357f6d` records that denial. A separate unauthenticated fetch of the same public URLs from another path returned the marketing HTML used above. `llms.txt` from this environment’s earlier GET was a SiteGround captcha interstitial (HTTP 202), not an llms file.

**Inferences.** Otterly, or its host, blocks this network’s automated clients. That is a property of the marketing edge, not evidence of the measurement pipeline. No framework, CDN, or analytics vendor is honestly inferable from the 403 HAR. Do not treat font hosts as the stack.

## Client claims

“Trusted by 40,000+ Marketing Pros worldwide” on the homepage. Testimonials include Rebecca Anderson, Content Marketing Manager at Instant Commerce: “a 2x increase in both our visibility in AI search engines and incoming traffic.” Other quotes name Instant-adjacent and agency users. These are testimonials, not case studies with a method. Homepage tiles also show loose numbers (2,769, 2,454, 1,684, 2.14, “ASICS”) without labels that survived extraction; they are not used as metrics.

## Evals and QA

“We ran dozens of GEO Experiments” is a homepage claim without a linked results table in the extract. The quarterly GEO health check is an Enterprise service, not a published eval of Otterly’s own scorer. No human-agreement figure was found.

## Security

SSO is Custom/Enterprise. No SOC 2 statement was on the pricing page. Payment is “standard credit cards.”

## Pricing

Summarized above. Agency partners get Standard or Premium plus pitch workspaces, unlimited client workspaces, and Looker Studio reporting “with your branding.”

## Strengths

The price card is readable: prompts, engines, and add-on engines are separated so a buyer can see what a score excludes. Daily tracking at $29 is a real on-ramp. API and MCP appear before enterprise. The “no OpenAI subscription” line sets the right expectation that collection is the vendor’s job.

## Weaknesses

Engine coverage is a la carte, so benchmark charts across customers are not on the same instrument. Variance is unpublished. The marketing edge 403s and captchas common research clients, which is their right and also blocks `robots.txt` and `llms.txt` for any agent they might want to inform. Testimonials are not methods.

## What to copy or beat

Copy the add-on price list that refuses to bundle expensive engines into a $29 score. Beat it by making the base score’s engine set immovable in exports, so a Claude add-on cannot silently inflate “visibility.” Publish repeats per prompt. Serve `robots.txt` to documented research user agents even if the app is gated.

## Inferences, separated

No stack inference is drawn from the 403 capture. The reading that add-on engines make cross-customer scores incomparable is an inference from the price card, not their stated position.

## Sources

- https://otterly.ai/
- https://otterly.ai/pricing
- HAR and REA JSON: `rea/har/otterly.har`, `rea/json/otterly.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/otterly.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_401fc862d1c055920e3dc7f6dd9410a25bd7ce6b75be1c8909154a53b2357f6d`
- Artifact SHA-256: `2d90be620fd635c160dee9329060b80d2ae0445464e4aa3419d15a9b4222166d`
- Artifact bytes: 967676
- Records: 36
- JSON: `rea/json/otterly.json`
- HAR: `rea/har/otterly.har`

Highest host counts in the capture (request counts, not unique users): `fonts.gstatic.com` (18), `otterly.ai` (9), `fonts.googleapis.com` (9).

Response `server` header samples: `nginx` (9), `ESF` (9).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 403 `https://otterly.ai/` (text/html)
- ordinal 4: HTTP 403 `https://otterly.ai/pricing` (text/html)
- ordinal 20: HTTP 403 `https://otterly.ai/robots.txt` (text/html)
- ordinal 24: HTTP 403 `https://otterly.ai/llms.txt` (text/html)
- ordinal 28: HTTP 403 `https://otterly.ai/llms-full.txt` (text/html)
- ordinal 32: HTTP 403 `https://otterly.ai/sitemap.xml` (text/html)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

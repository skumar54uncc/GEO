# Peec AI

Primary site: [peec.ai](https://peec.ai/). Captured 2026-10-14. Offering: SaaS for brands and agencies. Included as a major prompt-visibility product whose public site describes measurement, shopping, fact-checking, and an agent layer in more detail than it describes price.

## Three-line summary

Peec’s pricing page is a product specification: daily visibility, position, sentiment, and share of voice; prompt volume on a 1–5 relative scale; shopping at SKU level; and fact checks against customer-supplied facts. Currency amounts were not in the HTML. The docs, on a different host, say collection is UI scraping of a logged-out browser, not vendor APIs. The marketing site is Framer and is loaded with sales-intelligence pixels.

## Offering

The pricing page says “Pricing for Brands” and “Trusted by 3500+ brands and agencies,” with Starter, Pro, Advanced, and custom Enterprise tiers ([pricing](https://peec.ai/pricing)). Navigation exposes engine-specific trackers for ChatGPT, Gemini, and AI Mode, plus agency and enterprise solutions, docs, a changelog, and comparisons with Ahrefs and Profound. Docs returned HTTP 404 at `/docs` in the HAR; a docs link still exists in the footer, so the public docs path may differ. This report does not use Peec’s comparison pages as evidence about other vendors.

## GEO methodology

The Act column is gap analysis (sources that cite competitors and not you), recommended actions split into earned and owned, and “agent actions” from pre-built and custom skills. A crawlability audit covers “which AI bots your robots.txt allows, partially allows, or blocks, across 40+ bots.” That is a concrete GEO technique: policy lint for AI crawlers, not another visibility chart.

## How they measure

Feature text on the pricing page:

- “Calculated by multiplying tracked prompts by active models and tracking frequency” as the way monthly AI answers are counted. A later read of the same pricing HTML, in document order, binds Starter to “50 prompts,” Pro to “150 prompts,” and Advanced to “350 prompts,” each next to “Choose 3 models.” Enterprise says “Up to 13 LLM models tracked.” Dollar or euro prices for those tiers are still not in the HTML. The page also says “We’ve raised €7m.” That is a fundraising sentence, not a plan price.
- Discover: brand context, prompt volume as “relative demand for the topic behind each tracked prompt, scored 1–5,” competitor and topic suggestions, personas, regions and languages, branded versus non-branded classification, and intent classification (informational, commercial, transactional).
- Measure: “visibility, position, sentiment, and share of voice, tracked daily against competitors.” Ads library for sponsored placements. Local GEO. Shopping: catalog from Shopify or CSV (including Google Merchant Center), SKU-level visibility, position, and win rate, top merchants, shopping query fan-outs, and source domains.
- Sources classified as competitor, editorial, reference, or UGC. Brand attributes scored against “what AI says you are known for.” Objections grouped and traced to pages. “Prompts fact-checked” against “facts per brand.”
- Report: crawl insights (which bots hit which pages and the status code), AI referrals, Looker Studio, API, MCP, CSV.
- G2 “4.7/5” is stated on the page footer.

The intro doc, which the marketing `/docs` path does not serve, states the runner ([docs](https://docs.peec.ai/intro-to-peec-ai)): “Unlike traditional analytics tools that rely on APIs, Peec AI uses UI scraping technology.” “Peec AI uses browser automation to interact with AI platforms through their web interfaces.” “For most platforms, this means the platform decides which model to use and whether it runs a web search. This is the reality for a logged-out user.” Prompts run “daily” across “ChatGPT, Gemini, and Copilot” in that paragraph. Docs `llms.txt` is at `https://docs.peec.ai/llms.txt`. The marketing `llms.txt` remains 404.

Not stated: a currency price, a repeat count beyond the daily cadence and the frequency field, or a margin of error. “Probability-based insights” is named and not specified.

## Matching real users

Countries, languages, regions, and personas are first-class configuration, which is the right shape. Relative prompt volume scored 1–5 is explicitly not a count of user sessions; it should not be briefed as demand. Daily tracking is the stated cadence for the visibility overview. The docs now do make the logged-out browser claim. A personalization study was not in the extract. The logged-out profile is a design choice, not a measured agreement with logged-in users.

## Metrics

Visibility, position, sentiment, share of voice, citation share, win rate on SKUs, attribute gaps, objection clusters, and fact-check coverage. Fan-out and retrievals are source metrics. The 1–5 volume score is a separate, ordinal metric and is easy to misuse as if it were search volume.

## SEO overlap

Crawlability, bot status codes, and AI referrals are the on-site join. Source classification (editorial versus UGC versus competitor) is the digital-PR join. There is no claim on this page of a keyword index or backlink graph. Prompt suggestions “from keywords” are the explicit SEO import.

## Pipeline and architecture

**Facts.** HAR hosts are dominated by `framerusercontent.com` (733) and `peec.ai`, then `t.peec.ai`, Google Tag Manager, `events.framer.com`, Snitcher (`radar.snitcher.com`), Claydar, Vector (`api.vector.co`), Cometly, Facebook, and OpenAI beacons (REA evidence `ev_1f01d90f8ae692558331619a96363f873f85284658ae954f598a1d878ee7f448`). `robots.txt` allows `/` and names a sitemap. `llms.txt` returned 404. Large HTML bodies for the homepage and pricing page were omitted from the HAR because they exceeded the capture body’s size cap; status codes were retained.

**Inferences.** Framer hosts the marketing site. `t.peec.ai` is a first-party collection host, likely tag or event intake, not the prompt runner. Snitcher, Claydar, Vector, and Cometly are visitor-identification and ad pixels on the marketing site. They are not evidence of how Peec samples ChatGPT. A prompt-times-models-times-frequency meter is the same shape as Athena’s credits and Rankscale’s credits, with the numbers left in the client bundle.

## Client claims

“3500+ brands and agencies” and G2 4.7/5, both on the pricing page. No case-study arithmetic was extracted.

## Evals and QA

Fact-checking prompts against a customer fact set is a productized QA loop for brand truth, not an eval of Peec’s mention detector. No human-agreement rate was on the page. Changelog exists as a URL; it was not fetched.

## Security

SSO is a row in the platform section. Role-based permissions are described at company and project level, including read-only. No SOC 2 sentence was in the extract. Legal links: DPA, privacy, terms, imprint.

## Pricing

Tiers are named Starter, Pro, Advanced, and Enterprise. Amounts were not in the fetched document. Do not import prices from secondary blogs into this report. Frequency, countries, projects, languages, competitors, and seats are the scaling axes the page lists.

## Strengths

The specification is ahead of most homepages: intent labels, source classes, SKU win rate, fact checks, and a 40-bot robots audit are buildable requirements. The answer-count formula (prompts × models × frequency) is the right billing primitive even without the integers. Separating a 1–5 relative volume score from visibility is more honest than fake query counts.

## Weaknesses

A pricing page that does not render prices in the HTML is a poor contract. `llms.txt` 404s while the product audits customer robots files. Sales-intel pixels are heavy for a company whose customers will ask where data goes. Docs at the obvious path 404’d in this capture. Variance is unpublished, so “daily” can still be one draw.

## What to copy or beat

Copy the metric dictionary on the pricing page, especially source classes, objection tracing, and the robots audit across 40 bots. Copy the relative volume score and label it ordinal. Beat the missing sample design: publish draws per cell and a standard error. Publish prices in HTML. Ship `llms.txt`.

## Inferences, separated

Framer and the pixel vendors are HAR facts about the marketing site. The reading of `t.peec.ai` as event intake is an inference from the host and path pattern (`/e/t`). Price figures are intentionally absent.

## Sources

- https://peec.ai/pricing
- https://docs.peec.ai/intro-to-peec-ai
- https://peec.ai/robots.txt
- HAR and REA JSON: `rea/har/peec.har`, `rea/json/peec.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/peec.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_1f01d90f8ae692558331619a96363f873f85284658ae954f598a1d878ee7f448`
- Artifact SHA-256: `541d42cdcc305864cbf79640df70c4e4979d2589930c7d41760f481abdca3bc5`
- Artifact bytes: 4539727
- Records: 1469
- JSON: `rea/json/peec.json`
- HAR: `rea/har/peec.har`

Highest host counts in the capture (request counts, not unique users): `framerusercontent.com` (733), `t.peec.ai` (70), `www.googletagmanager.com` (58), `www.google.com` (48), `events.framer.com` (40), `fonts.gstatic.com` (40), `radar.snitcher.com` (30), `api.claydar.com` (30).

Response `server` header samples: `CloudFront` (358), `cloudflare` (207), `AmazonS3` (70), `Google Tag Manager` (49).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://peec.ai/` (text/html)
- ordinal 171: HTTP 200 `https://peec.ai/pricing` (text/html)
- ordinal 1458: HTTP 200 `https://peec.ai/robots.txt` (text/plain)
- ordinal 1466: HTTP 404 `https://peec.ai/llms.txt` (text/html; charset=utf-8)
- ordinal 1467: HTTP 404 `https://peec.ai/llms-full.txt` (text/html; charset=utf-8)
- ordinal 1468: HTTP 200 `https://peec.ai/sitemap.xml` (text/xml)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

# BrightEdge AI Catalyst

Primary site: [brightedge.com](https://www.brightedge.com/). Product page: [AI Catalyst](https://www.brightedge.com/products/ai-catalyst). Captured 2026-10-14. Offering: enterprise SEO suite with an AI-search intelligence layer. Included because it is one of the incumbent enterprise SEO platforms now selling answer-engine measurement to the same buyers a new GEO platform will meet in procurement.

## Three-line summary

AI Catalyst tracks mentions and citations across ChatGPT, Perplexity, Google AI Overviews, Google AI Mode, Gemini, “and other AI platforms,” scores sentiment as positive, neutral, or negative, and ties the gap to the SEO metrics BrightEdge already has: ranking keywords and estimated traffic on the cited page. Personas are part of the pitch (practitioner versus buyer). A public price was not on the product page. The marketing site identifies itself as Drupal 11.

## Offering

`llms.txt` calls BrightEdge “the global leader in enterprise SEO and AI-driven content performance” and points at AI Catalyst, Copilot for Content Advisor, Autopilot for SEO, and Data Cube X ([llms.txt](https://www.brightedge.com/llms.txt)). The same file says markdown versions of those pages are not publicly available. AI Catalyst’s own page is the source for the product claims below.

## GEO methodology

The page’s loop is: track presence by engine, rate how the answer describes the brand, build prompts mapped to the buyer journey, then compare the cited page with the customer’s page on citation counts, ranking keywords, and estimated traffic, and turn the gap into a brief. It also names “social platforms, publications and contributors” that earn citations, as an outreach list. That is digital PR attached to a citation graph, which is the agency method, sold as software.

## How they measure

From the product page:

- Engines named: ChatGPT, Perplexity, Google AI Overviews, Google AI Mode, Gemini, and other AI platforms.
- Metrics: mentions presence and citations presence, separated so a team can see which moved.
- Sentiment: Positive, Neutral, or Negative, “with the specific reasoning,” for the brand and competitors.
- Persona test: “whether the answer changes depending on who is asking, a practitioner researching options or a decision maker ready to buy.”
- Prompts “mapped to the stage of the buyer journey.”
- The team can read “the full AI response.”
- Dashboards can be annotated with campaign and algorithm events. Export PNG or CSV.

Not stated: prompt counts, UI versus API, repeat count, locale matrix, refresh cadence, or price.

## Matching real users

The persona sentence is the fidelity feature, and it is the right one: the same prompt from a practitioner and a buyer is not the same measurement. The page does not say how a persona is implemented (system prompt, account history, or a label after the fact). Locale is not discussed. “Full AI response” storage is what makes an audit possible. Variance is not discussed, so a sentiment flip can be noise.

## Metrics

Mentions presence, citations presence, three-way sentiment, competitive gap over time, and the SEO pair of ranking keywords plus estimated traffic on the winning URL. Share of voice is not named on this page. Position inside the answer is not named; presence is.

## SEO overlap

This is the suite’s product thesis. The brief compares an AI citation with classic rank and traffic estimates. Data Cube is the keyword side, listed in `llms.txt`, not re-specified on the Catalyst page. Annotations for algorithm updates are a trend feature borrowed from SEO tooling and applied to AI series. That is worth copying, because model updates will otherwise be narrated as content wins.

## Pipeline and architecture

**Facts.** Generator meta on captured HTML: “Drupal 11.” HAR hosts include `www.brightedge.com`, `images-cdn.brightedge.com`, `videos.brightedge.com`, Microsoft Clarity, Google Tag Manager, LinkedIn, G2, Facebook, and Twitter/X (REA evidence `ev_f4c002376add69c902232aa8c1dba9c16a4305256bffe24b199fa0595e64d9b8`). `llms.txt` returned 200. `robots.txt` returned 200 and is a long classic file. The fetched robots text did not contain GPTBot, ClaudeBot, or PerplexityBot directives in the portion searched for this report.

**Inferences.** Drupal 11 is the marketing CMS, confirmed by the generator tag, not by a guess from URL shape. Image and video CDNs are first-party. Clarity and GTM are marketing analytics. The measurement path implied by the page is a prompt runner, a sentiment classifier with stored rationale, a persona condition, and a join to BrightEdge’s existing rank and traffic estimates. The join is the hard part and the moat. The HAR does not show it.

## Client claims

`llms.txt` says the platform “helps thousands of brands.” No AI Catalyst case-study number was extracted from the product page.

## Evals and QA

Sentiment “with the specific reasoning” is a reviewable artifact. No agreement rate against human raters was on the page. Persona differences are claimed as a test the user can run, which is the right QA shape if the raw answers are stored.

## Security

The AI Catalyst page does not discuss security. The trust page does ([trust](https://www.brightedge.com/trust)). It says “BrightEdge is ISO/IEC 42001 certified.” A section is titled ISO 27001:2022 and an image alt reads “ISO 27001:2022 Certified.” The SOC 2 section on that page defines what a SOC 2 examination is and, in the paragraph read, does not say BrightEdge holds a SOC 2 report. Product security features named there include “SAML/SSO.” NIST Cybersecurity Framework and GDPR are section titles on the same page.

## Pricing

Not stated on the product page or `llms.txt`. Contact and product URLs are the public path.

## Strengths

Separating mentions from citations, storing the rationale for sentiment, and joining the cited URL to rank and traffic estimates is the enterprise workflow. Persona as a condition, not a filter on a single run, is the right experimental design if they actually re-run. Algorithm annotations will matter the first time a model update panics a CMO. Drupal and a first-party CDN are a boring, inspectable marketing stack.

## Weaknesses

Price, quota, cadence, and collection method are absent, so a founder cannot diff Catalyst against Profound’s browser claim or Evertune’s 100-fold sample. “Other AI platforms” is an open list. `llms.txt` admits the useful pages are not available as markdown. Robots policy, in the slice reviewed, does not take a position on AI crawlers.

## What to copy or beat

Copy mention-versus-citation, stored sentiment rationale, persona as a re-run condition, and the join to rank and estimated traffic. Beat the opacity: publish cadence and whether the runner is a browser. Add a model-version annotation next to their algorithm annotation. Put a real `llms.txt` body on the product, since the file currently points at HTML and stops.

## Inferences, separated

The runner-and-join architecture is inferred from the product description. Drupal is a generator-meta fact. Security certifications are unknown, not negative.

## Sources

- https://www.brightedge.com/products/ai-catalyst
- https://www.brightedge.com/trust
- https://www.brightedge.com/llms.txt
- https://www.brightedge.com/robots.txt
- HAR and REA JSON: `rea/har/brightedge.har`, `rea/json/brightedge.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/brightedge.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_f4c002376add69c902232aa8c1dba9c16a4305256bffe24b199fa0595e64d9b8`
- Artifact SHA-256: `93d6c77b7cb5fda690f120b000f3f1ae0859bb641f4acdc69edc260aab61fbac`
- Artifact bytes: 8694462
- Records: 847
- JSON: `rea/json/brightedge.json`
- HAR: `rea/har/brightedge.har`

Highest host counts in the capture (request counts, not unique users): `www.brightedge.com` (135), `images-cdn.brightedge.com` (114), `videos.brightedge.com` (64), `www.google.com` (59), `www.googletagmanager.com` (40), `fonts.gstatic.com` (39), `analytics.google.com` (34), `static.addtoany.com` (33).

Response `server` header samples: `cloudflare` (124), `bws` (123), `AmazonS3` (63), `Google Tag Manager` (37).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.brightedge.com/` (text/html; charset=UTF-8)
- ordinal 248: HTTP 404 `https://www.brightedge.com/pricing` (text/html; charset=UTF-8)
- ordinal 831: HTTP 200 `https://www.brightedge.com/robots.txt` (text/plain)
- ordinal 837: HTTP 200 `https://www.brightedge.com/llms.txt` (text/plain)
- ordinal 838: HTTP 404 `https://www.brightedge.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 839: HTTP 200 `https://www.brightedge.com/sitemap.xml` (application/xml; charset=utf-8)
- ordinal 840: HTTP 200 `https://www.brightedge.com/sitemap_generator/default/sitemap.xsl` (application/xml; charset=utf-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

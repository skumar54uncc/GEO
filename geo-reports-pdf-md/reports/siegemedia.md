# Siege Media

Primary site: [siegemedia.com](https://www.siegemedia.com/). Captured 2026-10-14. Offering: agency. The homepage now leads with GEO rather than with a software product.

## Three-line summary

Siege Media describes itself as a full-service GEO agency: prompt and citation analysis, then content, digital PR, affiliate, and Reddit. The homepage attaches large client metrics to named brands, including LLM citation and visibility figures. There is no public SaaS price. The site is WordPress with WP Rocket and Wistia. `llms.txt` 404s. Yoast’s robots block allows all crawlers and publishes a sitemap index.

## Offering

The homepage title in the fetch is “Full-Service GEO Agency for Brands,” and the page says “We’re the GEO agency that brands hire when ROI isn’t optional” ([homepage](https://www.siegemedia.com/)). Services listed: GEO, consulting, affiliate, digital PR, content marketing, Reddit marketing. Offices are given in Austin, New York, Chicago, and San Francisco.

## GEO methodology

Their words: “We tear through prompt and citation data to find the AI mentions, recommendations, and ranking gaps we know you can capture — and then create content, signals, and coverage your competitors can’t match.” That is an agency loop: measurement as an input to content and earned media, not a dashboard subscription. They explicitly reject “an SEO playbook” used unchanged “in an AI-first search world,” while still selling SEO consulting next to GEO.

Techniques named: content, digital PR, affiliate, Reddit. No schema spec, no prompt-sample design, and no engine list were on the homepage extract.

## How they measure

The homepage does not name a tool. A measurement post does ([GEO ROI](https://www.siegemedia.com/seo/geo-roi-measurement), last updated Jul 9, 2026 on that page): a “three-point framework: self-attribution, branded search from LLM traffic, and AI share of voice.” “You can use tools like Peec AI, Otterly, and others.” “Our own AI visibility tracking on Peec AI tracks 11 buying-intent prompts.” They print a “53% visibility score” for that set, in a sentence that also says “a 27%” and “13 visibility points and seven share-of-voice points” without a clean subject for the 27%. This report quotes the 53% and the 11-prompt denominator and does not assign the 27% to a metric. The post’s LTV arithmetic uses example inputs and is not a client result. Homepage case lines still do not name the tracker or the prompt set.

## Matching real users

Not discussed. Locale is not a published control. Client metrics are end states, not sampling notes.

## Metrics

Homepage claims, as printed:

- “over $148,646,000 in yearly client traffic value.”
- Instacart: “46.5k Citations in LLMs,” “356% Increase in Traffic Value,” “958 Organic Links.”
- Zendesk: “98% LLM Visibility,” “$731,924 Increase in Traffic Value,” “10,675+ Links.”
- The Zebra: “1,580+ Organic Links,” “$7,774,000 Increase in Traffic Value.”
- Zapier: “$6.1M increase in traffic value,” “126 pieces ranking in the Top 10,” “96% LLM Visibility.”

These are vendor case-study figures. This report did not open the underlying studies or see the prompt sets, date ranges, or tracker. Traffic value is an SEO estimate, not cash. LLM visibility is undefined on the page (share of answers, share of citations, or something else).

## SEO overlap

The metrics mix LLM citations with organic links, top-10 rankings, and traffic value. That is the agency argument a platform should support: one narrative from rank to citation. It is also how double counting happens if both numbers are briefed as incremental revenue.

## Pipeline and architecture

**Facts.** HAR: WordPress paths (`wp-content` 726), Wistia (164), Google Tag Manager, Facebook, Microsoft Clarity, LinkedIn, WP Rocket mentioned in the generator meta on captured pages (REA evidence `ev_1e326c1ce45aebac0f22c4e66dced008d5c9a8ae1189bbf56c1b9360dd75be3c`). `robots.txt` is a Yoast block, `User-agent: *` / `Disallow:` empty, sitemap index at `sitemap_index.xml`. `llms.txt` returned 404.

**Inferences.** WordPress plus Wistia is a content-marketing site, which matches the business. No product API was observed. Their “prompt and citation data” lives in whatever tracker and spreadsheet the account team uses. It is not a platform a client can log into, based on the public site. That inference can be wrong if a portal exists behind a login this project did not touch.

## Client claims

The named figures above. No methodology appendix was fetched.

## Evals and QA

Not published. A 98% or 96% “LLM visibility” number without a denominator is not an eval. It is a score.

## Security

Not discussed. An agency holding client prompt logs and analytics access is a vendor-risk question their public site does not answer.

## Pricing

Not published on the homepage. Engagements of this type are custom. No number is invented.

## Strengths

They sell the work, not the chart: content, PR, Reddit, affiliate, aimed at citations. Named brands and mixed SEO-plus-LLM metrics are what a CMO already understands. The site is fast to read and the robots file is permissive. Yoast is a known quantity.

## Weaknesses

The measurement system is invisible, so the percentages cannot be audited or compared to Profound or Evertune. Traffic value and LLM visibility are different units added into one story. `llms.txt` is missing on a site that now sells GEO. No engine list means “citations in LLMs” might be one product or six.

## What to copy or beat

Copy the service menu (content, PR, Reddit, affiliate) as the action layer a platform must hand to humans or agents. Beat the reporting by forcing a denominator: prompts, engines, dates, and tracker name next to every “98% LLM visibility.” Offer the agency a workspace so the 46.5k citations are a query, not a slide.

## Inferences, separated

WordPress, Wistia, and WP Rocket are observed. The absence of a client portal is an inference from public pages only. Case metrics are quoted as their claims.

## Sources

- https://www.siegemedia.com/
- https://www.siegemedia.com/seo/geo-roi-measurement
- https://www.siegemedia.com/robots.txt
- HAR and REA JSON: `rea/har/siegemedia.har`, `rea/json/siegemedia.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/siegemedia.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_1e326c1ce45aebac0f22c4e66dced008d5c9a8ae1189bbf56c1b9360dd75be3c`
- Artifact SHA-256: `d2e4016e817617e6b86dc5c7c72b655de027e7dc36118e1adaffe8822ec8cc14`
- Artifact bytes: 14146745
- Records: 1183
- JSON: `rea/json/siegemedia.json`
- HAR: `rea/har/siegemedia.har`

Highest host counts in the capture (request counts, not unique users): `www.siegemedia.com` (759), `fast.wistia.com` (80), `www.google.com` (77), `embed-ssl.wistia.com` (58), `www.googletagmanager.com` (44), `analytics.google.com` (32), `connect.facebook.net` (27), `analytics.ahrefs.com` (26).

Response `server` header samples: `cloudflare` (226), `AmazonS3` (54), `istio-envoy` (41), `Google Tag Manager` (39).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.siegemedia.com/` (text/html; charset=UTF-8)
- ordinal 1019: HTTP 200 `https://www.siegemedia.com/robots.txt` (text/plain; charset=UTF-8)
- ordinal 1022: HTTP 404 `https://www.siegemedia.com/llms.txt` (text/html; charset=UTF-8)
- ordinal 1095: HTTP 404 `https://www.siegemedia.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 1174: HTTP 301 `https://www.siegemedia.com/sitemap.xml` (text/html; charset=UTF-8)
- ordinal 1176: HTTP 200 `https://www.siegemedia.com/sitemap_index.xml` (text/xml; charset=UTF-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

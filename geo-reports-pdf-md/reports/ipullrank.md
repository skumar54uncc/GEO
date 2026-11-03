# iPullRank

Primary site: [ipullrank.com](https://ipullrank.com/). Captured 2026-10-14. Offering: agency for enterprise and mid-market AI search. No public SaaS.

## Three-line summary

iPullRank sells “Relevance Engineering” (how models select information) and “Resonance Design” (content people remember), delivered as GEO programs across strategy, content, technical SEO, and measurement. The homepage states “$5B+ in organic search results” for clients and argues that AI-search case studies are still early. The site is WordPress with Elementor. The homepage does not price the work. A readiness page does: $30K–$150K, $150K–$500K, and $500K+. A procurement page says they partner with Profound and score relevance in their own platform, ExactScience.

## Offering

The page calls the firm a “Pioneering Enterprise and Mid-Market AI Search Agency” and says experts cover AI search, content strategy, and technical SEO ([homepage](https://ipullrank.com/)). Programs include “omnimedia content plans, content and AI audits, keyword portfolios, strategic roadmaps, new metrics,” aimed at pipeline, not only at visibility. An assessment funnel (“AI Search Readiness”) is the top call to action.

## GEO methodology

Two named disciplines:

- Relevance Engineering: “the science behind understanding how AI models identify and select information, then structuring your content for visibility.”
- Resonance Design: content “designed for people.”

They say recommendations are “grounded in experimentation, data analysis, creativity, and innovation.” They also say signals must reach “AI bots” across the whole content ecosystem, “not just your site.” That is an off-site and on-site program: technical access for crawlers plus narrative content.

No engine list, no prompt protocol, and no schema checklist were on the homepage extract. The readiness page publishes investment ranges and a LinkedIn-login quiz ([AI search path](https://ipullrank.com/ai-search)): Emerging $30K–$150K, Growth $150K–$500K, Elite $500K+. Those are ranges, not a rate card.

## How they measure

“New metrics” are promised and not defined on the homepage. The procurement page is more concrete ([procurement](https://ipullrank.com/ai-search-for-procurement)): “We partner with Profound” for what buyers ask across ChatGPT, Perplexity, and Google, and “We built ExactScience, our own platform, to score how relevant your content is.” Measurement is described in three tiers: input (leading indicators of the work), channel (share of voice, citation rate, citation quality, citation sentiment), and performance (traffic and conversions the buyer measures). They tell buyers that one screenshot is an anecdote because “the answers change every time you ask,” and that pay-per-citation is a bad idea “because the underlying measurements vary run to run and the vendor picks the sampling method.”

The tracker’s sample size, the engine list inside ExactScience, and UI versus API are still Profound’s contract where Profound is the named source, and are not restated as iPullRank’s own runner. ExactScience is a relevance scorer they claim to have built. This report did not log into it.

## Matching real users

Not discussed. “Start where you are” is a sales line, not a locale design.

## Metrics

The page says the agency has “delivered $5B+ in organic search results for our clients.” That is a lifetime SEO claim, not an AI-citation claim. Three outcome blocks (“incremental revenue,” “revenue,” “traffic recovery”) lost their numbers in text extraction; the amounts appear to be images. They are not invented here. One block says a major bank paused paid spend because of content engineering, a global eCommerce marketplace got sustained visibility from AI content on category pages, and a car publisher recovered traffic after algorithm updates. No figures are attached in the text.

## SEO overlap

Explicit. Technical SEO is “future-proofing for organic AI Search.” Keyword portfolios sit beside AI audits. The $5B line is organic search. The firm’s point is that AI search does not replace that practice. The homepage also says AI-search case studies “may seem misguided because delivering results effectively is still a work in progress,” which is a warning against fake precision.

## Pipeline and architecture

**Facts.** HAR: `wp-content` (1,025), Elementor (442), `wp-includes`, Wistia, Microsoft Clarity, HubSpot, Google Tag Manager, Facebook, LinkedIn (REA evidence `ev_f3553e838ce18303a94e67cd9efc7ffb6954223c29f32daa380fbf906a678f9a`). A small number of `/_next/` URLs also appeared; they are not enough to call the site a Next.js app given the WordPress evidence. `robots.txt` disallows `/wp-admin/` except `admin-ajax.php`, and allows Twitterbot. `llms.txt` returned 404.

**Inferences.** WordPress and Elementor are the marketing site. HubSpot is forms. Wistia is video. No measurement API was observed. Relevance Engineering, as described, requires someone to inspect model behavior. That can be a lab notebook. It is not shown as software.

## Client claims

$5B+ organic results, their figure. American Express OPEN: a quote from a “Sr. Manager of Digital Strategy and Experiences” praising Mike’s team for integrating recommendations. The quote is about working style, not a metric. Press logos are claimed (“featured in”) without titles in the extract.

## Evals and QA

“Grounded in experimentation” is the QA culture claim. No public experiment log was linked from the homepage extract. The admission that AI-search case studies are early is itself a quality bar: they would rather show the team than a percentage.

## Security

Not discussed.

## Pricing

Not published.

## Strengths

The two-word split (relevance for models, resonance for people) is a useful product requirement: a GEO tool that only scores extractability will ship pages nobody wants to read. The warning on premature case studies is the correct posture. Technical SEO and off-site ecosystem are both in scope. Elementor and WordPress are ordinary and readable.

## Weaknesses

A buyer cannot see engines, sample size, or price. The $5B line will be repeated as an AI result even though the sentence says organic search. `llms.txt` is missing. Homepage numbers hidden in images do not survive text agents, which is ironic for a relevance practice.

## What to copy or beat

Copy relevance versus resonance as two scores, and copy the refusal to publish a case study without a method. Beat the opacity with a public measurement note: engines, prompt count, and what “new metrics” means. Put the $5B denominator (years, clients, whether it is traffic value) next to the number if it is going to stay on the homepage.

## Inferences, separated

WordPress and Elementor are observed. No proprietary platform is inferred. The $5B figure is their claim and is scoped, in their sentence, to organic search.

## Sources

- https://ipullrank.com/
- https://ipullrank.com/ai-search
- https://ipullrank.com/ai-search-for-procurement
- https://ipullrank.com/robots.txt
- HAR and REA JSON: `rea/har/ipullrank.har`, `rea/json/ipullrank.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/ipullrank.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_f3553e838ce18303a94e67cd9efc7ffb6954223c29f32daa380fbf906a678f9a`
- Artifact SHA-256: `88c9c4af54ee0aac8c62e41528c2300e7caaf29852b3dc562d14a057493d73ce`
- Artifact bytes: 16585169
- Records: 1788
- JSON: `rea/json/ipullrank.json`
- HAR: `rea/har/ipullrank.har`

Highest host counts in the capture (request counts, not unique users): `ipullrank.com` (1151), `www.google.com` (59), `www.google-analytics.com` (35), `www.googletagmanager.com` (33), `connect.facebook.net` (31), `fast.wistia.com` (28), `fast.wistia.net` (27), `k.clarity.ms` (25).

Response `server` header samples: `nginx` (890), `cloudflare` (167), `AmazonS3` (32), `istio-envoy` (31).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://ipullrank.com/` (text/html; charset=UTF-8)
- ordinal 1771: HTTP 200 `https://ipullrank.com/robots.txt` (text/plain)
- ordinal 1785: HTTP 404 `https://ipullrank.com/llms.txt` (text/html; charset=UTF-8)
- ordinal 1786: HTTP 404 `https://ipullrank.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 1787: HTTP 200 `https://ipullrank.com/sitemap.xml` (text/xml; charset=utf-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

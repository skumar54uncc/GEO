# Ahrefs Brand Radar

Primary site: [ahrefs.com/brand-radar](https://ahrefs.com/brand-radar). Captured 2026-10-14. Offering: SaaS add-on inside the Ahrefs SEO suite, plus an index that can be queried without a custom prompt project. Included because it is a major SEO index pointed at AI answers, which is a different architecture from a prompt-only startup.

## Three-line summary

Brand Radar runs two products: an AI Visibility Index built from Ahrefs’ keyword database, and Custom Prompts billed in checks. The index is described as 479 million-plus monthly prompts, re-tested monthly on a 90-day window, across AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini, and Copilot. Custom Prompts add Claude, cost checks per platform, location, and update, and are partly included in paid Ahrefs plans. Collection is “real queries,” expanded through People Also Ask and semantic fanout, then run through each AI platform.

## Offering

Tim Soulo, identified on the page as CMO, is quoted: “The AI marketing platform we needed didn’t exist. So we built it.” The product tracks AI answers, YouTube, and Reddit ([Brand Radar](https://ahrefs.com/brand-radar)). Custom Prompts are “free for every paid Ahrefs Lite plan and above,” with a daily quota (Lite 5, Standard 10, Advanced 20). Larger packages are sold on top.

## GEO methodology

This is measurement and source analysis, not a content agent. The page tells the user to find pages AI already sends traffic to, watch crawlers, and use YouTube transcripts and Reddit snippets as the social layer that influences answers. Optimization advice is implied (create more of what is cited) rather than sold as an autonomous writer.

## How they measure

FAQ on the same page:

- Index construction: real queries from the Ahrefs keyword database, expanded “into natural questions via People Also Ask and semantic fanout,” then “479M+ prompts” run through each platform and stored.
- A second index type exists only for AI Overviews and AI Mode: keywords that triggered an AI answer inside Google, as opposed to prompts Ahrefs sent.
- Question sets “are re-tested monthly on a 90-day reporting window.”
- Platforms in the index: AI Overviews, AI Mode, ChatGPT, Perplexity, Gemini, Copilot. Custom Prompts add Claude.
- Custom cadence: daily, weekly, or monthly. “Each prompt uses 1 check per platform, location and update.” “Claude consumes 8 checks per update.”
- Worked example: “5 prompts on 1 platform = 150 checks/mo” under daily checking. That arithmetic matches 5 × 30.
- Metrics defined on the page: Mentions (brand name in answer text), Citations (links to pages or domains), AI Share of Voice (percentage of responses in the topic set that mention or cite the brand versus competitors), Estimated Impressions (visibility weighted by search volume behind the prompt).
- The page prints “479 M+ Total monthly prompts” and engine-level counts. Labels that stayed attached in the extract: AI Mode 271,273,980; Copilot 93,242,323; Gemini 29,063,582; Perplexity 29,011,488. Two further integers, 29,007,267 and 28,371,982, were adjacent in the extract without a surviving label. They are not assigned to ChatGPT or AI Overviews here.
- Pricing extract: a $50 per month package, a $199 per month package, and “$699/MO FOR ALL MODELS.” One card lists 83 prompts/day, +2,500 checks/month, overage $0.020 per check, all platforms including Claude, custom refresh. The $50 card’s inclusions were not cleanly extracted; do not invent them.
- Historical index responses “back to 2025,” “no domain cap,” for the index. Custom Prompt data starts when tracking starts.
- “Used by 3,000+ companies” and a named quote from Laura Lancu, SEO Growth Specialist at Octopus Energy, about replacing manual extraction.

A methodology post, not in the original HAR extract, states the runner ([methodology](https://ahrefs.com/blog/brand-radar-methodology/)): “All prompts run through the free, publicly available web interfaces of ChatGPT, Gemini, Perplexity, Copilot, and other supported platforms.” The same post gives approximate monthly query volume: ChatGPT 14.5 million, Perplexity 14.6 million, Gemini 14.6 million, Copilot 13.3 million, AI Overviews 282 million, AI Mode 24 million, Grok 13 million. Grok is in that volume list and is not in the product-page index engine list above. Estimated impressions “weight mentions by Google search volume,” and the post says they do not claim a validated link between that volume and how often the query is asked inside an AI tool. They “do not filter out hallucinated or malformed links.”

A later fetch of the product page on the same date printed “475M+” and a different set of labeled engine integers (Index Prompts 269,066,840; AI Mode 91,002,465; Copilot 29,198,545; Gemini 29,091,378; Perplexity 29,064,822; one unlabeled 28,522,328). The capture extract above remains the one tied to the HAR. The two extracts disagree. Treat the counters as unstable page chrome, not as a reconciled census.

Not stated: how many stochastic repeats sit inside one stored response, or a margin of error. The methodology post says “web interfaces.” It does not say logged-out, cookieless, or account-backed.

## Matching real users

The index’s claim to realism is that prompts are derived from observed search demand, not invented. That matches what people type into Google more than what they type into ChatGPT. The page says both, and a founder should not collapse them. Search-query indexes for AI Overviews are closer to the Google UI because they track keywords that triggered an overview. Prompt indexes are Ahrefs’ questions, run by Ahrefs. Location is a check dimension, so locale is a billed axis, not a default. Personalization and logged-in state are not discussed. Monthly re-test plus a 90-day window will lag a model update; Custom Prompts exist for buyers who need daily.

YouTube and Reddit coverage is a fidelity choice: those surfaces show up inside answers, and Ahrefs already indexes them.

## Metrics

Mentions, citations, AI share of voice, estimated impressions, plus crawler and AI-referral page analytics. Position is not in the metric definition block quoted above. Sentiment is not in that block.

## SEO overlap

This is the point of the product. Every index prompt “maps back to real search demand” and to topic clusters of keywords. Estimated impressions use search volume. A buyer can see which cited URLs also rank. That is the join Profound and the startups have to approximate with a separate SEO vendor. The limitation is the converse: brands with no search volume are poorly covered by the index, which the FAQ states directly. Custom Prompts are the patch.

## Pipeline and architecture

**Facts.** HAR: 1,169 requests to `ahrefs.com`, CookieYes, `static.ahrefs.com`, `analytics.ahrefs.com`, and also `analytics-staging.ahrefs.dev` (18 requests), Facebook, YouTube, Twitter/X, Cloudflare insights, Sentry (`ingest.us.sentry.io`), and `frontend-eu.s3.eu-central-1.amazonaws.com`. Server header Cloudflare accounted for 925 responses (REA evidence `ev_a16c0c29a1afb072e9160b7f2193369abd44c7b41a6fdef40724263c4da7c532`). Some URLs contain `wp-content` (15), consistent with a WordPress-backed section such as a blog, not proof that Brand Radar’s app is WordPress. `llms.txt` returned 404. `robots.txt` is a long classic-SEO disallow list.

**Inferences.** The marketing site is on Cloudflare, with a European S3 bucket for front-end assets and Sentry for errors. `analytics-staging.ahrefs.dev` on a public page is an observed host. It may be a misrouted tag. It is not, by itself, evidence that customer Brand Radar data is served from staging. The index pipeline implied by the FAQ is: keyword warehouse, question expansion, a runner per AI platform, a stored response warehouse, monthly refresh, and a join back to search volume. Custom Prompts are a smaller scheduler on the same runner, billed in checks, with Claude priced at 8× because it is more expensive to collect. That 8× is their price, not a measured cost.

## Client claims

3,000+ companies, and the Octopus Energy testimonial. No lift percentage was attached to that quote in the extract.

## Evals and QA

Not stated. A monthly re-test is an operational control, not a published precision eval. Mention versus citation is at least defined, which is more than most homepages do.

## Security

Not discussed on the Brand Radar page fetched here. Ahrefs account security is out of scope of this page. Sentry and a staging analytics host on the public page are worth a buyer’s question; they are not a finding of data exposure.

## Pricing

Custom Prompt quotas inside Ahrefs plans, check math, Claude at 8 checks, overage $0.020, and the three package prices extracted above. Index use is described as available without waiting to collect, for customers who can search the index. Contract details beyond the page were not fetched.

## Strengths

Deriving prompts from a real keyword graph is the right prior, and they separate that index from customer-defined prompts. Mentions and citations are not mashed into one number. Location is a billed dimension, which forces the locale question into procurement. YouTube and Reddit are the actual citation ecosystem for many categories. The “brands with no search volume are a bad fit for the index” sentence is unusually honest.

## Weaknesses

Monthly index refresh is slow for a channel that ships model updates weekly. The methodology post now says the runner is the free public web UI, which is the same family of claim as Profound and SE Ranking, without their daily cadence. Sentiment is absent from the definition block. `llms.txt` 404s. A staging analytics hostname on production is an operational smell. The unlabeled prompt counts, and the same-day counter change, should not be briefed as engine totals. Grok’s appearance in the methodology volumes and its absence from the product index list is an unresolved catalog bug.

## What to copy or beat

Copy the two indexes (search-triggered overviews versus prompts you choose) and the mention/citation split joined to search volume. Beat the collection gap: say whether each platform is a logged-out browser, and publish a repeat factor. Beat the 90-day window with a model-version dimension so a GPT cutoff does not look like a brand crisis. Serve `llms.txt`. Remove staging hosts from public pages.

## Inferences, separated

The pipeline sketch is inferred from the FAQ, not from a system diagram. Staging-host caution is deliberate. WordPress is only a partial URL observation.

## Sources

- https://ahrefs.com/brand-radar
- https://ahrefs.com/blog/brand-radar-methodology/
- https://ahrefs.com/robots.txt
- HAR and REA JSON: `rea/har/ahrefs.har`, `rea/json/ahrefs.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/ahrefs.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_a16c0c29a1afb072e9160b7f2193369abd44c7b41a6fdef40724263c4da7c532`
- Artifact SHA-256: `461ced99ad3bcf215f6f4ee81e165d9b7c01de95e301b7d1329a2969a355b300`
- Artifact bytes: 4271117
- Records: 1523
- JSON: `rea/json/ahrefs.json`
- HAR: `rea/har/ahrefs.har`

Highest host counts in the capture (request counts, not unique users): `ahrefs.com` (1169), `cdn-cookieyes.com` (63), `static.ahrefs.com` (45), `www.google.com` (20), `analytics.ahrefs.com` (18), `analytics-staging.ahrefs.dev` (18), `connect.facebook.net` (18), `www.youtube-nocookie.com` (17).

Response `server` header samples: `cloudflare` (925), `snooserv` (18), `sffe` (14), `Google Tag Manager` (10).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://ahrefs.com/` (text/html; charset=UTF-8)
- ordinal 189: HTTP 200 `https://ahrefs.com/brand-radar` (text/html; charset=UTF-8)
- ordinal 401: HTTP 200 `https://ahrefs.com/pricing` (text/html; charset=UTF-8)
- ordinal 1372: HTTP 200 `https://ahrefs.com/pricing?utm_source=homepage` (text/html; charset=UTF-8)
- ordinal 1512: HTTP 200 `https://ahrefs.com/robots.txt` (text/plain; charset=utf8)
- ordinal 1514: HTTP 404 `https://ahrefs.com/llms.txt` (text/html; charset=utf8)
- ordinal 1517: HTTP 404 `https://ahrefs.com/llms-full.txt` (text/html; charset=utf8)
- ordinal 1521: HTTP 200 `https://ahrefs.com/sitemap.xml` (text/xml; charset=UTF-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

# Semrush AI Visibility Toolkit

Primary site: [semrush.com](https://www.semrush.com/). Product pages captured 2026-10-14: the AI Visibility overview and the AI toolkit pricing URL. Offering: SaaS module inside an SEO suite, also bundled as Semrush One. Included because it is one of the two largest classic SEO datasets now selling AI-answer tracking.

## Three-line summary

Semrush’s own `llms.txt` positions the company as a brand-visibility platform and states a proprietary dataset that includes “289M+ prompts” alongside the familiar keyword and backlink counts. The AI Visibility Toolkit’s public Base price is $99 per domain per month, billed annually, for 25 custom prompts tracked daily across ChatGPT, Google AI, Gemini, and Perplexity. The marketing site is a large multi-host property (Builder.io, Amplitude, Clarity, Bing ads) fronted like the rest of Semrush, not a startup stack.

## Offering

`llms.txt` says Semrush helps marketers “audit, optimize, and measure performance across SEO, AI search, content marketing, competitive research, local, social, and paid media,” and describes the dataset as “17 years of continuous web crawling, including 289M+ prompts, 28B+ keywords, 43T+ backlinks, and 800M+ domain profiles” ([llms.txt](https://www.semrush.com/llms.txt)). Semrush One is “a bundle that combines the SEO Toolkit and AI Visibility Toolkit.” The toolkit page is [overview](https://www.semrush.com/ai-seo/overview/). Features named in `llms.txt`: AI Visibility Score, Monthly Audience, mentions, sentiment, share of voice, prompt tracking, competitor benchmarks, citations, and AI-generated brand narratives. A free checker is linked. An AI Visibility Index lives at `ai-visibility-index.semrush.com`.

## GEO methodology

The toolkit is described as tracking and improving visibility, aimed at “small and medium-sized businesses” in `llms.txt`. Enterprise language on the pricing page is a separate Semrush motion (“complex organizations,” multiple brands and regions) and was not a priced AI-only card in the extract. Methodology of prompt selection is not specified on the pricing bullets beyond “prompt research” and 25 custom prompts.

## How they measure

Pricing page ([pricing](https://www.semrush.com/pricing/ai/)):

- Base: “$99/mo per domain, billed annually.”
- “Track 25 custom prompts (daily AI rankings).”
- “1 domain for Brand Performance analysis.”
- “Mentions from ChatGPT, Google AI, Gemini, and Perplexity.”
- Competitor analysis, prompt research, “site audit for AI readiness,” and “daily, weekly, and monthly data updates.”

A comparison grid on the same fetch also shows “Reports per day 300” under an AI Analysis column. That cell sits in a wider Semrush matrix. This report does not treat 300 as the Base prompt quota. The Base quota that is written in prose is 25 custom prompts.

Not stated: UI versus API, repeats per prompt, countries included in Base, sentiment’s label set, or a margin of error. “Daily AI rankings” implies a position-like score. The ranking function is not defined on this page.

## Matching real users

Not stated. Daily updates are the cadence. Locale, personalization, and logged-in state are not discussed on the extracted pricing bullets. A 25-prompt Base set cannot represent a category; it can only watch a shortlist. That is a product limit, not a statistical design.

## Metrics

From `llms.txt`: AI Visibility Score, monthly audience, mentions, sentiment, share of voice, citations, competitor benchmarks. From pricing: daily AI rankings, competitor analysis. The score’s formula is not on these pages.

## SEO overlap

This is the suite’s advantage and its bias. The same account holds keywords, backlinks, and a site audit. `llms.txt` presents the prompt corpus as part of the crawl dataset, which would make trend analysis a join rather than a new warehouse. The join key is not published on the pages fetched here. Site audit “for AI readiness” is the technical-SEO overlap.

## Pipeline and architecture

**Facts.** HAR of the public marketing property: `www.semrush.com` and `static.semrush.com`, Builder.io CDN, Google Tag Manager, Bing bat, Microsoft Clarity, Amplitude, Facebook, LinkedIn, OpenAI beacons, and some `/_next/` URLs (REA evidence `ev_1c936974286967b9b46b462a68717f78f028bb35364c5ca60112683592af9cbe`). `llms.txt` returned 200 and is a long product index. `robots.txt` is a large classic file with explicit rules for Semrush’s own bots (SiteAuditBot, Semrushbot-SI) and many disallows; it is not an AI-crawler allowlist in the style of Rankscale. Several request URLs contained characters that are illegal in HAR 1.2 URIs (brackets, pipes); they were percent-encoded before REA validation. The original illegal forms are not retained.

**Inferences.** Builder.io is a CMS or visual editor on at least part of the marketing site. Amplitude and Clarity are product analytics on that site. `/_next/` indicates some Next.js surface. None of that is the prompt runner. A 289M prompt figure, if it is a crawl-derived corpus, is an index product closer to Ahrefs Brand Radar than to a 25-prompt scheduler. The Base plan is the scheduler. The corpus is the index. Semrush’s `llms.txt` names both and does not say the customer can query all 289 million.

## Client claims

The pricing page quotes Idan Segal, Organic Growth Lead at Wix, about Semrush generally, not about AI visibility. No AI-specific lift number was extracted.

## Evals and QA

Not stated on the fetched toolkit or pricing pages. The free checker is a lead-in, not a published eval.

## Security

Not discussed on the AI pricing extract. Semrush enterprise security is a different page and was not fetched. Do not assume SOC 2 from the suite’s age.

## Pricing

Base $99 per domain per month, billed annually, 25 daily custom prompts, four engine families as named above. Other Semrush bundles (Semrush One) exist; their AI-specific price was not isolated in the extract beyond the toolkit page.

## Strengths

Distribution: the buyer already has the SEO warehouse, so share of voice in AI can sit next to share of voice in Google without an integration project. `llms.txt` is real and unusually quantitative about the corpus. $99 and 25 prompts is a legible on-ramp. Sentiment and share of voice are named, not implied.

## Weaknesses

Twenty-five prompts is a demo of the category, not a measurement of it. Collection method and variance are unpublished, which matters more when the brand is “data company.” The pricing page mixes suite matrices with the AI card, so a buyer can misread 300 reports as 300 prompts. Robots policy is about Semrushbot, not about whether GPTBot may train on Semrush. That is a missed `llms.txt` companion.

## What to copy or beat

Copy the corpus-plus-scheduler split, and copy putting the corpus size in `llms.txt` where a buyer can see it. Beat the 25-prompt ceiling with a power note in the product: at this n, topic cuts are noise. Publish UI versus API. Expose the join from prompt to keyword in the API, which is the thing a founder cannot rebuild from a startup’s HAR.

## Inferences, separated

Builder.io, Amplitude, and Next.js are marketing-site observations. The index-versus-scheduler reading is an inference from `llms.txt` plus the 25-prompt price. The 289M figure is Semrush’s claim.

## Sources

- https://www.semrush.com/llms.txt
- https://www.semrush.com/ai-seo/overview/
- https://www.semrush.com/pricing/ai/
- https://www.semrush.com/robots.txt
- HAR and REA JSON: `rea/har/semrush.har`, `rea/json/semrush.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/semrush.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_1c936974286967b9b46b462a68717f78f028bb35364c5ca60112683592af9cbe`
- Artifact SHA-256: `aa42f83554d9e6f523c3fc572ac7ead68ce676227435057689d76de2b2463777`
- Artifact bytes: 11412563
- Records: 1936
- JSON: `rea/json/semrush.json`
- HAR: `rea/har/semrush.har`

Highest host counts in the capture (request counts, not unique users): `www.semrush.com` (448), `static.semrush.com` (346), `cdn.builder.io` (110), `analytics.tiktok.com` (92), `bat.bing.com` (68), `www.googletagmanager.com` (65), `www.google.com` (52), `enterprise.semrush.com` (50).

Response `server` header samples: `nginx` (486), `static.semrush.com` (292), `cloudflare` (75), `AmazonS3` (72).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.semrush.com/` (text/html; charset=utf-8)
- ordinal 681: HTTP 302 `https://www.semrush.com/pricing/` (text/html; charset=utf-8)
- ordinal 964: HTTP 200 `https://enterprise.semrush.com/` (text/html; charset=utf-8)
- ordinal 1077: HTTP 200 `https://enterprise.semrush.com/?_rsc=p37cr` (text/x-component)
- ordinal 1800: HTTP 200 `https://www.semrush.com/robots.txt` (text/plain)
- ordinal 1809: HTTP 200 `https://www.semrush.com/llms.txt` (text/plain)
- ordinal 1810: HTTP 404 `https://www.semrush.com/llms-full.txt` (text/html; charset=utf-8)
- ordinal 1922: HTTP 200 `https://www.semrush.com/sitemap.xml` (text/xml)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

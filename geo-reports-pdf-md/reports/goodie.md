# Goodie AI

Primary site: [higoodie.com](https://higoodie.com/). The apex `goodie.ai` resolved to a domain-for-sale page on 2026-10-14 and is not the product. Offering: SaaS, “full-stack AEO,” sold to brands and agencies. Included as a major self-serve platform that prices the action layer, not only the dashboard.

## Three-line summary

Goodie publishes a closed loop of prompt research, daily monitoring, optimization agents, and revenue attribution, and it prices that loop above tracker-only tools on purpose. Core is $295 per month for five models and 110 prompts in two countries; Pro is $999 for eight models and 250 prompts; Enterprise goes to 13 models and states SOC 2. The marketing site is WordPress with WP Rocket, and the captured HAR under-represents tags because scripts are delayed until interaction.

## Offering

`llms.txt` describes Goodie as an AI search visibility and answer-engine optimization platform: real-time tracking, competitor analysis, and content recommendations ([llms.txt](https://higoodie.com/llms.txt)). Feature pages listed there cover monitoring, prompt research, optimization actions, an AEO writer, analytics and attribution, crawler monitoring, an agentic commerce suite, and an MCP tool. Tracked surfaces named across that file include ChatGPT, Gemini, Perplexity, Claude, AI Overviews, AI Mode, Grok, Copilot, Meta AI, DeepSeek, Amazon Rufus, and Adobe’s Sparky.

## GEO methodology

The pricing FAQ states the loop: research gaps, take action (content, technical, social, earned), and measure revenue “including the zero-click traffic Google Analytics can’t see” ([pricing](https://higoodie.com/pricing/)). Agents named on the same page: AEO content writer, content optimization, outreach, a technical agent for `llms.txt` and sitemap repair, and a social agent. Brand Command checks claims against “pillars and facts you set,” with metrics labeled inaccuracy rate, narrative coverage, adverse citation share, and recommendation rate.

## How they measure

FAQ: “Goodie measures it daily through scaled, intentional prompting,” tracking “citation frequency, ranking position, sentiment, and share of voice relative to competitors.”

Plan facts from the same page:

- Core: $295 per month, 5 models (ChatGPT, AI Overview, Perplexity, AI Mode, Copilot), 110 prompts, 2 countries, 2 languages, daily, 1 brand, 50 actions per month, 40M agent tokens, 30 prompt-research prompts, MCP, unlimited seats, email support, 30-minute onboarding.
- Pro: $999 per month, 8 models (adds Gemini, Alexa, Sparky in the extracted list), 250 prompts, 5 countries, 5 languages, 100 actions, 100M tokens, 80 research prompts, SKU-level commerce visibility.
- Enterprise: custom, up to 13 models (adds Claude, Meta, DeepSeek, Grok in the extracted list), 500+ prompts, 8+ countries and languages, SOC 2, API, SSO/SAML language in the FAQ, dedicated strategist.
- Agency Growth: $275 per month, 10 pitch workspaces, 30 prompts, 3 models, 7-day workspace. Client workspaces “starting at $399 per month.”
- The page argues against “a $99 plan” and says cheaper tools “just give you dashboards.”

Not stated: repeats per prompt, UI versus API, or a standard error. “Scaled, intentional prompting” is not a sample design.

## Matching real users

Country and language quotas are the fidelity control, and they are small on Core (two and two). Daily collection is stated. Persona-level sampling is not on the extracted price card. Commerce engines (Rufus, Alexa, Sparky) are a different user surface from chat; mixing them into one visibility score would be a methodology error. The page lists them as additional models rather than as a separate index. Whether the score is pooled was not stated.

## Metrics

Citation frequency, position, sentiment, share of voice, inaccuracy rate, narrative coverage, adverse citation share, recommendation rate, and revenue attribution. Historical trend analysis is listed on Pro and Enterprise in the extract. Crawler analytics integrate GA4, Search Console, and Bing, and on the higher column also Vercel, WordPress, Cloudflare, and CloudFront.

## SEO overlap

The technical agent repairs `llms.txt` and sitemaps. Crawler logs are the SEO join. Prompt research is their keyword-research analogue, quota-capped (30 or 80 per month). They do not claim a classic rank or backlink index on these pages.

## Pipeline and architecture

**Facts.** Captured pages are WordPress. The HTML generator meta was WP Rocket 3.23.3.3. HAR entries for this capture are 375, all on `higoodie.com`, because WP Rocket delayed third-party scripts until a user event that the capture did not perform (REA evidence `ev_cd7fdab0460a0db8dd1f9c7da0508a5b41d0f7ab126199e0768e641f1eabc1c4`). `llms.txt` and `robots.txt` returned 200. JSON-LD types observed in retained HTML included Organization, WebSite, and WebPage. A subprocessors page is linked from `llms.txt`.

**Inferences.** WordPress is the marketing CMS. The absence of analytics hosts in the HAR is a capture limitation, not evidence that Goodie runs no analytics. Revenue attribution implies a first-party snippet or log import plus a model that assigns AI referrers; the snippet was not inspected. Agent tokens are a second meter beside prompts, analogous to Profound’s agent credits.

## Client claims

`llms.txt` says leading brands in finance, retail, and SaaS use Goodie. The pricing page says “Trusted by leading brands” without names in the text extract. No numeric case study was extracted from a case-study URL in this pass. The Gemini feature blurb in `llms.txt` says Gemini reaches “400+ million monthly users.” That is their sentence, not a measurement of Goodie’s customers.

## Evals and QA

Brand Command is a claim-checking product: customer-supplied facts versus model claims. No agreement rate or audit sample size was on the pricing page. Agent token accounting is not an eval of answer quality.

## Security

Enterprise FAQ: “SSO/SAML, SOC 2.” Privacy policy, service agreement, and subprocessors are linked from `llms.txt`. Core support is email only.

## Pricing

See the plan bullets above. Unlimited seats on the brand plans. Pitch workspaces are a sales motion, not a measurement tier.

## Strengths

They price countries, languages, and actions as first-class quotas, which is how a serious program actually scales. Brand Command’s four rates (inaccuracy, narrative coverage, adverse citations, recommendation) are more decision-shaped than a single visibility index. Commerce engines are at least named separately from chat. `llms.txt` is real, and their technical agent claims to repair the customer’s copy.

## Weaknesses

Core’s two-country cap will be the wrong default for any global brand that buys self-serve. Pooling Rufus and ChatGPT into “models tracked” invites a meaningless average. The WordPress marketing site delayed its own tags so thoroughly that a passive capture cannot see the analytics stack. Variance is unpublished. The anti-$99 copy is positioning, not a methods critique.

## What to copy or beat

Copy separate quotas for prompts, countries, actions, and agent tokens. Copy claim-level brand QA. Beat the score by refusing to average shopping assistants with chat models, and by publishing repeats and a standard error per cell. Ship the subprocessors list as a machine-readable file next to `llms.txt`.

## Inferences, separated

WordPress and WP Rocket are observed. “No third-party analytics” would be a false inference from this HAR. Pooling risk across commerce and chat is an inference about how a buyer might misuse the model list.

## Sources

- https://higoodie.com/llms.txt
- https://higoodie.com/pricing/
- https://higoodie.com/robots.txt
- HAR and REA JSON: `rea/har/goodie.har`, `rea/json/goodie.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/goodie.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_cd7fdab0460a0db8dd1f9c7da0508a5b41d0f7ab126199e0768e641f1eabc1c4`
- Artifact SHA-256: `e5988b5075a2c5d0b810e4dd1559f90a0258fc87717303b2f3503cd977ebaec5`
- Artifact bytes: 827352
- Records: 375
- JSON: `rea/json/goodie.json`
- HAR: `rea/har/goodie.har`

Highest host counts in the capture (request counts, not unique users): `higoodie.com` (375).

Response `server` header samples: `cloudflare` (62).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://higoodie.com/` (text/html; charset=UTF-8)
- ordinal 71: HTTP 301 `https://higoodie.com/pricing` (text/html; charset=UTF-8)
- ordinal 72: HTTP 200 `https://higoodie.com/pricing/` (text/html; charset=UTF-8)
- ordinal 369: HTTP 200 `https://higoodie.com/robots.txt` (text/plain; charset=utf-8)
- ordinal 370: HTTP 200 `https://higoodie.com/llms.txt` (text/plain)
- ordinal 371: HTTP 404 `https://higoodie.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 372: HTTP 301 `https://higoodie.com/sitemap.xml` (text/html; charset=UTF-8)
- ordinal 373: HTTP 200 `https://higoodie.com/sitemap_index.xml` (text/xml; charset=UTF-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

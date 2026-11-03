# Evertune

Primary site: [evertune.ai](https://www.evertune.ai/). Captured 2026-10-14. Offering: SaaS marketing platform that combines GEO measurement with content, partnerships, and advertising. Pricing is public for a Pro tier and custom above it.

## Three-line summary

Evertune is the only vendor in this set that publishes a sampling argument with margins of error: 100 repeats per prompt, and a warning that one pass over many prompts does not stabilize topic scores. Prompts are claimed to come from EverPanel, “more than 150 million real AI conversations.” Pro is listed at $800 per month for 100,000 prompts across 11 models, plus content and ad products. The advertising stack shows up in the HAR as The Trade Desk.

## Offering

`llms.txt` describes Evertune as “the marketing platform for brand discovery in AI search,” covering earned mentions and paid retargeting ([llms.txt](https://www.evertune.ai/llms.txt)). Named engines there: ChatGPT, Gemini, Claude, Perplexity, Google AI Overviews, AI Mode, Copilot, DeepSeek, and Meta AI. Product modules include Explore, Measure, Act, Advertise, Prompt Volumes, AI Brand Index, Word Association, Shopping Intelligence, Content Studio, Site Audit, Partner Connect, and Ads Manager.

## GEO methodology

The methodology page separates two generative processes ([methodology](https://www.evertune.ai/platform/methodology)):

- What the model already knows, isolated “through direct API access,” called foundational knowledge.
- What the live consumer app retrieves at question time.

The prescribed diagnosis: strong in weights and weak in the consumer app is an SEO and content gap; weak in both is a brand-building gap. Act then means content, partnerships (impact.com, PartnerStack, The Trade Desk, Index Exchange), and ads ([llms.txt](https://www.evertune.ai/llms.txt)).

## How they measure

The methodology page is specific:

- A worked example uses running-shoe prompts and an Adidas mention indicator.
- “100 unique prompts each asked once” is given as 29% visibility, “±9 pts overall margin of error,” and “±31 pts topic-level margin of error.”
- “100 unique prompts each asked 100 times” is given as the same 29% visibility, “±1 pt” overall and “±2 pts” at topic level.
- A single prompt (“best cushioned shoes for marathons”) asked once is described as a misleading 100% if Adidas appears; asked 100 times, “about 48%, with a margin of error of ±10 points.” The page also shows a 25-draw intermediate of 36% with ±20 points.
- One block says 31% overall and another says 29% for the same one-sample story. Both figures are on the page; this report does not reconcile them.
- “Every prompt Evertune measures comes from EverPanel, our panel of over 150 million real conversations.”
- “Over 80% of AI questions are phrased uniquely,” so prompts are grouped by intent and topic.

Not stated: the sampling distribution assumed for those margins (the ± figures are consistent with a binomial standard error, but the page does not say so), the locale of the Adidas example, or whether the 100 draws are independent browser sessions.

## Matching real users

This is the strongest public fidelity argument in the set, and it has two parts. EverPanel is supposed to stop cherry-picked prompts. The API-versus-consumer-app split is supposed to stop a vendor from reporting the developer API as if it were ChatGPT’s UI. The page argues that broad unique-prompt coverage does not fix a thin topic cell: 10 prompts asked once leave a ±31 point topic error in their example. That is the right critique of “we track 10,000 prompts” dashboards.

What is not shown: a methods appendix, a seed, or a comparison to a held-out human panel in a named country.

## Metrics

AI Brand Index is positioned as recommendation rate versus competitors. Word Association is sentiment-weighted attributes. Shopping Intelligence covers whether ChatGPT triggers shopping results and which retailers get the link. Content Analytics is source share. Prompt Volumes is demand over time ([llms.txt](https://www.evertune.ai/llms.txt)). Share of voice is implicit in the brand-versus-competitor index; the methodology page’s worked metric is mention rate.

## SEO overlap

The API-versus-app gap is explicitly mapped onto SEO: a retrieval miss with intact parametric knowledge is called an SEO and content gap. Site Audit targets crawler access. There is no public claim, on the fetched pages, of a classic rank tracker inside the same score.

## Pipeline and architecture

**Facts.** HAR hosts include `cdn.prod.website-files.com` (Webflow), Google Tag Manager, The Trade Desk (`adsrvr.org`, `match.adsrvr.org`), Heap, HubSpot, Facebook, and `bzrcdn.openai.com` (REA evidence `ev_0c2dd0fc488a975174f9e4c640acfee2fb5b227c35cdd17304ea30dd8baf7b16`). `llms.txt` names The Trade Desk and Index Exchange as ad routes. Pricing lists 11 models and 100,000 tracked prompts on Pro ([pricing](https://www.evertune.ai/pricing)).

**Inferences.** Webflow is the marketing site. Trade Desk pixels are consistent with the ads product, not proof that measurement traffic flows through a DSP. If Pro’s 100,000 prompts were each drawn 100 times across 11 models, the response count would be 110 million per cycle. The pricing page does not say the 100-fold sample applies to every one of those prompts. Treat 100-fold sampling as the methodology claim and 100,000 as the plan quota; do not multiply them unless Evertune does.

## Client claims

`llms.txt` points at customer stories. This report does not quote a numeric case study because none was extracted from a story page in the fetch set. The Adidas figures are a teaching example on the methodology page.

## Evals and QA

The margin-of-error example is a public eval of the estimator, using one category. It is not a pre-registered benchmark across categories. No human-agreement rate was on the methodology page.

## Security

`robots.txt` disallows `/legal/` and `/404` and allows the rest ([robots.txt](https://www.evertune.ai/robots.txt)). Enterprise lists SSO ([pricing](https://www.evertune.ai/pricing)). SOC 2 was not stated on the fetched pricing or methodology pages.

## Pricing

Pro: $800 per month. Includes 100,000 prompts across 11 AI models; daily, weekly, or monthly frequency; global language and country tracking; 25 AI-optimized articles per month; 3 onboarding sessions; affiliate partnerships; AI retargeting. Enterprise: custom, adds a success manager, unlimited content generation, website optimization, bot analytics, and SSO ([pricing](https://www.evertune.ai/pricing)).

## Strengths

They published the statistical objection to one-shot prompt panels, with numbers a founder can check. The API-versus-consumer split is the correct measurement architecture. Advertising and content are attached to the same prompt graph, which is where GEO budgets will actually move.

## Weaknesses

The teaching example disagrees with itself (29% versus 31%) on one page, which is a bad sign in a methodology. The Pro quota and the 100-fold design are not tied together, so a buyer cannot compute observations per dollar. SSO is Enterprise-only. The marketing site loads a large ad-tech graph, which is on-brand and also a privacy-review item for their own customers.

## What to copy or beat

Copy the two-layer measurement (parametric knowledge via API, consumer answer via the product UI) and the topic-level power calculation. Beat the example by publishing the formula, the seed policy, and a confusion matrix against human coders. Publish observations per credit so 100,000 prompts cannot be read as 100,000 independent answers or as 110 million.

## Inferences, separated

The Webflow and Trade Desk conclusions are HAR facts about the marketing site plus a product claim in `llms.txt`. The 110 million figure is arithmetic this report refuses to treat as their architecture. EverPanel’s 150 million conversations is their claim, not a dataset this project inspected.

## Sources

- https://www.evertune.ai/llms.txt
- https://www.evertune.ai/platform/methodology
- https://www.evertune.ai/pricing
- https://www.evertune.ai/robots.txt
- HAR and REA JSON: `rea/har/evertune.har`, `rea/json/evertune.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/evertune.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_0c2dd0fc488a975174f9e4c640acfee2fb5b227c35cdd17304ea30dd8baf7b16`
- Artifact SHA-256: `3ff16183ae79aba97c261a0ec25b623352f8c92b512aa7bea329852e507d759f`
- Artifact bytes: 8952785
- Records: 1174
- JSON: `rea/json/evertune.json`
- HAR: `rea/har/evertune.har`

Highest host counts in the capture (request counts, not unique users): `cdn.prod.website-files.com` (194), `www.evertune.ai` (156), `fonts.gstatic.com` (128), `www.googletagmanager.com` (50), `www.google.com` (48), `connect.facebook.net` (36), `analytics.twitter.com` (32), `cdn.us.heap-api.com` (24).

Response `server` header samples: `cloudflare` (399), `AmazonS3` (59), `Google Tag Manager` (49), `Kestrel` (37).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.evertune.ai/` (text/html; charset=utf-8)
- ordinal 110: HTTP 200 `https://www.evertune.ai/pricing` (text/html; charset=utf-8)
- ordinal 207: HTTP 200 `https://www.evertune.ai/` (text/html; charset=utf-8)
- ordinal 1083: HTTP 200 `https://www.evertune.ai/robots.txt` (text/plain; charset=utf-8)
- ordinal 1086: HTTP 200 `https://www.evertune.ai/llms.txt` (text/plain; charset=utf-8)
- ordinal 1087: HTTP 404 `https://www.evertune.ai/llms-full.txt` (text/html; charset=utf-8)
- ordinal 1171: HTTP 200 `https://www.evertune.ai/sitemap.xml` (application/rss+xml; charset=utf-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

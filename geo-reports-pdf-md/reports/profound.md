# Profound

Primary site: [tryprofound.com](https://www.tryprofound.com/). Captured 2026-10-14, unauthenticated. Offering: SaaS, with an enterprise motion. Not an agency.

## Three-line summary

Profound sells an “AI Marketer” on top of answer-engine measurement: daily browser captures of consumer AI products, a real-prompt dataset, and credit-metered agents that draft content. The public measurement contract is unusually explicit: front-end experiences rather than API outputs, daily repeats because answers vary, and up to nine engines on enterprise. Trial is a 7-day, 50-prompt sample across three engines; ongoing price is custom.

## Offering

The homepage describes an AI marketing platform for ChatGPT, Perplexity, Claude, Gemini, Microsoft Copilot, DeepSeek, Google AI Overviews, and “AI search platforms,” with an agent that researches, drafts, and stages work for approval ([homepage](https://www.tryprofound.com/)). The same page says workspace figures are illustrative (“Other workspace controls are illustrative”), so named users, hours saved, and agent-run totals on that page are product chrome, not audited customer results.

Pricing splits a free Trial from custom Enterprise ([pricing](https://www.tryprofound.com/pricing)). A self-serve “Agency Growth” plan is mentioned only as a credit bundle (400 credits per month per client workspace), not as a full public price card.

## GEO methodology

Published work is a loop, not a content recipe: find prompts where competitors are cited and you are not, use Agents to create or revise pages, then remeasure ([Answer Engine Insights](https://www.tryprofound.com/features/answer-engine-insights)). Agents are described as rewriting pages with citation decay and staging drafts in a CMS, and as writing sponsored-answer creative for high-volume prompts where the brand does not appear organically ([homepage](https://www.tryprofound.com/)).

Prompt construction has three public inputs: auto-generation from brand and topic configuration, manual upload, and Prompt Volumes, “Profound's dataset of real prompts submitted to AI platforms by actual users” ([Answer Engine Insights FAQ](https://www.tryprofound.com/features/answer-engine-insights)). Trial users get a recommended set and cannot customize; Enterprise can edit, disable, or add prompts ([pricing FAQ](https://www.tryprofound.com/pricing)).

## How they measure AI visibility

Facts from the Answer Engine Insights FAQ:

- Models queried are the front ends “normal users see”: ChatGPT, Perplexity, Claude, Microsoft Copilot, Google AI Overviews, Google AI Mode, Google Gemini, Grok, and DeepSeek.
- “We focus on front-end user experiences rather than API calls.”
- “Other tools pull AI responses from the API. We capture directly from the browser.”
- “AI platforms don't return the same answer twice. We run every tracked prompt daily.”
- They state they monitor RAG-based responses from ChatGPT, Perplexity, Microsoft Copilot, and Google AI Overviews.
- Regions: “30+ languages and 150+ regions.”

Trial limits, from the pricing page: 50 unique prompts, daily for 7 days, engines ChatGPT, Gemini, and Google AI Overviews, one language. Enterprise: “tailored prompt tracking plan,” “up to 9 Answer Engines,” ongoing daily tracking.

Not stated on the fetched pages: the number of repeats per prompt per day, the variance estimator, temperature or personalization controls, or whether browser profiles are logged-out, cookieless, or account-backed. Daily runs are asserted as the way to approximate a “true average,” without a published margin of error.

## Matching what real users see

The browser-not-API claim is the fidelity argument. It is a design claim, not a published eval against a panel of human sessions. Multi-region and multi-language support is stated. Persona support is stated as a slice of the data (“audience personas”) on the same FAQ, without a definition of how a persona is bound to a browser profile.

## Metrics

The product page names visibility score, share of voice, sentiment and keyword themes, citation sources and authority, competitor rankings, and a FactCheck view of inaccurate claims against a “ground truth” ([Answer Engine Insights](https://www.tryprofound.com/features/answer-engine-insights)). The FactCheck example on that page (a Rho fee claim) is a worked example, not a study result. The repeated “1577 Mentions” figure is the same number tiled across the page and is treated here as interface chrome.

Exports: CSV on Enterprise; API listed as custom ([pricing](https://www.tryprofound.com/pricing)). Agent Analytics is described as tracking AI-sourced traffic via integrations that include Akamai, AWS, Cloudflare, Fastly, Google Analytics, Google Cloud, Netlify, Vercel, and WordPress.

## SEO overlap and trends

Prompt Volumes is the bridge from classic keyword research to prompt demand, but the fetched pages do not publish a join key to Google query volume. Citation authority is the SEO-shaped metric: which domains influence answers. Trend language is “how your presence shifts across time, regions, topics, and audience personas.” No public time-series methodology (smoothing, seasonality, model-version change points) was on the fetched pages.

## Likely pipeline and architecture

**Facts.** Marketing pages request `/_next/` assets, `f6oskg04.api.sanity.io`, and `static.tryprofound.com` (REA evidence `ev_c154a944a1ec2ff656301957551bd2e38e573ee4d8b5c62bbd7e2390859bffb5`). Pricing names CDN and analytics integrations for agent traffic. `robots.txt` allows `/` and `/llms.txt` and publishes a sitemap; `/llms.txt` returned 404 on 2026-10-14 ([robots.txt](https://www.tryprofound.com/robots.txt)).

**Inferences.** The marketing site is a Next.js app on Cloudflare with Sanity as the content API. That does not describe the measurement workers. The browser-capture claim implies a fleet of logged-out (or lightly profiled) browser sessions, a prompt scheduler, and a parser for mentions, citations, and sentiment. Credit accounting is a separate meter for agent runs, not for prompt runs. None of that worker topology is visible in the public HAR.

## Client claims

The pricing page quotes Skye Scofield, Marketing Lead at Statsig: “We chose Profound because it seemed like the deepest and most complete tool in the market.” No numeric case study was extracted from the pages fetched for this report. Homepage leaderboard numbers are labeled illustrative by the page itself.

## Evals, testing, and QA

Not stated: golden sets, human agreement rates, inter-run variance, or a public model-change regression suite. The daily-average claim is the only published control for stochastic answers. FactCheck implies a customer-supplied ground truth, which is a QA loop for brand facts, not for the measurement system.

## Security and compliance

Pricing and the insights page state SOC 2 Type II, SSO via SAML or OIDC, role-based access control, and daily backups retained for one week ([pricing](https://www.tryprofound.com/pricing), [insights](https://www.tryprofound.com/features/answer-engine-insights)). The homepage also says “RBAC, SCIM, SOC 2.” A public penetration-test letter or subprocessors list was not in the fetched set.

## Pricing

| Plan | Public price | Measurement scope | Source |
| --- | --- | --- | --- |
| Trial | Free | 50 prompts, daily, 7 days; ChatGPT, Gemini, AI Overviews; prompts not customizable | [pricing](https://www.tryprofound.com/pricing) |
| Agency Growth | Credit bundle only | 400 agent credits / month / client workspace | same |
| Enterprise | Custom | Tailored prompts, up to 9 engines, daily, SSO/SAML, SOC 2 | same |

Agent runs consume credits by complexity. Overage can be configured to bill or to pause. Seats are unlimited on Trial and Enterprise.

## Strengths

The fidelity story is the one a measurement platform has to win: consumer UI, not the API, plus an explicit admission that one sample is not the answer. Prompt Volumes, if the dataset is real, is the right prior for which prompts to track. Agents close the loop into a CMS instead of stopping at a dashboard. Security controls match an enterprise procurement checklist.

## Weaknesses

Trial cannot test prompt customization or the long tail of engines, so a buyer cannot verify the nine-engine claim before a sales cycle. Repeat count and variance are not published, so “daily average” is not yet a confidence interval. `llms.txt` is allowed in robots and missing. Illustrative UI numbers on the homepage will be quoted by others as if they were metrics; the page warns, but the warning is easy to miss.

## What to copy or beat

Copy the browser-versus-API distinction and the three prompt sources (generated, uploaded, observed). Beat them by publishing the repeat count, the estimator, and a holdout against human sessions in the same locale. Beat the trial by letting a prospect edit prompts. Ship `llms.txt` that matches robots, since Profound tells customers to care about crawler access and then 404s its own file.

## Inferences, separated

The Next.js and Sanity conclusion is from asset URLs in the HAR, not from a Profound engineering post. The worker fleet is inferred from the browser-capture claim. No customer count, revenue, or funding figure is used here because none was taken from a page fetched for this report.

## Sources

- https://www.tryprofound.com/
- https://www.tryprofound.com/pricing
- https://www.tryprofound.com/features/answer-engine-insights
- https://www.tryprofound.com/robots.txt
- HAR and REA JSON: `rea/har/profound.har`, `rea/json/profound.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/profound.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_c154a944a1ec2ff656301957551bd2e38e573ee4d8b5c62bbd7e2390859bffb5`
- Artifact SHA-256: `3d3a7aff5f250cd05b990785ffd7cf0ff0573eb4bd11572c62c4556d5c50cb94`
- Artifact bytes: 8516654
- Records: 1380
- JSON: `rea/json/profound.json`
- HAR: `rea/har/profound.har`

Highest host counts in the capture (request counts, not unique users): `www.tryprofound.com` (1339), `f6oskg04.api.sanity.io` (17), `static.tryprofound.com` (12), `platform.tryprofound.com` (12).

Response `server` header samples: `cloudflare` (1218).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.tryprofound.com/` (text/html; charset=utf-8)
- ordinal 86: HTTP 200 `https://www.tryprofound.com/pricing?_rsc=5CB68i4pnAekjehf` (text/x-component)
- ordinal 93: HTTP 200 `https://www.tryprofound.com/?_rsc=yIp22O3xgPPxC28X` (text/x-component)
- ordinal 94: HTTP 200 `https://www.tryprofound.com/?_rsc=-ifekjItyoC3r9jU` (text/x-component)
- ordinal 96: HTTP 200 `https://www.tryprofound.com/?_rsc=OGDjzseiA9yVrYCb` (text/x-component)
- ordinal 99: HTTP 200 `https://www.tryprofound.com/pricing?_rsc=RUAe2X0j7vp0IAZ6` (text/x-component)
- ordinal 117: HTTP 200 `https://www.tryprofound.com/pricing` (text/html; charset=utf-8)
- ordinal 162: HTTP 200 `https://www.tryprofound.com/?_rsc=bME4Q4px3YJ1rAzL` (text/x-component)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

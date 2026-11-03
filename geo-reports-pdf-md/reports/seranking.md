# SE Ranking AI Search Toolkit

Primary site: [seranking.com](https://seranking.com/). Product page captured conceptually via fetch: [AI Visibility Tracker](https://seranking.com/ai-visibility-tracker.html). Offering: SaaS add-on on an SEO suite. Included because it is the same product class as Semrush’s toolkit and Ahrefs Brand Radar, and because it makes a collection-method claim the larger suites do not: direct UI monitoring rather than sampled model outputs.

## Three-line summary

SE Ranking’s AI Search Toolkit tracks mentions and links across AI Overviews, AI Mode, ChatGPT, Gemini, and Perplexity, and states that it “retrieves results through direct UI-based monitoring” so the data “reflects live AI behavior rather than sampled outputs.” The page also covers seven markets and five languages, and exposes the data through API and MCP. The marketing site is WordPress behind Cloudflare, with Cookiebot, HubSpot, and Bing tags. The AI Search add-on on the pricing page is public: 200 prompts at $89 per month ($71.20 on the annual figure), 450 at $179 ($143.20), and 1,000 at $345 ($276). SE Visible, a standalone product included with that add-on, publishes the visibility equation.

## Offering

The tracker page describes an AI Visibility Tracker for agencies and in-house SEO teams, with three modules: AI Competitor Research, AI Results Tracker, and AI Source and Coverage Analysis ([tracker](https://seranking.com/ai-visibility-tracker.html)). It is sold as part of the SEO platform, with exports to Data Studio, AgencyAnalytics, Whatagraph, Make, n8n, Zapier, and MCP access from Claude or Gemini.

## GEO methodology

The page’s advice is measurement plus the usual actions: see which sources are cited, create content those sources resemble, or partner with domains the models already mention. It says there is no universal “good” visibility score and that the comparison that matters is against competitors on the same prompts. That is a more careful sentence than most homepages.

## How they measure

Direct statements on the tracker page:

- “SE Ranking’s AI Search Toolkit retrieves results through direct UI-based monitoring. It sends queries to AI platforms and captures the responses as a real user would see them. This means the data reflects live AI behavior rather than sampled outputs.”
- Engines named: ChatGPT, Perplexity, Gemini, AI Mode, and AI Overviews. A FAQ list also includes those. Claude appears in a later paragraph about “AI engines like ChatGPT, Gemini, and Claude” as user destinations, not clearly as a tracked engine in the toolkit list. This report does not add Claude to the tracked set.
- Metrics: brand mentions with and without links, links in the cited-sources section, “average ranking within generated responses,” citation dynamics, and “traffic driven by AIOs.”
- Competitor slots: “up to five competitors.”
- “7 supported markets” and “five languages.”
- Cached copies of AI answers.
- Historical data.
- The FAQ says ROI is still hard and suggests correlating mentions with branded search. That is a warning, not a model.

The tracker page does not state a price or a repeat count. The pricing page does state prompt packages ([pricing](https://seranking.com/pricing.html), which redirected to `subscription.html` in this fetch): the AI Search add-on card’s package data is 200 prompts at $89.00 monthly and $71.20 annual, 450 prompts at $179.00 and $143.20, and 1,000 prompts at $345.00 and $276.00. The visible select lists those three prompt counts. The card’s engine bullet on that extract names AI Overviews, AI Mode, Perplexity, and ChatGPT, and drops Gemini. The tracker page includes Gemini. Both sentences are on official pages.

SE Visible’s FAQ, fetched the same day, repeats the UI claim in stronger words: “real AI responses through a browser interface — not simulations and not API shortcuts” ([SE Visible FAQ](https://help.seranking.com/hc/en-us/articles/22266372506524-SE-Visible-FAQ)). It says the add-on includes SE Visible at no extra cost, that tracking is daily by default or weekly, and that the prompt allowance “counts the number of prompts you have added, not the number of checks performed.” Five engines: ChatGPT, Google AI Overview, Google AI Mode, Gemini, and Perplexity. “Tracking is available in 42 countries,” with a city or region narrow. The tracker page’s “7 supported markets” and this FAQ’s 42 countries are both official. They are not the same frame.

“Rather than sampled outputs” still rejects API-style single draws. It also rejects, perhaps unintentionally, the statistical repeated-sample design Evertune argues for. One UI capture per prompt is still one draw. A margin of error is not stated.

## Matching real users

The UI claim is the fidelity claim, and it is stronger than “we call an API” if it is true. The page does not describe account state, locale binding beyond seven markets, or personalization. Five languages and seven markets are a bounded matrix, which is more honest than “global” with no list. The market names were not in the extract.

## Metrics

On the tracker page: mentions, linked mentions, mention rate, link rate, average rank in the answer, competitor presence, source type (media, blogs, forums). Sentiment is not in that extracted list.

SE Visible publishes the score the tracker page would not ([FAQ](https://help.seranking.com/hc/en-us/articles/22266372506524-SE-Visible-FAQ)):

`weight = (total_brands − best_position + 1) / total_brands`

`Visibility = ROUND(SUM(weight) / total_responses_in_scope × 100)`

Missing mentions contribute 0. If the brand appears more than once, only the best position counts. Their worked example ends at 45%. Citations are excluded from Visibility and tracked separately. Net Sentiment “has its own formula and does not affect the Visibility score.” The sentiment formula itself is not printed. Share of voice is named on the competitor grid; its formula is not printed.

## SEO overlap

The toolkit sits on an SEO suite, and the page tells users to pull AI data into the same client dashboards as SEO. AIO traffic is the explicit join to analytics. Correlation with branded search is their suggested ROI method, which is a trend analysis, not an attribution model. They say as much.

## Pipeline and architecture

**Facts.** HAR: `seranking.com` (875), Bing bat (117), `collector.seranking.com` (83), Twitter/X, HubSpot, Cookiebot, OpenAI beacons, Clarity. Many URLs contain `wp-content` (REA evidence `ev_552813ef49e395f2bc992a8c19db087b60c59dca467acfa21d59e643ac181334`). Server path is Cloudflare on the earlier robots fetch. `robots.txt` allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ChatGPT-User, and Perplexity-User, with disallows for tags, `/ac/`, and vacancies for the training bots. Sitemaps are named for several locales. `/llms.txt` returned 404.

**Inferences.** WordPress is the marketing site. `collector.seranking.com` is a first-party analytics or tag collector. It is not evidence of the UI runner. A UI runner at their scale implies a browser farm, proxy locales for seven markets, and a parser for mentions versus links. “Rather than sampled outputs” means they want buyers to believe the farm, not an API. The HAR cannot confirm the farm.

## Client claims

The page quotes agency users (Connor Wilkins at Direction.com, Ross Crawford at Mr Digital, Jairo David Guerrero Vásquez at Phanum) about SE Ranking as an SEO suite. Those quotes are not AI-visibility case studies. “150+ countries” is a company claim on the page, not a coverage claim for the seven AI markets.

## Evals and QA

Not stated. Cached answers are at least a review artifact: a human can see the string the metric came from. That is a QA feature. No agreement rate is given.

## Security

Not discussed on the tracker page. Cookiebot is the consent tool on the marketing site. SSO and SOC were not in the extract.

## Pricing

Stated on the pricing page, as quoted above. The tracker page itself still has no dollar figure. This report does not use third-party roundups.

## Strengths

The UI-versus-sampled-output sentence is the requirement a founder should force every vendor to answer. Mention versus linked mention is the right split. Seven markets and five languages are a stated frame. API, MCP, and warehouse connectors match how agencies already report. Robots.txt names AI crawlers and allows them, with narrow disallows.

## Weaknesses

One UI snapshot is not a stable mean, and the copy argues against sampling in a way that can be read as anti-replication. The tracker page, the pricing card, and the SE Visible FAQ disagree on the frame: Gemini is in and out of the engine list, and “7 markets” sits next to “42 countries.” `llms.txt` 404s despite a careful robots file. Suite testimonials are not AI proof.

## What to copy or beat

Copy the published visibility equation, including the zero for a missing mention and “best position only.” Copy “we drive the consumer UI, and we store the answer.” Beat the anti-sampling line by doing both: UI collection and enough repeats to publish a standard error. Put one engine list and one country count on the pricing page. Add `llms.txt` that matches the robots policy.

## Inferences, separated

WordPress and the collector host are HAR observations. The browser-farm sketch is an inference from their UI sentence. The prices and the visibility equation are from pages fetched after the HAR, cited above.

## Sources

- https://seranking.com/ai-visibility-tracker.html
- https://seranking.com/pricing.html
- https://help.seranking.com/hc/en-us/articles/22266372506524-SE-Visible-FAQ
- https://seranking.com/robots.txt
- HAR and REA JSON: `rea/har/seranking.har`, `rea/json/seranking.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/seranking.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_552813ef49e395f2bc992a8c19db087b60c59dca467acfa21d59e643ac181334`
- Artifact SHA-256: `e010220cc28d8cfea03c74cc091314b6daab27e7a028270238310d5f23142df2`
- Artifact bytes: 4111330
- Records: 1565
- JSON: `rea/json/seranking.json`
- HAR: `rea/har/seranking.har`

Highest host counts in the capture (request counts, not unique users): `seranking.com` (875), `bat.bing.com` (117), `collector.seranking.com` (83), `analytics.twitter.com` (48), `online.seranking.com` (39), `bzrcdn.openai.com` (26), `unpkg.com` (26), `consentcdn.cookiebot.com` (26).

Response `server` header samples: `cloudflare` (745), `AkamaiNetStorage` (26), `nginx` (22), `AmazonS3` (13).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://seranking.com/` (text/html; charset=utf-8)
- ordinal 1372: HTTP 200 `https://seranking.com/robots.txt` (text/plain)
- ordinal 1375: HTTP 404 `https://seranking.com/llms.txt` (text/html; charset=UTF-8)
- ordinal 1457: HTTP 404 `https://seranking.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 1557: HTTP 404 `https://seranking.com/sitemap.xml` (text/html)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

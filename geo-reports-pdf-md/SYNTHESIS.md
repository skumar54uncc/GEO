# GEO platform synthesis

Audience: a technical founder building a large generative-engine-optimization platform. Date of evidence: 2026-10-14. Scope: public unauthenticated pages plus HAR 1.2 captures inspected with REA (`rea-agents` 6.5.0, `inspect-web-network-capture`). Company reports live in `reports/`. Nothing in this file is a private-app teardown. Marketing sites are not the prompt runners.

Numbers below are copied from the cited pages or are arithmetic on those pages, and the arithmetic is labeled. Where a page did not state a figure, the cell says so.

## Who is in the set

Named by the brief, and confirmed as real public properties:

- Profound, Siege Media, Optimist, iPullRank, Minuttia, Chilli Fruit, Intero Digital.
- AthenaHQ, Peec AI, Scrunch AI, Otterly.ai, Goodie (`higoodie.com`; `goodie.ai` was a for-sale page), Evertune.
- BrightEdge AI Catalyst, Conductor, Semrush AI Visibility Toolkit, Ahrefs Brand Radar.

Added, with a reason:

- **Bluefish** (`bluefishai.com`). Enterprise AEO suite aimed at the same buyer as Profound and Evertune, with a public monitoring vocabulary (audiences, accuracy, static prompts, model-drift controls) and a Fortune 500 coverage claim. A founder who only studies mid-market SaaS will miss this RFP.
- **Rankscale** (`rankscale.ai`). Self-serve tracker whose price card separates GUI engines from API engines and publishes credit weights. That is the cleanest public collection-cost model in the set.
- **SE Ranking AI Search Toolkit**. Same class as Semrush and Ahrefs: an SEO suite with a dedicated AI tracker. It is the suite that states, in prose, that collection is direct UI monitoring “rather than sampled outputs.”

Not given a full report: seoClarity (AthenaHQ links a comparison; no capture was made), Writesonic and similar content suites (optimization tools, not visibility systems), and Chatbeat (named by Chilli Fruit as the tracker on one case study; not captured). They are adjacent. They are not scored below.

## Comparison matrix

Prices and quotas are vendor-stated on the linked page. “Not stated” means the fetched page did not say it.

| Company | Type | Public price floor | Engines named on the fetched page | Collection, as they describe it | Repeats | Locale control | Metrics they name | `llms.txt` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Profound | SaaS | Trial free; enterprise custom | Trial: ChatGPT, Gemini, AI Overviews. Insights page adds Perplexity, Claude, Copilot, AI Mode, Grok, DeepSeek. Enterprise: up to 9 | Consumer front end, not API. Daily | Daily run; count per day not stated | 30+ languages, 150+ regions claimed | Visibility, share of voice, sentiment, citations, FactCheck | 404, though robots allows it |
| AthenaHQ | SaaS | Free essential; Starter $295/mo, 3,600 credits | Starter lists 11 including Claude, Grok, DeepSeek, Meta, Mistral | Not stated. 1 credit = 1 response | Not stated | Multi-country marked enterprise | Share of voice, sentiment, citations, QVEM volume | 200, plus `llms-full.txt` |
| Evertune | SaaS + ads | Pro $800/mo | 9 named in `llms.txt`; Pro says 11 models | API for parametric knowledge; consumer app for retrieval. 100 draws in the teaching example | 100 in the example | “Global” on Pro | Mention rate, brand index, word association, shopping | 200 |
| Peec | SaaS | Tiers named; currency amounts not in the HTML. Starter 50 prompts, Pro 150, Advanced 350, each “Choose 3 models.” Enterprise up to 13 models | Docs name ChatGPT, Gemini, Copilot as the daily example. Pricing trackers also name AI Mode | UI scraping of a logged-out browser, not vendor APIs. Answers = prompts × models × frequency | Daily. Draws per day not stated | Countries, languages, regions, personas are fields | Visibility, position, sentiment, share of voice, SKU win rate, fact checks | Marketing file 404. Docs host has `llms.txt` |
| Scrunch | SaaS | Core $250/mo. Agency Core FAQ: $500/mo | Core: ChatGPT, Perplexity, AIO, Copilot. Enterprise adds Claude, Gemini, Meta, AI Mode, Grok | FAQ: browser automation and official APIs, chosen per platform | New prompts daily for 14 days, then a 72-hour default. Draws per run not stated. 5,000/125 = 40 if both quotas are used evenly (arithmetic, not their design) | Core: 1 country, 1 persona | Presence, sentiment, citations, fan-out. Position as top/middle/bottom | 200 |
| Otterly | SaaS | Lite $29/mo, 15 prompts | Base: ChatGPT, AI Overviews, Perplexity, Copilot. Claude, Gemini, AI Mode are add-ons | Not stated. “No OpenAI subscription” required | Daily; draws per day not stated | 50+ countries claimed | Brand visibility index, domain ranking, citations | Blocked from this network |
| Goodie | SaaS | Core $295/mo, 110 prompts | Core: 5 (ChatGPT, AIO, Perplexity, AI Mode, Copilot). Enterprise: up to 13, including commerce assistants | “Daily scaled intentional prompting.” UI vs API not stated | Not stated | Core: 2 countries, 2 languages | Citations, position, sentiment, share of voice, claim rates | 200 |
| Rankscale | SaaS | Essentials yearly about $17–$20/mo; Pro $99 | GUI vs API menu; weights shown for ChatGPT, Perplexity, Gemini, AI Mode, DeepSeek, Claude | Price card separates GUI and API engines | Cadence hourly to monthly; stochastic repeats not stated | “All” regions on the card | Visibility, sentiment, citations, fan-out, ads, shopping | 200, plus full file |
| Bluefish | SaaS + services | Demo | Homepage: 10+ including Alexa for Shopping. Monitoring FAQ names ChatGPT, Gemini, Perplexity | Not stated. Static prompts and model-drift controls named | Daily. Draw count not stated | Custom audiences | Visibility, share of voice by audience, sentiment, accuracy | 404 |
| BrightEdge | Enterprise SEO suite | Not stated | ChatGPT, Perplexity, AIO, AI Mode, Gemini, “other” | Not stated | Not stated | Persona contrast claimed; countries not stated | Mentions vs citations, 3-way sentiment, rank and traffic of the cited URL | 200, thin |
| Conductor | Enterprise SEO suite | Dollar price not stated. Credits per prompt are public | Credit table: ChatGPT Auto 1.00, ChatGPT Search 2.00, Claude Sonnet 0.50, Gemini 2.00, AI Mode 0.10, AIO 0.10, Grok Auto 1.00, Copilot 0.20, Perplexity 0.20 | Official APIs “wherever possible.” The feature page argues against scraping | One credit is one prompt to one engine. Stochastic repeats not stated | API geo parameters claimed. Country count not copied here | Mentions, citations, share of voice, sentiment on a 1–10 scale | Root file is a gated-PDF index. Docs `llms.txt` is a docs map |
| Semrush | SEO suite module | Base $99/domain/mo billed annually, 25 prompts | ChatGPT, Google AI, Gemini, Perplexity | Not stated. Corpus claimed at 289M+ prompts | Daily rankings; draws not stated | Not stated on the Base bullets | Visibility score, audience, mentions, sentiment, share of voice, citations | 200 |
| Ahrefs Brand Radar | SEO suite module | Check packs from $50, $199, $699/mo for all models; custom prompts included in paid plans | Index page: AIO, AI Mode, ChatGPT, Perplexity, Gemini, Copilot. Custom adds Claude at 8 checks. Methodology volumes also name Grok | Methodology post: free public web interfaces. Product page says “through each AI platform” | Index re-tested monthly. Repeats inside a run not stated | Location is a check | Mentions, citations, AI share of voice, estimated impressions | 404 |
| SE Ranking | SEO suite module | AI Search add-on: 200 prompts at $89/mo ($71.20 annual figure), 450 at $179, 1,000 at $345 | Tracker and SE Visible FAQ: AIO, AI Mode, ChatGPT, Gemini, Perplexity. The pricing-card bullet drops Gemini | “Direct UI-based monitoring.” SE Visible FAQ: browser, “not simulations and not API shortcuts” | Daily by default, or weekly. Draws per cycle not stated | Tracker: 7 markets, 5 languages. SE Visible FAQ: 42 countries | Mentions, linked mentions, average rank. SE Visible prints a position-weighted visibility formula and keeps citations and sentiment out of it | 404 |
| Siege Media | Agency | Not stated | Not listed as a product. Measurement post names ChatGPT, Gemini, AI Overviews | Their own example uses Peec AI. They also name Otterly | Not stated. Their Peec project is 11 buying-intent prompts | Not stated | LLM citations, “LLM visibility,” plus SEO traffic value. The post reports a 53% visibility score on those 11 prompts | 404 |
| Optimist | Agency | Roadmap from $2,500; advisory from $3,000/mo | ChatGPT, Claude, Perplexity, Gemini, AI Overviews | Weekly tracking; vendor unnamed. Fan-out study: 199 prompts, 5 surfaces, 1,708 SERPs | Weekly on retainer; draws not stated | Buyer-location policy, not a matrix | Recommendation rate, citations, share of voice, LLM pipeline | 200, Yoast |
| iPullRank | Agency | Readiness page: $30K–$150K, $150K–$500K, $500K+ | Procurement page names ChatGPT, Perplexity, Google via a Profound partnership | Profound for answer-engine data. ExactScience, their platform, for content relevance | They tell buyers one screenshot is an anecdote. Their own draw count is not stated | Not stated | Three tiers: input, channel (share of voice, citation rate, quality, sentiment), performance. $5B+ remains an organic-search claim | 404 |
| Minuttia | Agency, plus a free report | Not stated | Homepage: Google and ChatGPT. Free report: visibility by platform; citations “currently” Perplexity only | “We run your brand through a set of prompts.” Method not further specified | Not stated | Not stated | Visibility Score, share of voice, average position, sentiment. Retention 94% as of June 2026 | Blocked |
| Chilli Fruit | Agency | Not stated | Case study lists ChatGPT, Perplexity, AIO, AI Mode, Gemini, Grok, DeepSeek, Claude, Copilot | Chatbeat, a third-party tracker | Not stated | USA, UK, EU for one campaign | 12.5% visibility, median position 8, 44/100 brand score, on that case | 200, thin |
| Intero Digital | Agency | Not stated | ChatGPT, Perplexity, AI Overviews, Gemini, Copilot | “Snapshot,” method not published | Not stated | Not stated | 400+ GRO brands, their claim; SEO case studies are separate | 200, Rank Math |

Security names that actually appeared: Profound SOC 2 Type II, SSO, SCIM on the homepage; AthenaHQ enterprise SAML/OIDC and audit log, no SOC 2 sentence on the plans page; Evertune enterprise SSO only; Scrunch Google SSO on Core and SAML/OIDC on Enterprise; Otterly SSO on custom; Goodie SOC 2 and SSO on enterprise; Rankscale SSO only on the custom line; Peec SSO as a row; Bluefish products page badges for SOC 2 Type II, SSO, HIPAA-Ready, and MFA; Conductor feature page “SOC 2 Type 2” and “ISO 27001”; BrightEdge trust page “ISO/IEC 42001 certified,” an ISO 27001:2022 section whose image alt says certified, and SAML/SSO as a product feature. The BrightEdge SOC 2 section defines the exam and does not, in the paragraph read, say they hold the report. Semrush, Ahrefs, SE Ranking, and the agencies did not put a certification on the pages fetched. Absence is not a finding that they lack one.

## A measurement methodology that survives contact with these products

The vendors are describing one pipeline and shipping several. A platform that wants to be the reference implementation should separate the stages they blur.

**1. Demand is not the prompt you wish a buyer would ask.** Ahrefs derives questions from a keyword graph and People Also Ask. Profound and Evertune claim logs of real AI conversations (Prompt Volumes; EverPanel, “150 million”). Semrush claims a 289M prompt corpus beside the keyword index. Rankscale and Otterly will also invent prompts with a model. Those are four different populations. Store the provenance on every prompt: observed AI log, observed web query, fan-out of another prompt, or synthesized. Never average them into one “search volume.” Peec’s 1–5 relative score is the honest version of a prior you cannot count.

**2. Parametric memory and retrieval are different measurements.** Evertune is the vendor that separates them cleanly: call the API to see what the model already believes, and capture the consumer app to see what it retrieves. A gap that exists only in the app is an SEO and content problem. A gap in both is a brand problem. Profound, Peec, SE Ranking, and Ahrefs’ methodology post say they drive the public web UI and refuse to treat an API sample as the user. Conductor says the opposite: official APIs wherever possible, and scraping is a legal and stability risk. Scrunch says it uses both, per platform, and does not say which platform gets which. Ship both series, labeled. Do not average them.

**3. One draw is not a score.** Evertune’s running-shoe example is the spec: one hit can read as 100% visibility; 100 draws on one prompt still leave about ±10 points in their telling; a topic built from 10 single draws can be ±31 points. SE Ranking’s “rather than sampled outputs” sentence is the opposite emphasis (live UI, not a cheap API sample) and is easy to misread as “do not replicate.” Do both. UI collection, repeated, with a published standard error. Scrunch’s Core quota (125 prompts, 5,000 responses) at least puts a response budget on the invoice. Athena’s credit and Rankscale’s fractional credit do the same. Profound says “daily” and does not say how many.

**4. Locale and persona are cells, not filters.** Goodie prices countries and languages. Ahrefs prices location as a check. Scrunch Core is one country and one persona, which is a honest ceiling. BrightEdge and Bluefish talk about re-asking as a different person. Rankscale says all regions and does not show the profile. A cell is engine × locale × persona × prompt cluster. A score that pools Rufus, Alexa, and ChatGPT (Goodie’s enterprise model list, Bluefish’s Alexa line) is a different product from a chat score. Keep shopping assistants in their own index.

**5. Mentions, citations, position, and sentiment are different events.** Ahrefs defines mentions versus citations versus share of voice versus impressions weighted by search volume. BrightEdge splits mentions presence from citations presence and stores a positive/neutral/negative rationale. SE Ranking splits linked and unlinked mentions and stores an average rank. Peec adds source class (competitor, editorial, reference, UGC), objection clusters, and SKU win rate. Sentiment without the sentence that justified it is not reviewable. Position without a stated counting rule (first brand mentioned, rank among citations, median across draws) is not a metric.

**6. The SEO join is fan-out plus the cited URL’s rank, not a blended “visibility score.”** Optimist’s study (199 prompts, five surfaces, 1,708 SERPs) claims that ranking for the model’s own follow-up queries explains citations far better than a random control. BrightEdge puts ranking keywords and estimated traffic on the cited page. Ahrefs maps prompts back to keyword volume. A platform that cannot store the sub-queries the engine ran cannot test the only mechanism in this set that is almost falsifiable.

**7. Brand facts are a second eval, not a dashboard widget.** Profound FactCheck, Peec’s fact-checked prompts, Goodie Brand Command, and Bluefish AI Accuracy all compare claims to a customer-supplied truth. Bluefish adds “91% agreement with independent human review” for that accuracy product. Nobody published the rubric. The platform should treat the fact store as versioned data and the judge as a model with its own gold set.

**8. Action is a separate system with its own outcome test.** Athena Citation Engine, Profound agents, Goodie action credits, Conductor Creator, and the agencies (Siege’s content and PR, Optimist’s briefs, Chilli Fruit’s 30 sponsored articles, iPullRank’s relevance versus resonance) all try to move the number. The test is pre-registered: same prompt set, same engine, same locale, before and after, with enough draws that a content ship is distinguishable from sampler noise. Evertune’s margin math says most “we published and visibility moved” slides fail that test.

## Best practices worth keeping

- Print the engine list and the draw budget on the plan, not in a screenshot (Athena, Scrunch, Otterly, Rankscale, Goodie).
- Refuse to call an API response a ChatGPT answer (Profound, Evertune, SE Ranking).
- Price GUI and API differently when both exist (Rankscale). Claude at eight Ahrefs checks, or at two Rankscale credits, is a cost signal. Show it.
- Keep a frozen prompt set (Bluefish’s “static prompts”) so a model update is not confounded with a questionnaire edit. Hash the set.
- Store the raw answer (BrightEdge, SE Ranking’s cached copies). Metrics that cannot be recomputed from stored text will not survive a customer’s analyst.
- Annotate series with model and algorithm events (BrightEdge already annotates algorithm updates for SEO).
- Separate the writer from the ruler. Conductor’s gated writing-assistant eval is the right instinct. Do not let the same model that writes the page grade the citation.
- Put a denominator next to agency claims. Chilli Fruit names Chatbeat, the client, and the months. Optimist gives n for the fan-out study. Siege’s “98% LLM visibility” does not say of what. Prefer the first two.
- Serve `llms.txt` if you tell customers to serve `llms.txt`. Athena, Scrunch, Evertune, Goodie, Rankscale, Semrush, BrightEdge, Conductor, Optimist, and Intero do. Profound allows it in robots and 404s. Ahrefs, Peec, Bluefish, SE Ranking, Siege, and iPullRank 404. Otterly and Minuttia did not return the file to this network.
- Allow or deny AI crawlers on purpose. Rankscale and SE Ranking name GPTBot, ClaudeBot, PerplexityBot, and Google-Extended. Most of the others ship a Yoast or platform default and do not take a position.

## Market gaps

1. **No vendor publishes a complete error bar on a customer score.** Evertune publishes a teaching example. The product pages do not show ± points next to a brand’s number.
2. **UI versus API is now a public argument, and the two sides do not publish a paired sample.** Profound, Peec, SE Ranking, and Ahrefs’ methodology post take the browser side. Conductor takes the API side and says the browser side is the riskier one. Evertune wants both for different questions. Scrunch says both without a per-engine map. Rankscale prices them apart. Athena, Otterly, Goodie, Semrush, BrightEdge, and Bluefish still do not say which runner produced a number. Nobody in the set prints the same prompt from both runners on one chart.
3. **Model version is not a dimension.** A cutoff will look like a ranking change. Bluefish names drift controls and does not specify them in the rendered FAQ.
4. **Personalization is unmeasured.** Persona features are either a prompt prefix or a real account history. Nobody shows which.
5. **Shopping and chat are being averaged.** The commerce surface (ChatGPT shopping, Rufus, Alexa, Copilot shopping) has different citations and different money. It needs its own panel.
6. **Query volume for AI prompts is still a story.** QVEM, Keyword Volume Estimator, Prompt Volumes, and Ahrefs’ search-volume weighting cannot all be the same quantity. Buyers will subtract them. They are not commensurable until someone publishes a crosswalk.
7. **Agency delivery has no system of record.** The best GEO work in this set is human: sponsored articles, entity cleanup, Reddit, fan-out briefs. The tools stop at a recommendation. Conductor AgentStack and the various MCPs are the start of the other direction (the system of record called by the human’s agent).
8. **Evals are marketing.** Bluefish’s 91% and Conductor’s gated writer study are the only eval-shaped artifacts, and only one is a number on an open page. Mention detection, sentiment, and share of voice have no public gold sets.
9. **The marketing edge fights agents.** Otterly and Minuttia 403’d this capture. Intero challenged on Cloudflare. Goodie’s WP Rocket hid every third-party tag until interaction. Teams selling AI visibility are not readable by the agents they want cited.
10. **Security packets are not on the product page** except Profound’s SOC 2 Type II line and a handful of SSO rows. A large platform will be asked for subprocessors, retention of raw prompts, and whether customer prompts are used to train. Goodie links a subprocessors page. Almost nobody else, in the fetched set, does.

## Reference architecture

This is a recommendation, not a description of any vendor.

```
                    +----------------------+
                    | Prompt registry      |
                    | provenance + hash    |
                    +----------+-----------+
                               |
            +------------------+------------------+
            |                                     |
   +--------v---------+                 +---------v--------+
   | Consumer UI farm |                 | Provider API lab |
   | locale, persona  |                 | parametric memory|
   | logged-out profile                 | no browsing      |
   +--------+---------+                 +---------+--------+
            |                                     |
            +------------------+------------------+
                               |
                    +----------v-----------+
                    | Response store       |
                    | raw text, citations  |
                    | engine, model build  |
                    | draw id, latency     |
                    +----------+-----------+
                               |
         +---------------------+----------------------+
         |                     |                      |
 +-------v-------+   +---------v--------+   +---------v--------+
 | Mention/cite  |   | Fan-out queries  |   | Claim judge      |
 | sentiment     |   | join to rank and |   | vs fact store    |
 | position      |   | search volume    |   | human gold set   |
 +-------+-------+   +---------+--------+   +---------+--------+
         |                     |                      |
         +---------------------+----------------------+
                               |
                    +----------v-----------+
                    | Score service        |
                    | mean, n, SE          |
                    | never pools indexes  |
                    +----------+-----------+
                               |
              +----------------+----------------+
              |                                 |
     +--------v---------+             +---------v--------+
     | Action queue     |             | Customer API/MCP |
     | briefs, CMS, PR  |             | exports, SSO     |
     | pre-registered   |             +------------------+
     | before/after     |
     +------------------+
```

Components worth being stubborn about:

- **Prompt registry.** Immutable versions. A score names a hash. Editing a prompt starts a new series. This is the static-prompt idea, made mechanical.
- **Two runners.** UI farm for “what a logged-out user in this locale saw,” API lab for “what the weights say.” Different tables. Rankscale’s prices are the billing view of this split. Profound and SE Ranking argue for the left branch. Evertune argues for both.
- **Draw ledger.** Primary key is prompt × engine × model build × locale × persona × draw. Athena’s credit and Rankscale’s 0.25 credit are the billing projection of this key. Publish n and a standard error. Default to enough draws that a topic cell is tighter than ±5 points, and show the customer the bill before they ask for a cut the sample cannot support.
- **Parsers with stored spans.** Mention, citation URL, position, and sentiment each point at a character span in the raw answer. If the parser changes, reprocess history. Do not overwrite it.
- **Fan-out table.** Every sub-query the UI shows or the network trace reveals, joined optionally to a search index. This is the Optimist result, productized. Partner for the index if you do not want to crawl the web; Ahrefs, Semrush, and BrightEdge already did.
- **Fact store and judge.** Customer facts are versioned. The judge is not the writer. Report agreement against a human sample the way Bluefish claims to, and publish n.
- **Indexes that are not averaged.** Chat, overview-in-Google, and shopping assistants. Share of voice is within an index.
- **Action queue with a pre-registration.** A brief cites the cells it is supposed to move. The after-period uses the same hash. Agencies can work the queue. Chilli Fruit’s 30 articles would be 30 rows with the target cells attached.
- **Edge for agents.** `llms.txt`, `robots.txt` with explicit AI user agents, and a public metric dictionary. Do not 403 the policy files.

What not to build first: a blended “AI visibility score,” an autonomous writer that grades itself, or a query-volume number that pretends to be Google Keyword Planner for ChatGPT.

## Eval framework

Run these continuously. They are the QA the fetched sites do not show.

| Eval | Question | Minimum bar | Fails when |
| --- | --- | --- | --- |
| Mention gold | On a frozen set of answers, does the span matcher find the brand and the aliases? | Precision and recall reported on a set with hard negatives (competitor with a shared stem) | A rename or a non-Latin alias silently drops |
| Citation gold | Are URLs extracted, canonicalized, and classified (owned, competitor, editorial, UGC)? | Agreement with a human on a few hundred answers | Redirects and “mentioned but not linked” are collapsed |
| Position rule | Can a second engineer recompute position from the raw text and the written rule? | Unit tests on ties, lists, and prose | The rule only exists in a dashboard tooltip |
| Repeat stability | Same prompt, same engine build, same locale, many draws | Standard error matches the published formula within a tolerance | The UI shows a 10-point move on a 1-draw cell |
| UI versus API gap | Same prompt, both runners | The gap is a first-class series, not a bug | API answers are labeled as the consumer product |
| Locale parity | Same prompt in two countries | The profile (language, store, account) is recorded | A US default is labeled “global” |
| Persona shift | Same prompt, two persona bindings | Difference is tested, not assumed | A system-prompt prefix is described as a user |
| Model drift | Frozen prompt hash across a model update | The update is an annotation, the series splits | A cutoff is narrated as a content win |
| Judge agreement | Claim labels versus humans | Publish n, rubric, and agreement | The 91% claim has no protocol |
| Fan-out join | Sub-query to rank, on a sample | A report can reproduce or refute the “ranks explain citations” claim | Fan-out is a word cloud |
| Action lift | Pre-registered cells, before and after | Lift larger than the error bar, or reported as noise | A blog post counts as a result |
| Leakage | Customer prompts and raw answers | Not used to train a public model; subprocessors listed | A marketing page loads a staging analytics host and nobody can say why |

Operational QA around the evals: contract tests for each engine’s DOM or API schema, a canary prompt whose answer is known, and a kill switch when a site starts returning interstitials. Otterly’s and Minuttia’s 403s are what a UI farm looks like when the other side decides you are a bot. The farm needs a documented, lawful collection policy. This project did not bypass those walls.

## What to copy, as a build order

1. Metric dictionary and raw-answer store (Ahrefs, SE Ranking, BrightEdge).
2. Dual runner and a frozen prompt hash (Evertune, Profound, Bluefish, Rankscale’s price split).
3. Draw ledger with a standard error on the chart (Evertune’s example, Scrunch’s response quota, Athena’s credit).
4. Fan-out join to an SEO index (Optimist, Ahrefs, BrightEdge). Do not crawl the web yourself in v1.
5. Fact store and a judged claim layer (Peec, Goodie, Bluefish), with a human gold set from day one.
6. Separate shopping index (Rankscale, Peec, Goodie, Bluefish).
7. Action queue and MCP (Conductor AgentStack, Scrunch, Peec, Goodie), after the score is stable enough that agents are not automating noise.
8. Agency workspace with a required denominator on every exported number (Chilli Fruit’s writeup is the template; Siege’s percentages are the failure mode).

## Capture notes that bind the stack comments

REA evidence ids are in each company report. A same-day pass over public docs and pricing pages that were not full documents in the HAR filled several cells the first extract left as “not stated.” Those URLs are cited in the company files. The HARs were not recaptured. Host fingerprints (Next.js, Framer, Webflow, Drupal, WordPress, Sanity, PostHog, Vercel) describe public marketing sites. Profound’s Sanity and `/_next/` URLs do not locate the browser farm. Ahrefs’ public pages requested `analytics-staging.ahrefs.dev`; that is an observed host, not proof that Brand Radar data is served from staging. Goodie’s HAR contains only `higoodie.com` because WP Rocket deferred tags. Otterly and Minuttia are 403 captures; their product descriptions come from pages fetched by a path this HAR did not take, and those URLs are cited in the company files.

## Sources

Per-company URLs are in `reports/*.md`. Cross-cutting pages used above:

- https://www.evertune.ai/platform/methodology
- https://www.tryprofound.com/features/answer-engine-insights
- https://ahrefs.com/brand-radar
- https://seranking.com/ai-visibility-tracker.html
- https://rankscale.ai/pricing
- https://athenahq.ai/plans/
- https://scrunch.com/pricing/
- https://www.yesoptimist.com/ai-search-optimization-services/
- https://www.brightedge.com/products/ai-catalyst
- https://www.bluefishai.com/products/ai-monitoring-suite

# Bluefish

Primary site: [bluefishai.com](https://www.bluefishai.com/). Captured 2026-10-14. Offering: enterprise SaaS (“agentic marketing”) with a services layer. Included because it sells to the same Fortune-500 AEO buyer as Profound and Evertune, and because its monitoring suite is explicit about audiences, accuracy, and static prompts even where the FAQ answers did not all render.

## Three-line summary

Bluefish splits the product into monitoring, optimization, and measurement, and claims daily tracking across 10+ models including shopping assistants. The monitoring suite’s public argument is that an average score hides audience gaps, and that accuracy is a separate metric from visibility, checked against brand facts. The homepage says it is trusted by over 10% of the Fortune 500. The products page states “10%,” “20% avg. AI visibility lift in 30 days,” and “85% of customers use Bluefish services,” and shows badges for SOC 2 Type II, SSO, HIPAA-Ready, and MFA. Price is demo-only. The marketing site is Framer.

## Offering

The homepage calls Bluefish “the only end-to-end agentic marketing platform” with three suites: AI Monitoring, AI Optimization, and AI Measurement ([homepage](https://www.bluefishai.com/)). It says teams covered include brand, content, search, PR, social, paid, and retail. “Full Service” is also a heading: “custom audits, strategy, and execution,” so this is SaaS plus services, not a pure tool. “Trusted by over 10% of the Fortune 500” is their claim. “10+ LLMs tracked daily including Alexa for Shopping, plus 15+ provider integrations.” “Static prompts, model-drift controls, MCP, and Agents.”

## GEO methodology

Monitoring is the intelligence layer. Optimization turns insights into “ready-to-run tactics.” Measurement is supposed to prove business impact. The monitoring page adds Impact Score (which sources move the answer), Influence Rank (owned versus third-party), sentiment, citation analysis down to URL, and AI Accuracy: detect claims, trace the inaccurate ones, correct first- and third-party sources, “and syndicate brand-verified data straight to AI platforms” ([monitoring suite](https://www.bluefishai.com/products/ai-monitoring-suite)).

## How they measure

Monitoring FAQ answer that rendered: the suite “tracks how enterprise brands appear across AI-generated answers — including ChatGPT, Gemini, Perplexity, and other leading LLMs … updated daily across 10+ models.”

The same page says custom audiences break visibility and share of voice out by persona. A diagrammatic claim: “A 50% average score can hide a 92%-to-8% gap between your best- and worst-seen audiences.” That is a teaching example in the layout, not a named customer result.

AI Accuracy: “Validated by 6+ frontier models and 91% agreement with independent human review.” That is their claim about the accuracy product. The study design was not on the page.

FAQ questions whose answers did not render in the fetch, and are therefore not answered here: how many platforms exactly, how monitoring differs from Profound, what a static prompt set is, whether shopping assistants are covered, competitor tracking, citation intelligence, update frequency beyond the “daily” in the first answer, industries, and suite integration. The homepage separately says Alexa for Shopping is tracked and that static prompts and model-drift controls exist. The definition of static prompts is the unrendered FAQ.

Not stated in rendered text: UI versus API, repeat count, locale matrix, or price.

## Matching real users

Audience-level scores are the fidelity feature, and the 92-to-8 example is the argument against a single brand index. Static prompts, named on the homepage, are the right control for model drift: hold the prompt set fixed so a score change is not a questionnaire change. The definition did not render. Model-drift controls are named and not specified. Daily updates are stated. Personalization inside the consumer products is not discussed.

## Metrics

Visibility, share of voice by audience, impact score, influence rank, sentiment, citation URL, and accuracy against brand facts. A homepage tile and a 24 September 2026 insight title say “Up to 446% ROI” ([homepage](https://www.bluefishai.com/), title “The Enterprise Case for Agentic Marketing: Up to 446% ROI”). The homepage’s other tiles did not parse into a complete sentence (a “13” and “30 days” were visually separated from their nouns). Those fragments are not reported as metrics. “58% of consumers blame the brand when an AI recommendation is wrong” appears on the monitoring page without a study citation in the extract. It is their page’s sentence.

## SEO overlap

Citation tracing to URL is the overlap. Optimization and “syndicate brand-verified data straight to AI platforms” goes past SEO into a data-feed motion. No rank tracker is claimed on these pages. Measurement suite is supposed to connect AEO work to business results; the metric definition was not extracted.

## Pipeline and architecture

**Facts.** HAR hosts: `framerusercontent.com` (717), Google, Google Tag Manager, HubSpot, LinkedIn, DoubleClick (REA evidence `ev_98d955a1e87c9cbd3795b14420dd3c8b61497935098cf01449bcae76a1cb5e58`). `robots.txt` allows `/` and points at a sitemap. `llms.txt` returned 404. Sitemap entries include the three product URLs used here.

**Inferences.** Framer is the marketing site. HubSpot is the demo-request path. Daily multi-model monitoring plus accuracy judging by “6+ frontier models” implies a runner and a second-pass judge model. Static prompts imply a frozen questionnaire in storage. None of that is in the HAR. MCP is claimed on the homepage and was not probed.

## Client claims

Fortune 500 “over 10%.” A quote attributed to a “Head of GEO-SEO Director” in insurance, unnamed, about briefs. The 446% ROI title. No customer name was attached to the ROI in the extracted homepage text.

## Evals and QA

“91% agreement with independent human review” is the only numeric eval claim, scoped by them to AI Accuracy, not to mention detection. Model-drift controls are a QA feature if static prompts are held out across model versions. The protocol was not published in the rendered FAQ.

## Security

The homepage adjectives are not a report. The products page, read after the HAR, prints the badges “SOC 2 Type II,” “SSO,” “HIPAA-Ready,” and “MFA” ([products](https://www.bluefishai.com/products)). The same page’s stat tiles are the text nodes “10” “%” “of Fortune 500 companies use Bluefish,” “20” “%” “avg. AI visibility lift in 30 days,” and “85” “%” “of customers use Bluefish services.” The homepage’s “over 10%” and this page’s “10%” are both their sentences. A DPA link was not in that extract. “HIPAA-Ready” is their badge wording, not a certification this report verified.

## Pricing

Request a demo. No public price on the fetched pages.

## Strengths

Audience-conditional scores, accuracy as its own metric, static prompts, and model-drift controls are the right enterprise measurement vocabulary, even where the definitions failed to render. Daily 10+ models including a shopping assistant matches how retail buyers will write the RFP. Services plus software is how Fortune 500 AEO is actually delivered in 2026.

## Weaknesses

The public contract is thinner than the vocabulary. Price, sample size, and UI versus API are absent. `llms.txt` 404s. ROI and the 58% consumer line are not traceable in the extract. Framer marketing pages drop FAQ bodies in text extraction, which also means agents will mis-brief the product. Unnamed testimonials do not survive procurement.

## What to copy or beat

Copy static prompt sets as a first-class object with a hash, and copy accuracy-versus-visibility as separate scores with a human-agreement number you can reproduce. Beat them by publishing the agreement protocol (n, rubric, models) and the audience binding. Ship `llms.txt` that includes the FAQ they already wrote. Put a price band on the site so technical evaluators are not forced through a demo to learn the shape.

## Inferences, separated

Framer and HubSpot are HAR facts. The judge-model pipeline is an inference from “validated by 6+ frontier models.” Fortune 500 coverage is their claim.

## Sources

- https://www.bluefishai.com/
- https://www.bluefishai.com/products
- https://www.bluefishai.com/products/ai-monitoring-suite
- https://www.bluefishai.com/robots.txt
- HAR and REA JSON: `rea/har/bluefish.har`, `rea/json/bluefish.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/bluefish.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_98d955a1e87c9cbd3795b14420dd3c8b61497935098cf01449bcae76a1cb5e58`
- Artifact SHA-256: `21572b3afd4c8425ff234de864e75edc3225e199739ef4254f00f0dc20c05e23`
- Artifact bytes: 3512823
- Records: 1078
- JSON: `rea/json/bluefish.json`
- HAR: `rea/har/bluefish.har`

Highest host counts in the capture (request counts, not unique users): `framerusercontent.com` (717), `www.google.com` (64), `www.googletagmanager.com` (56), `events.framer.com` (43), `tags.srv.stackadapt.com` (41), `www.google-analytics.com` (33), `www.bluefishai.com` (16), `padol.ing` (11).

Response `server` header samples: `CloudFront` (350), `cloudflare` (51), `Google Tag Manager` (45), `Framer/24ab00f` (16).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://www.bluefishai.com/` (text/html)
- ordinal 215: HTTP 404 `https://www.bluefishai.com/pricing` (text/html)
- ordinal 1064: HTTP 200 `https://www.bluefishai.com/robots.txt` (text/plain)
- ordinal 1075: HTTP 404 `https://www.bluefishai.com/llms.txt` (text/html; charset=utf-8)
- ordinal 1076: HTTP 404 `https://www.bluefishai.com/llms-full.txt` (text/html; charset=utf-8)
- ordinal 1077: HTTP 200 `https://www.bluefishai.com/sitemap.xml` (text/xml)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

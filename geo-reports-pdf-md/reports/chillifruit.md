# Chilli Fruit

Primary site: [chillifruit.com](https://chillifruit.com/). Captured 2026-10-14. Offering: agency. `llms.txt` describes a link-building and consulting firm. One public case study is a GEO engagement that used a third-party tracker.

## Three-line summary

Chilli Fruit’s AI-search proof is a sponsored-content campaign for Future Processing, February to October 2025: 30 articles, a stated 30% budget shift, and results they attribute to Chatbeat. Reported outcomes include 12.5% AI visibility, a median position of 8, top-four mention rank behind Accenture, AWS, and Microsoft, and 1.7× conversion versus organic. The site is WordPress. `llms.txt` exists and is thin.

## Offering

`llms.txt` says: “We are a link building and consulting agency” ([llms.txt](https://chillifruit.com/llms.txt)). The file lists an AI Search Visibility case study, HARO, Brand24, and NBA Blast case studies, plus hire-us and team pages. This is an earned-media shop that has added an AI-visibility engagement, not a platform.

## GEO methodology

The Future Processing case study is the method ([case study](https://chillifruit.com/case-studies/ai-search-visibility/)):

- Window: launched February 2025, finished October 2025.
- Client named: Future Processing, a tech consultancy.
- “Shifted 30% SEO budget to AI-optimized sponsored content. 30 articles published on high-authority sites.”
- Articles targeted commercial phrases (Azure consulting, FinOps, cloud modernization) and linked to the client’s service pages.
- Goal: be inside answers used during vendor evaluation, on “GPT, Perplexity, AI Overview, AI Mode, Gemini and others.”
- They write that publications were “indexed and cited across all LLMs.”

That is digital PR aimed at citation, which is a real GEO technique, and it is not on-page schema work.

## How they measure

The case study says the picture of most-cited sources and share of voice came from “Chatbeat (AI Visibility tracking tool).” So the measurement layer is a named third-party product, not Chilli Fruit software. Engines they say the brand appeared in: AI Mode, AI Overviews, ChatGPT, Perplexity, Gemini, Grok, DeepSeek, Claude, and Copilot.

Not stated: whether Chatbeat uses UI or API, how many prompts, or how many repeats. Those questions belong to Chatbeat’s docs, which were not fetched for this report.

## Matching real users

Targeting is stated as USA, UK, and European Union. That is a market list, not a browser-locale protocol. No personalization note.

## Metrics

As printed on the case study:

- AI Brand Score 44/100.
- Median position in AI search: 8.
- 12.5% AI visibility, “Top 4 mentions after Accenture, AWS, and Microsoft.”
- 1.7× higher conversions from AI search than from traditional organic.
- AI-driven leads “from 14 in 2024 to 25 in 2025.”
- They say the brand outranked Deloitte and Amazon on their tracked queries.

These are the agency’s reported results for one client, measured in a tool this project did not audit. Median position of 8 and “top 4 mentions” can both be true if they are different metrics. The page does not define either denominator.

## SEO overlap

The strategy’s second effect, in their words, was Google relevance via links to service pages. They call the combination “long-term SEO synergy.” Budget was shifted from SEO, not added. That is a reallocation, and they present it as a test.

## Pipeline and architecture

**Facts.** HAR: `chillifruit.com` with `wp-content` (182) and `wp-includes`, CookieYes, Google Site Kit generator meta “Site Kit by Google 1.189.0,” Google Analytics hits (REA evidence `ev_b6a96159ba2a50392039c287481e1d1aabdb7e044eb519c82bd301507589ab04`). JSON-LD included Organization, WebSite, and WebPage. `robots.txt` disallows `/wp-admin/` except `admin-ajax.php` and points at `sitemap_index.xml`. `llms.txt` returned 200.

**Inferences.** WordPress, Site Kit, and CookieYes are the marketing site. Chatbeat is the measurement system for the published case. Chilli Fruit’s delivery pipeline is outreach and sponsored articles, which will not appear in a HAR of their own homepage.

## Client claims

Future Processing is named, with the figures above. Other case-study titles (HARO, Brand24, NBA Blast) were not fetched.

## Evals and QA

The case study names the people responsible (Daniel Ząbczyk, John Kawecki) and shows screenshots described as Chatbeat views. The screenshots were not re-read as data. No inter-rater note. Lead counts (14 to 25) are small; a 1.7× conversion claim on a small base is sensitive to definition of “AI search lead,” which is not specified.

## Security

Not discussed. Sponsored content has a disclosure question the case study does not address in the extract.

## Pricing

Not published. The client-side budget fact is a 30% shift of SEO budget, not Chilli Fruit’s fee.

## Strengths

They published a named client, a window, a tactic (30 sponsored articles), a market list, and the tracker’s name. That is more auditable than a logo wall. Using an external tracker is honest. Linking articles to service pages is the SEO-and-GEO mechanism Optimist’s fan-out study also points at.

## Weaknesses

Metric definitions are missing, so 12.5%, position 8, and top-4 can be briefed as if they were one number. Lead counts are small. `llms.txt` is a stub (“Spice up your website with hot links”) plus a URL list, including a “Copy” slug that looks like an unpublished duplicate. The agency does not control the measurement method it is graded on.

## What to copy or beat

Copy named-client writeups that name the tracker. Beat Chatbeat-dependence by letting the agency export the prompt-level rows (engine, locale, mention, citation URL) so a second analyst can recompute 12.5%. Define position. Require the AI-lead rule before a conversion multiple is exported.

## Inferences, separated

WordPress and Site Kit are observed. Chatbeat’s collection method is unknown. All performance figures are the case study’s claims.

## Sources

- https://chillifruit.com/llms.txt
- https://chillifruit.com/case-studies/ai-search-visibility/
- https://chillifruit.com/robots.txt
- HAR and REA JSON: `rea/har/chillifruit.har`, `rea/json/chillifruit.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/chillifruit.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_b6a96159ba2a50392039c287481e1d1aabdb7e044eb519c82bd301507589ab04`
- Artifact SHA-256: `ec7024f6bd5871e1ef2977bd516289a521127ae4d4e790159de616de7aa562da`
- Artifact bytes: 6829110
- Records: 368
- JSON: `rea/json/chillifruit.json`
- HAR: `rea/har/chillifruit.har`

Highest host counts in the capture (request counts, not unique users): `chillifruit.com` (258), `cdn-cookieyes.com` (56), `www.google-analytics.com` (18), `www.google.com` (13), `static.cloudflareinsights.com` (7), `log.cookieyes.com` (7), `www.googletagmanager.com` (7), `chillifruit.cfolks.pl` (2).

Response `server` header samples: `cloudflare` (241), `Google Tag Manager` (7), `Golfe2` (5).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 200 `https://chillifruit.com/` (text/html; charset=UTF-8)
- ordinal 310: HTTP 200 `https://chillifruit.com/robots.txt` (text/plain; charset=utf-8)
- ordinal 318: HTTP 200 `https://chillifruit.com/llms.txt` (text/plain)
- ordinal 319: HTTP 404 `https://chillifruit.com/llms-full.txt` (text/html; charset=UTF-8)
- ordinal 360: HTTP 301 `https://chillifruit.com/sitemap.xml` (text/html; charset=UTF-8)
- ordinal 361: HTTP 200 `https://chillifruit.com/sitemap_index.xml` (text/xml; charset=UTF-8)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

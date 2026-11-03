# Minuttia

Primary site: [minuttia.com](https://minuttia.com/). Captured 2026-10-14. Offering: agency, plus a free prompt report. The commercial motion is services. The report is a thin measurement product, not a self-serve suite.

## Three-line summary

Minuttia sells strategy, human and AI-assisted content, digital PR, Reddit, and “agent analytics,” aimed at B2B brands that want both classic organic growth and AI visibility. The homepage states a 94% client retention rate as of June 2026 and publishes case-study headlines with organic metrics. A free AEO report page says citations in that report are tracked for Perplexity only. The HAR from this environment is a 403, so the stack was not fingerprinted. `robots.txt` from this network was a SiteGround captcha, not a policy file.

## Offering

The homepage says: “We help brands dominate the future of search—from Google to ChatGPT to whatever comes next” ([homepage](https://minuttia.com/)). Services in the extract: Google and AI search strategy, human content, AI content creation with human review, digital PR for mentions, Reddit marketing, and agent analytics (“See your website the way AI does”). They compare themselves to in-house teams, other agencies, freelancers, and raw AI content. Contact: hello@minuttia.com. A managing director’s note tells prospects to check the portfolio and reviews before hiring.

## GEO methodology

Their framing: SEO is now “search everywhere,” results are visibility rather than only clicks, and the inputs are “content + mentions + brand,” with technical work aimed at “Googlebot + AI agents.” AEO “isn’t replacing SEO.” Tactics named: strategy beyond keyword exports, human-crafted content, programmatic SEO under human review, digital PR without “spammy link building,” and Reddit participation “without spammy tactics.” Agent analytics is described as understanding how AI systems discover and interpret the site. No prompt protocol is published.

## How they measure

The homepage does not specify a tracker. The free report page does ([report](https://minuttia.com/aeo/report/)): “We run your brand through a set of prompts across AI platforms.” Metrics named: Visibility Score, Share of Voice, and Average Position, plus topic, platform, citations, and sentiment. “Citations offer a snapshot of mentions across AI platforms (currently, we only track Perplexity).” “Query fanouts are not available in this report yet.” The same page checks `robots.txt` and looks for `llms.txt`. Prompt count, other engines in the visibility breakout, UI versus API, and a variance estimate are not stated. Case headlines on the homepage remain organic.

## Matching real users

Not discussed.

## Metrics

Homepage figures, as printed:

- “94% Average Client Retention Rate (As of June 2026).”
- “24+ months” average client tenure.
- “5 stars” average Clutch review.
- “60+” across industries. The noun after 60+ was “Across Different Industries & Verticals.”
- A “~63.3%” figure appears without a label in the extract. It is not assigned a meaning here.
- Case headlines: “The Content Process Behind Toggl’s 7M Impressions,” “123.7% Organic Growth for eLearning SaaS,” “The Content Machine That Generated 100,000 Visits for B2B SaaS,” “Helping a B2B SaaS Get From 0 to 100K Monthly Organic Visits.”

These are headlines and retention claims. The underlying posts were not fetched, so date ranges and methods are not restated.

## SEO overlap

The firm’s identity is the overlap. Organic case studies are the proof, and AI is added as a channel (mentions, agents, Reddit) rather than as a replacement scoreboard. That is a coherent agency position and a thin measurement position.

## Pipeline and architecture

**Facts.** Browser requests for `/`, `/services`, `/about`, `/seo`, `/ai`, `robots.txt`, `llms.txt`, and `sitemap.xml` returned HTTP 403 in this environment. REA evidence `ev_559795ecad834cb241ad5e9d74e6d3a79f82a692e3c6f5291eab4f57b8b30447` records 36 entries, almost all the 403 documents plus Google fonts. A separate fetch of `robots.txt` returned a SiteGround captcha page (HTTP 202). The homepage HTML used above came from a fetch path that was not blocked. No generator meta was retained in the 403 HAR.

**Inferences.** None about CMS, CDN, or analytics. A 403 is not a WordPress fingerprint. Do not invent a stack. The captcha on `robots.txt` means an automated agent cannot read their crawler policy from this network.

## Client claims

Toggl is named in a headline. The other case headlines do not name the client in the extract. Retention and Clutch figures are dated or sourced only by the homepage sentence.

## Evals and QA

“Always reviewed and approved by humans” is the content QA claim for AI drafts. No sampling QA for AI visibility was published.

## Security

Not discussed. Digital PR and Reddit work create reputational risk they say they avoid; that is a process claim, not a control list.

## Pricing

Not published.

## Strengths

They keep SEO and AEO as one offer and they put human review on AI content. Retention is dated (June 2026), which is better than an undated percentage. Reddit and digital PR are the off-site half of GEO, which pure trackers do not do. The managing director’s note is a real sales posture: tell the buyer to check references.

## Weaknesses

There is no public measurement design, so “agent analytics” cannot be compared to a platform. The ~63.3% tile is unlabeled. This network cannot retrieve robots or llms policy. Organic headlines will be briefed as AI results if a slide drops the word “organic.”

## What to copy or beat

Copy human review and the explicit “AEO expands SEO” line. Beat the measurement gap with a client-visible prompt log. If agent analytics means crawler logs, say which bots and which status codes. Publish `robots.txt` to ordinary clients; a captcha on the policy file defeats the file.

## Inferences, separated

No stack inference. Unlabeled 63.3% is left unlabeled. Case headlines are not treated as audited studies.

## Sources

- https://minuttia.com/
- https://minuttia.com/aeo/report/
- HAR and REA JSON: `rea/har/minuttia.har`, `rea/json/minuttia.json`
## REA technical evidence

Command run on 2026-10-14, offline, against the committed capture:

`rea inspect-web-network-capture /workspace/rea/har/minuttia.har har --json`

REA does not refetch the recorded URLs. Package observed: rea-agents 6.5.0. Decoder reported by the evidence: `REA HAR capture adapter` `har-schema@2.0.0;jsonc-parser@3.3.1;lossless-json@4.3.1` (`har-schema/lossless-json`).

- Evidence id: `ev_559795ecad834cb241ad5e9d74e6d3a79f82a692e3c6f5291eab4f57b8b30447`
- Artifact SHA-256: `0c05ce4235d1ffb3df5e22b00b91f10873aecebbf6cf58c22a5cbc24feff3c54`
- Artifact bytes: 967767
- Records: 36
- JSON: `rea/json/minuttia.json`
- HAR: `rea/har/minuttia.har`

Highest host counts in the capture (request counts, not unique users): `fonts.gstatic.com` (18), `minuttia.com` (9), `fonts.googleapis.com` (9).

Response `server` header samples: `nginx` (9), `ESF` (9).

Document rows retained in the index (ordinals are the HAR entry order REA preserves):

- ordinal 0: HTTP 403 `https://minuttia.com/` (text/html)
- ordinal 20: HTTP 403 `https://minuttia.com/robots.txt` (text/html)
- ordinal 24: HTTP 403 `https://minuttia.com/llms.txt` (text/html)
- ordinal 28: HTTP 403 `https://minuttia.com/llms-full.txt` (text/html)
- ordinal 32: HTTP 403 `https://minuttia.com/sitemap.xml` (text/html)

Capture limits that bind every conclusion in this report: unauthenticated public pages only; image, media, and font requests aborted; cookie and authorization headers stripped; non-document response bodies omitted; document bodies longer than 350,000 characters omitted; this environment received HTTP 403 from Otterly and Minuttia; illegal HAR 1.2 URI characters were percent-encoded on the AthenaHQ, Optimist, and Semrush captures before validation. The marketing site is not the measurement worker.

# Competitor Matrix

Source: the 21 reports in `geo-reports-pdf-md/` (captured 2026-10-14, public pages and HAR files only). Nothing here comes from inside a vendor's logged-in app.

Tags:
- **[S]** the vendor's own page states it.
- **[I]** an inference from the report, not a vendor statement.
- **n/s** the report says the page did not state it.

Marketing site stacks (Next.js, Webflow, Framer, WordPress) are left out. They tell us nothing about how the measurement workers run.

---

## 1. Platforms (the real competitors)

| Vendor | Public price floor | Engines | How answers are collected | Draws and variance | Locale | Where prompts come from | Action layer |
|---|---|---|---|---|---|---|---|
| **Profound** | Free 7 day trial (50 prompts, 3 engines). Enterprise custom [S] | Up to 9: ChatGPT, Perplexity, Claude, Copilot, AIO, AI Mode, Gemini, Grok, DeepSeek [S] | Browser capture of consumer front ends, explicitly not API [S]. Logged out vs profiled: n/s | Daily runs. Draws per day n/s. No margin of error | 30+ languages, 150+ regions [S] | Generated from brand config, manual upload, "Prompt Volumes" panel of real user prompts [S] | Agents draft and stage CMS edits, sponsored answer creative [S] |
| **Evertune** | Pro $800/mo, 100,000 prompts, 11 models [S] | 9 named in llms.txt [S] | API for what the model already knows (parametric). Consumer app for what it retrieves [S] | 100 draws per prompt in their worked example, with published ± margins [S]. Whether every Pro prompt gets 100 draws: n/s | "Global" [S] | EverPanel, claimed 150M real conversations [S] | Content Studio, affiliate partners, ads through The Trade Desk [S] |
| **Peec** | Tier names and prompt counts (50/150/350, 3 models each). Currency n/s [S] | Up to 13 on Enterprise [S] | UI scraping of a logged-out browser, not vendor APIs [S] (docs) | Daily. Draws n/s | Country, language, region, persona are config fields [S] | Suggestions from keywords. Ordinal 1 to 5 demand score [S] | Gap analysis, earned vs owned actions, agent skills, robots audit across 40+ AI bots [S] |
| **AthenaHQ** | Starter $295/mo, 3,600 credits. 1 credit = 1 response [S] | 11 on Starter [S] | n/s | n/s | Multi country is Enterprise only [S] | QVEM volume model [S]. Method not reproduced [I] | ACE content agents, robots and llms.txt management, claim review [S] |
| **Scrunch** | Core $250/mo, 125 prompts, 5,000 responses [S] | Core 4. Enterprise adds Claude, Gemini, Meta, AI Mode, Grok [S] | Browser automation and official APIs, chosen per platform. Which platform gets which: n/s [S] | New prompts daily for 14 days, then every 72 hours [S] | Core: 1 country, 1 persona [S] | n/s | Fan out tracking [S] |
| **Goodie** | Core $295/mo, 110 prompts [S] | Core 5. Enterprise up to 13 including shopping assistants [S] | "Daily scaled intentional prompting". UI vs API n/s | n/s | Core: 2 countries, 2 languages [S] | n/s | Action credits, Brand Command fact checks [S] |
| **Otterly** | Lite $29/mo, 15 prompts [S] | Base 4. Claude, Gemini, AI Mode are add ons [S] | n/s | Daily | 50+ countries [S] | Model generated [S] | n/s |
| **Rankscale** | Pro $99/mo, 1,200 credits [S] | GUI and API engines priced separately [S] | Price card separates GUI engines from API engines with credit weights (ChatGPT 0.25, Claude 2) [S] | Cadence hourly to monthly. Repeats n/s | "All" regions [S] | Model generated [S] | Content suggestions, not full articles [S] |
| **Bluefish** | Demo only | 10+, including Alexa shopping [S] | n/s. "Static prompts" and "model drift controls" named [S] | Daily | Custom audiences [S] | n/s | Accuracy product with a claimed 91% agreement with human review. Protocol n/s [S] |

## 2. SEO suites with an AI module

| Vendor | Price | Engines | Collection | Notable |
|---|---|---|---|---|
| **Conductor** | Per engine credit table published. Dollar price n/s [S] | ChatGPT (Auto and Search), Claude Sonnet, Gemini, AI Mode, AIO, Grok, Copilot, Perplexity [S] | Official APIs "wherever possible". Argues scraping is fragile and a ToS risk [S] | Refuses to invent AI prompt volume [S]. Sentiment on a 1 to 10 scale [S]. MCP plus data API (AgentStack) [S] |
| **SE Ranking** | 200 prompts $89/mo, 1,000 at $345 [S] | AIO, AI Mode, ChatGPT, Gemini, Perplexity [S] | "Direct UI based monitoring", "not API shortcuts" [S] | Only vendor that publishes its visibility formula: position weighted, best position only, citations kept out [S]. Stores cached answers [S] |
| **Ahrefs Brand Radar** | Check packs from $50/mo [S] | 6 to 7 [S] | Free public web interfaces (methodology post) [S] | Questions built from keyword graph and People Also Ask [S]. Estimated impressions weighted by search volume [S] |
| **Semrush** | $99/domain/mo, 25 prompts [S] | ChatGPT, Google AI, Gemini, Perplexity [S] | n/s | Claims a 289M prompt corpus [S] |
| **BrightEdge** | n/s | ChatGPT, Perplexity, AIO, AI Mode, Gemini [S] | n/s | Splits mentions from citations. Shows rank and traffic of the cited URL [S] |

## 3. Agencies (sell judgment, rent the tracker)

| Agency | Price | Tracker used | Worth taking |
|---|---|---|---|
| **Optimist** | Roadmap from $2,500. Advisory from $3,000/mo [S] | Unnamed | Fan out study: 199 prompts, 5 surfaces, 1,708 SERPs. Pages ranking for the model's own follow up queries explain citations about 5x better than random [S]. CORE 21 factor audit rubric [S] |
| **iPullRank** | $30K to $500K+ engagements [S] | Profound partnership [S] | Tells buyers one screenshot is an anecdote [S] |
| **Siege Media** | n/s | Peec (11 prompts in their own example) [S] | Reports a 53% visibility score on 11 prompts. A cautionary tale on denominators [I] |
| **Chilli Fruit** | n/s | Chatbeat [S] | Case study names the client, tracker, and months [S]. Good template for reporting |
| **Minuttia, Intero Digital** | n/s | Unstated | Little reusable method |

---

## 4. Patterns that matter for us

1. **The UI vs API split is the main argument in this market.** Profound, Peec, SE Ranking, and Ahrefs say UI. Conductor says API. Evertune says both, for different questions. **Nobody publishes the same prompt run through both on one chart** [S, from SYNTHESIS]. We can.
2. **Nobody shows an error bar on a customer's score** [S]. Evertune publishes a teaching example and nothing more. Our existing Wilson CI already beats the market on this.
3. **Model version is not tracked as a dimension by anyone** [S]. A model update can look like a ranking change.
4. **"Persona" is undefined everywhere.** Nobody says whether it means a prompt prefix or a real account history [S]. We will state ours plainly: it is prompt phrasing, not a personalized account.
5. **Fan out queries plus cited URL rank are the only causal-ish mechanism in the set** (Optimist, BrightEdge, Rankscale) [S]. Our gap analysis should store fan out queries, not just citations.
6. **Prompt demand numbers are not comparable across vendors** (QVEM, Prompt Volumes, EverPanel, Ahrefs volume) [S]. We should label every prompt with where it came from and never present one "AI search volume" figure.
7. **Fact checking against a customer truth set** is a common enterprise feature (Profound FactCheck, Peec, Goodie, Bluefish) [S]. The existing `seed/facts.ts` is the start of ours.
8. **Higher ed is not a vertical any of them serve specifically** [I]. None of the 21 reports mentions IPEDS, programs, rankings sources, or admissions seasonality.

## 5. Price anchors for leadership

What UNC Charlotte would pay a vendor for roughly our planned scope (100 prompts, 6 engines), from stated prices:

- Scrunch Core: $250/mo for 125 prompts, 4 engines, 1 country, 1 persona [S]
- AthenaHQ Starter: $295/mo for 3,600 responses. 100 prompts × 6 engines × 3 draws × 2 scans a month = 3,600 [arithmetic]
- Goodie Core: $295/mo for 110 prompts, 5 engines [S]
- Evertune Pro: $800/mo [S]
- Profound Enterprise: custom [S]

Realistic vendor budget for our scope: **about $3,000 to $10,000 a year** at the self serve tier, more at enterprise [I]. That is the number our in house build has to justify against, including staff time.

## 6. What we did not verify

- Any vendor's real draw count or runner per engine. Their pages do not say.
- Whether "UI capture" claims are true. The HAR files only show marketing sites.
- Current pricing after 2026-10-14.

# GEO Playbook for UNC Charlotte

What the research says, how strong it is, what it means for a university, and how this platform tests it on our own data.
Sources: the five articles Shailesh collected (2026-11-04) and the vendor reports in `geo-reports-pdf-md/`.

## 1. Evidence grades

Most GEO numbers come from vendors who sell GEO. Treat them as hypotheses, not laws.

| Grade | Meaning | Examples |
|---|---|---|
| A | Peer reviewed or controlled | Princeton GEO paper (KDD 2024). Note: tested on a simulated engine, not live ChatGPT |
| B | Large observational study, method published | Ahrefs 75K brand correlation, Ahrefs schema controlled test |
| C | Vendor study, method thin | Yext 17.2M citations, Muck Rack 84% earned media, Search Engine Land answer capsule audit |
| D | Anecdote or marketing claim | Most "x times more citations" headlines |

None of the studies cover higher education. **Our platform is how we find out what holds for universities.**

## 2. What the research claims

| Claim | Grade | Higher ed translation |
|---|---|---|
| Third party mentions beat your own pages. Brand web mentions correlate 0.664 with AIO visibility, backlinks 0.218 | B (correlation) | Rankings sites, news coverage, Wikipedia, Niche, Reddit threads, and partner sites matter more than another program page |
| Structured, verified listings make up about 55% of distinct cited sources | C | Directory profiles: Niche, College Scorecard, BigFuture, Common App, US News, Princeton Review, Peterson's, Google Business Profile. Keep core facts consistent everywhere |
| Engines differ. Low overlap of cited domains between engines | B | Track each engine as its own surface. Never one blended score |
| ChatGPT search leans on Bing's index | C | Check Bing indexing for key pages |
| Perplexity and Claude cite community and review content more | C | Reddit (r/college, r/UNCCharlotte, r/gradadmissions), YouTube campus and program videos |
| Original statistics lift visibility (about +41%) | A (simulated engine) | We produce research. Lead pages with one sourced number |
| Named expert quotes (about +37%) and credible outbound citations (about +31%) | A (simulated engine) | Faculty experts quoted by name and role. Link to .gov and peer reviewed sources |
| "Best X for Y" listicles dominate citations | C | Get UNC Charlotte into third party lists like "best energy engineering programs in the Southeast". Be careful publishing our own comparisons that name peers. Needs comms approval |
| Answer capsule: question H2, 20 to 25 word self-contained answer, early in the page | C | Program and FAQ pages: question headings, direct answer first |
| llms.txt shows no measurable lift | C | Ship it, low effort. Do not report it as a win |
| Schema showed no citation lift in a controlled test | B | Schema is identity hygiene (CollegeOrUniversity, Person for faculty), not a ranking lever |
| Robots and rendering block citations mechanically | B | Allow OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Bingbot. Server render key pages. Fast first byte |

## 3. Measurement rules we adopt (from the AfterLaunch pieces, already in our architecture)
- Record engine, mode, whether search ran, date, and region with every answer.
- Keep API results and consumer app results apart.
- A missing mention is an observation, not a diagnosis. Read the sources first.
- Make one change, record it, and compare repeated answers on the same prompt set before claiming credit.
- Keep branded and category prompts separate.

## 4. What we will not do
The Google AI Mode answer Shailesh pasted suggests stealth plugins, proxy rotation, and CAPTCHA bypass. We don't do any of those. It breaks terms of service, and a public university should not be doing it. Measurement uses DataForSEO, official APIs, and the parity-gated local SERP service.

## 5. The levers, as recommendation types

Phase 7 recommendations must carry one of these types, so the team knows who owns the work:

| Type | Owner | Example |
|---|---|---|
| `technical` | Web team | Unblock OAI-SearchBot, fix JS-only page, Bing indexing |
| `on_page` | Content team | Answer capsule, lead statistic, expert quote, outbound sources, freshness |
| `truth_layer` | Comms plus IR | Fix inconsistent enrollment or ranking facts across directories, Wikipedia, Wikidata |
| `listing` | Admissions marketing | Claim and complete Niche, BigFuture, etc. |
| `earned_media` | Media relations | Pitch the authors of lists and articles that cite peers but not us |
| `community` | Social team | Helpful, disclosed answers in Reddit threads where students ask the prompt |
| `original_data` | Research comms | Turn a research result into a citable statistic page |

## 6. How the platform tests these claims on our data
1. Classify every cited page (Phase 6): source class, listicle or not, answer capsule present, statistics count, named quotes, outbound credible links, freshness, schema.
2. Compare pages cited for prompts we win against prompts we lose (Phase 7). Report which features differ, with n.
3. Track off-site mentions over time with Content Analysis and compare against visibility trends (Phase 6).
4. Pre-register every shipped recommendation and test it on the next scans (Phase 5 statistics).

After a semester of scans, we will have higher ed specific evidence no vendor has. That is the publishable result.

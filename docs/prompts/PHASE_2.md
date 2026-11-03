# Phase 2 prompt: Onboarding and site audit (higher ed aware)

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phase 1 must be merged.

Goal: a user enters a root URL (charlotte.edu) and gets a confirmed entity profile, a host list, a crawl, and an AI readiness audit.

## Build

1. **Discovery** (`crawl.discover` job). robots.txt, every sitemap (including indexes), internal links from the home page and sitemap pages, certificate transparency via crt.sh (polite, cached), and hosts seen in sitemaps. Store in `site_hosts` with `discovered_via`. Screen: the user includes or excludes each host before crawling. Default excluded: hosts that do not resolve, return 4xx/5xx at root, or are login portals.
2. **Crawl** (`crawl.page` job). Crawlee with Playwright. Respect robots.txt, 4 concurrent per host, polite delay, identifying user agent with a contact URL, page cap per host (configurable). SSRF guard from ARCHITECTURE 13. Store in `crawl_pages`: url, canonical, status, title, H1, headings (H2/H3), meta description, word count, lastmod, JSON-LD schema types and raw, FAQ blocks, outbound links, render mode (static vs JS, detected by comparing raw HTML text to rendered text), content hash. Page text through the raw store.
3. **Entities.** Propose institution name, aliases (UNC Charlotte, UNCC, Charlotte 49ers, University of North Carolina at Charlotte), colleges, programs and degrees, research centers, rankings claims, locations, from schema, headings, and navigation. Deterministic extraction first, LLM only to group and label, with the source URL on every item. The user confirms each. "Charlotte" alone is stored with `requires_context = true`.
4. **Peers.** Suggest competitors from College Scorecard and IPEDS (same Carnegie class, region, program overlap), each with the reason. The user edits. Store `ipeds_unitid`.
5. **Entity consistency** (`entity.check` job). Compare name, founding year, location, type, website, and enrollment across Knowledge Graph Search API, Wikidata, Wikipedia, IPEDS, and the confirmed profile. Store `entity_checks` with match, mismatch, or missing.
6. **AI bot hits.** Upload a server or CDN access log (common and combined formats, plus Cloudflare JSON). Parse into `bot_hits` with a maintained list of 40+ AI user agents (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, ClaudeBot, Claude-User, Claude-SearchBot, Google-Extended, Applebot-Extended, Bytespider, CCBot, meta-externalagent, Amazonbot, and others). The file is hashed and parsed locally. Only bot rows are stored. No visitor IPs.
7. **Audit rules** (`audit.run` job), each with `why` and `evidence_strength`:
   - AI crawler access in robots.txt per host, per user agent.
   - Schema coverage: CollegeOrUniversity, EducationalOccupationalProgram, FAQPage, Course, Event, Organization sameAs.
   - FAQ blocks, freshness (lastmod and visible dates), JS only content, thin pages, duplicate titles and H1s, missing meta descriptions, broken canonicals.
   - PageSpeed Insights for the top pages per host (API key, rate limited, cost free but counted).
   - llms.txt presence (evidence_strength: speculative, labeled "low evidence of impact").
   - Entity mismatches from step 5.
8. **Screens.** Onboarding wizard (URL, hosts, entities, peers). Audit report filtered by host, severity, and rule, with page drilldown. Bot hits table by bot and path.

## Tests

Discovery on fixture robots and sitemaps. crt.sh parser on a stored response. SSRF guard rejects private IPs and redirects to them. Render mode detection on fixtures. Each audit rule on a fixture page. Log parser on sample lines for each format. End to end: fixture site served locally, onboard, crawl, audit, report.

## Do not

Crawl hosts the user excluded. Ignore robots.txt. Store visitor IPs from logs. Start Phase 3.

## Verification gate

1. Typecheck, lint, tests pass.
2. Run on charlotte.edu with a small page cap (for example 200 pages): host list, entity profile, audit report all render. Paste counts by host and severity.
3. A rerun of the audit on the same crawl gives identical findings.
4. Every audit finding shows why and evidence strength.
5. Existing pages still load.

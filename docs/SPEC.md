# GEO Platform Spec

Product: an in house AI search visibility platform for UNC Charlotte, built so other universities could use it later.
Read with: `docs/ARCHITECTURE.md` (how) and `docs/COMPETITOR_MATRIX.md` (why).

Phase 0 (research and architecture) is **done**. Phases below run one per Cursor chat, in this order:

**1 → 2 → 3 → 5 → 6 → 4 → 7 → 8 → 9**

Phase 3 comes before 4 because prompt generation is worthless if capture is wrong. Phase 6 comes before 7 because gap analysis needs stored cited pages.

---

## User facing features (the 10 objectives, mapped)

| # | Objective | Phase |
|---|---|---|
| 1 | Campaigns with their own prompts and dashboard | 1, 9 |
| 2 | Personas, generated prompts, user review, custom prompts, informed by Trends and keywords | 4 |
| 3 | ChatGPT, Claude, AIO, AI Mode, Gemini, Perplexity, as users see them. Trends, keywords, Exa | 3, 4 |
| 4 | Response and citation analysis with highlighting | 6 |
| 5 | Gap analysis where we do not appear: common citation traits, headline terms, FAQs, content type | 7 |
| 6 | Research led content strategy for upcoming campaigns | 8 |
| 7 | "x of 100 prompts" over time, automated biweekly or monthly | 5 |
| 8 | Region selection | 3, 5 |
| 9 | Start with audit and analysis | 2 |
| 10 | Enter a website, detect name, subdomains, higher ed entities | 2 |

---

## Phase 1: Foundation
Prompt: `docs/prompts/PHASE_1.md`.
Postgres, Drizzle, full schema from ARCHITECTURE section 3, SQLite migration, campaigns, prompt set freezing, pg-boss worker skeleton, minimal auth. Existing screens keep working.

## Phase 2: Onboarding and site audit
- Enter root URL. Discover hosts from robots.txt, sitemaps, internal links, certificate transparency (crt.sh). User picks which hosts to include.
- Crawl with Crawlee and Playwright, polite, respecting robots.txt. Fill `crawl_pages`.
- Detect institution name, aliases, colleges, programs, research centers. User confirms. "Charlotte" alone is stored as requires_context.
- Suggest peers from College Scorecard / IPEDS (same Carnegie class, region, program overlap). User edits.
- Audit rules, each with `why` and `evidence_strength`: AI crawler access in robots.txt (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended and others), schema coverage (CollegeOrUniversity, EducationalOccupationalProgram, FAQPage, Course, Event), FAQ blocks, freshness, JS only content, thin pages, duplicate titles, llms.txt (evidence_strength: speculative).
- Audit screen filtered by host and severity.

## Phase 3: Capture layer
- Fill `docs/PROVIDERS.md` first: for each engine, which providers exist today, method, location support, price per call, ToS notes. Use web search. Ask for approval before coding adapters.
- Implement the adapter interface from ARCHITECTURE 5.1. Existing SerpAPI code becomes the first adapter.
- Runners, fidelity labels, region handling, calibration job, parametric sample, as in ARCHITECTURE 5.
- Judge extended with character spans for mentions, citations, claims.
- Manual paste stays.

## Phase 5: Scans, schedules, measurement
- Estimate then approve then run. Budget caps per scan and per month.
- Biweekly or monthly schedules locked to a frozen prompt set.
- Metrics from ARCHITECTURE 6: prompts won with CI, mention rate, citation rate, share of voice per index, position, consistency, accuracy. Cluster bootstrap. McNemar comparison between scans.
- `docs/METRICS.md` with every formula and its unit test.

## Phase 6: Response and citation analysis
- Answer view: full text with brand and competitor spans highlighted, citations listed with source class, claims with verdicts, fan out queries.
- Fetch every new cited URL once into `cited_pages`.
- Citation dashboards: top domains per engine, source class mix, which of our pages get cited and for which prompts.

## Phase 4: Personas and prompt generation
- Persona library seeded for higher ed. Custom personas.
- Demand first: Google Trends, keyword volume, PAA, autocomplete, related searches, Exa. Store in `demand_signals`.
- Generate conversational prompts per persona, tagged with intent, funnel stage, branded, provenance, and evidence.
- Embedding dedupe. Review queue. Nothing runs until approved. At least 70% unbranded by default.

## Phase 7: Gap analysis
ARCHITECTURE section 9, steps 1 to 6. Every recommendation has evidence rows and a pre-registered target.

## Phase 8: Content strategy
ARCHITECTURE section 9, last paragraph. Saved as `strategy_reports`.

## Phase 9: Frontend
shadcn/ui. Screens: Onboarding, Audit, Campaigns, Campaign dashboard, Prompt review, Answer explorer, Gaps, Strategy, Settings (providers, budgets, schedules, eval scores). Every chart shows n, runner mix, and interval. PDF and CSV export for leadership.

---

## Definition of done (every phase)
- Typecheck, lint, and tests pass. At least one end to end test of the main flow.
- No secrets in code. `.env.example` updated.
- Every new paid call goes through the cost guard.
- `docs/CHANGELOG.md` updated: what changed, what is still medium fidelity, estimated, or unverified.
- Old data still renders.

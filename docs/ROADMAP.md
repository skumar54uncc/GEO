# Roadmap

Date: 2026-11-03. Read with `docs/SPEC.md` (what, per phase) and `docs/ARCHITECTURE.md` (how). If this file conflicts with those two, they win.

The goal: measure how AI answer engines describe UNC Charlotte, as real users see them, explain why we do or do not appear, and recommend content whose effect we can test. Honest numbers first. Every rate has n and a 95% interval.

---

## 1. Objectives, phase, and acceptance test

| # | Objective | Phase | Done when |
|---|---|---|---|
| 1 | Campaigns with their own prompts, engines, regions, personas, schedule, dashboard | 1, 5, 9 | Two campaigns exist side by side, each with its own frozen prompt set and its own dashboard. Scans of one never appear in the other |
| 2 | Personas, generated prompts, user review, custom prompts, informed by Trends and keywords | 4 | A user picks personas, generates prompts, sees the demand evidence on each, edits or rejects, adds custom ones, and only approved prompts can be frozen |
| 3 | ChatGPT, Claude, AI Overview, AI Mode, Gemini, Perplexity, as users see them. Plus Trends, keywords, Exa | 3, 4 | Every draw shows its runner and fidelity. Each engine has at least one working adapter. Calibration agreement is shown for every medium fidelity runner |
| 4 | Analyze responses and citations, highlight headlines | 6 | Answer view highlights brand and competitor spans, lists citations with source class, and shows each cited page's title, H1, and H2s |
| 5 | Gap analysis where we do not appear: common citation traits, headline terms, FAQs, content type | 7 | For every prompt not won, a recommendation card with headline terms, FAQs, format, target page, and the evidence rows that produced each item |
| 6 | Research led content strategy for upcoming campaigns | 8 | A strategy report for a new topic that runs demand, a sample scan, supply, and gaps before it suggests anything. Every idea links to evidence |
| 7 | "x of 100 prompts" over time, automated biweekly or monthly | 5 | A scheduled scan runs under budget without a click, and the dashboard shows "41 of 100 (95% CI 32 to 51)" and a McNemar label against the previous scan |
| 8 | Region selection | 3, 5 | Each draw records region requested and region honored. Dashboards filter on honored regions and say so |
| 9 | Start with audit and analysis | 2 | An audit report for charlotte.edu with findings by host and severity, each with why and evidence strength |
| 10 | Enter a website, detect name, subdomains, higher ed entities | 2 | Entering charlotte.edu lists discovered hosts for the user to include, and proposes name, aliases, colleges, programs, and peers for confirmation |

---

## 2. What makes this better than the vendors

From `docs/COMPETITOR_MATRIX.md` and `geo-reports-pdf-md/SYNTHESIS.md`. Each line names what is missing in the market and where we build it.

| Advantage | Vendor state (from the reports) | Phase |
|---|---|---|
| Error bars on every customer number | Only Evertune publishes margins, as a teaching example | 5 |
| Same prompt through UI and API, on one chart | Nobody publishes a paired sample | 3 |
| Model version as a series break | Nobody tracks it | 5 |
| Honest persona definition (prompt wording, not a logged in account) | Undefined everywhere | 4 |
| Published visibility formula with a unit test | Only SE Ranking publishes one | 5 |
| Fan out queries joined to Google rank | Optimist ran a study. No tool lets the customer test it | 3, 7 |
| Pre-registered before and after on content | Agencies claim lifts without denominators | 7 |
| Higher ed depth: IPEDS peers, rankings source class, admissions seasonality, programs, city vs university | No vendor serves higher ed specifically | 2, 4, 6, 8 |
| Business outcome: AI referral traffic from GA4, real queries from Search Console | Not joined to visibility by anyone in the set | 4, 9 |
| AI bot hits from our own server logs | Profound, Peec offer it via CDN integrations | 2 |
| Raw data ownership. Every number recomputable | Vendors keep raw data | 1 |

Where we do not compete: real user prompt panels, breadth of engines and regions, enterprise certifications, shopping assistants.

---

## 3. Feature list by phase (beyond the base spec)

**Phase 1 Foundation.** Local only Postgres, immutable raw store with file backing for big payloads, `audit_log`, backup and restore, CI.

**Phase 2 Onboarding and audit.** AI crawler access for 40+ user agents. Bot hits from uploaded logs. Entity consistency (Knowledge Graph, Wikidata, Wikipedia). PageSpeed for key pages. Program catalog extraction. Peer suggestions from IPEDS and College Scorecard.

**Phase 3 Capture.** Verified `PROVIDERS.md`. Adapters for every engine. Calibration series. Parametric series. Judge spans, list position, sentiment with rationale. Local SERP adapter behind parity. Canary prompt.

**Phase 5 Scans and measurement.** Estimate, approve, run. Schedules. Prompts won, mention rate, citation rate, share of voice, position, first mention rate, consistency, accuracy. Branded kept separate. McNemar between scans. Alerts. Model event annotations. Dashboard v1.

**Phase 6 Answers and citations.** Answer explorer with highlights. Cited page fetch with headlines, FAQ, schema, content type. Citation dashboards.

**Phase 4 Personas and prompts.** Higher ed persona library. Demand from Trends, keyword volume, PAA, autocomplete, related searches, Search Console, Exa. Seasonality calendar. Review queue. Embedding dedupe.

**Phase 7 Gap analysis.** Headline term lift (log odds with an informative Dirichlet prior, so rare terms are not overstated). FAQ mining. Content type and structure comparison. Fan out to rank join. Closest owned page by embedding. Pre-registered recommendation cards.

**Phase 8 Content strategy.** Demand, sample scan, supply, gaps, then a plan scored by demand × gap × effort with owner and publish by date.

**Phase 9 Polish and exports.** Full campaign dashboard, leadership PDF and CSV, read only API.

**Later.** `docs/PUBLIC_LAUNCH.md`.

---

## 4. UI rules

- Every metric is written as: **"41 of 100 prompts (95% CI 32 to 51), n = 300 draws, runner: UI, fidelity: high"**.
- Cells with fewer than 30 draws are greyed and labeled "too few draws".
- Runners and indexes are never on one blended line. Different runners get separate series.
- A trend line only connects scans on the same prompt set hash. A version change draws a visible break.
- Model events draw as vertical annotations.
- Persona screen states: "A persona changes how the prompt is written, not who is logged in."
- Region filters say "only draws where the engine honored the region".
- Engine answers and cited page text are shown as escaped text with highlights, never as raw HTML.

Navigation (built up phase by phase): Overview, Campaigns, Prompts, Scans, Answers, Citations, Gaps, Strategy, Audit, Settings.

---

## 5. Model roles

| Role | Does | Never does | Eval |
|---|---|---|---|
| Generator | Writes candidate prompts from personas and demand evidence | Approves its own prompts | Human review rate, dedupe rate |
| Judge | Mentions, citations, claims, sentiment, with spans | Writes recommendations | Gold set, precision and recall ≥ 0.95 |
| Writer | Drafts recommendation and strategy text from evidence rows | Scores visibility | Every claim links to an evidence row |

Deterministic alias matching runs before the judge. The judge only resolves ambiguous cases ("Charlotte" alone, shared stems with competitors).

---

## 6. Verification gates

Every phase prompt ends with a gate. A phase is done only when the gate passes and the results are pasted into the reply and `docs/CHANGELOG.md`. Common items:

1. `npm run typecheck`, `npm run lint`, `npm test` pass.
2. One end to end test of the phase's main flow.
3. Every existing page still loads with existing data.
4. No paid call outside the cost guard (a test asserts adapters call the guard).
5. No UPDATE on immutable tables (trigger test still passes).
6. `.env.example` lists every new variable.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Google blocks the local SERP service (already seen in openserp logs) | Paid SERP provider stays primary. Local only after parity |
| Campus network policy for automated Google queries | Ask IT before running local SERP from campus |
| UI capture providers change or disappear | Adapter interface, fallback runner, calibration series |
| Provider prices change | Phase 3 rechecks every price. Cost guard refuses over budget |
| Small cells read as findings | Greyed cells, intervals everywhere, McNemar labels |
| Judge drift | Gold set rerun on every judge prompt change |
| Prompt injection from cited pages | Section 13 of ARCHITECTURE |

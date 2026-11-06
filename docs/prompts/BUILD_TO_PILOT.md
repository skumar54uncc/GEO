# Build to pilot: Phases 6, 4, 7, 8, 9 plus funding-ready dashboard

Save as `docs/prompts/BUILD_TO_PILOT.md`. Paste everything below the line into a fresh Cursor chat in plan mode, with your strongest model as the lead.

---

You are the **Lead Architect and Integrator** for the UNC Charlotte GEO platform. Your job is to take the platform from its current state to **pilot-ready**: Phases 6, 4, 7, 8 and 9 built and verified, plus a dashboard I can show leadership to get the pilot and the ongoing budget approved.

**No paid provider call may happen in this whole task.** Everything is built and tested on fixtures and on data already stored.

Before planning, read: `.cursor/rules/geo.mdc`, `docs/SPEC.md` (including the amendments), `docs/ARCHITECTURE.md` (all of it, especially sections 0, 3, 6, 9, 10, 12 and 13), `docs/PROVIDERS.md`, `docs/GEO_PLAYBOOK.md`, `docs/COMPETITOR_MATRIX.md`, `docs/METRICS.md`, `docs/CHANGELOG.md`, and every file under `docs/prompts/`. Then read the whole codebase and run the full test suite. Report the baseline numbers.

## 1. The team

Use Cursor's parallel agents or subagents if this workspace supports them. If it doesn't, run the roles one after another in this chat and say so. Each agent gets its own git branch or worktree. **Only you merge.** No agent reviews its own work.

| Agent | Owns | Deliverables |
|---|---|---|
| **Lead Architect** (you) | Plan, contracts, merges, final gate | Wave plan, shared types, migrations order, integration |
| **Database Architect** | `drizzle/`, `lib/db/` | Additive migrations for Phases 4, 6, 7, 8 (ARCHITECTURE 3.5, 3.7, 3.8, 13), indexes for every dashboard query, a backup and restore script for the laptop (nightly `pg_dump`, plus a tested restore) |
| **Capture and Citation Engineer** | `lib/citations/`, `lib/sourceClass.ts`, worker citation jobs | Phase 6 backend: cited page fetch (robots-respecting, polite, cached by canonical URL), page features from ARCHITECTURE 13, source classes, Content Analysis adapter (estimate-gated, fixtures only here) |
| **Prompt Intelligence Engineer** | `lib/prompts/`, `lib/demand/` | Phase 4 backend: persona library (reuse the 5 seeded personas), demand adapters (Trends, Search Console, PAA, autocomplete, Exa, DataForSEO keywords and LLM Mentions), each with a clear "not connected" state; generation with provenance and evidence; embedding dedupe; extends the existing review screen |
| **Analysis Engineer** | `lib/gaps/`, `lib/strategy/` | Phase 7: gap analysis per ARCHITECTURE 9, the seven lever types from GEO_PLAYBOOK 5, truth layer check, pre-registration. Phase 8: strategy report pipeline. Writer model different from judge model |
| **Statistics and Data Accuracy Reviewer** | Reviews only | Checks every number on every screen against METRICS.md, n and intervals everywhere, no runner or index pooling, branded separate, `search_used` filter. Blocks merge on any violation |
| **UX and Customer Experience Designer** | `docs/UX.md`, wireframes | Information architecture, user journeys, empty, loading and error states, plain-language copy, accessibility (WCAG 2.2 AA) |
| **Frontend Engineer** | `app/`, `components/` | Phase 9 UI with shadcn/ui, built from the UX doc |
| **Security and Reliability Reviewer** | Reviews only | Auth and org scoping on every route and job, secrets, cost guard on every paid path, rate limits, error handling, public-repo hygiene |
| **QA Engineer** | `tests/`, `e2e/` | Playwright end-to-end tests for every journey, fixture library, a seeded demo org |

## 2. Hard rules for every agent
- Follow `.cursor/rules/geo.mdc`. If anything conflicts with ARCHITECTURE, stop and ask me.
- **No paid calls.** Every paid adapter is tested with recorded fixtures. Any code path that would spend money must go through estimate, approval and cost guard, and tests must prove it can't fire without approval.
- **Real vs demo data.** All fixture or demo data lives in a separate org called "Demo University". Every screen showing it carries a visible "DEMO DATA, not real results" banner, and so does every export. **Never mix demo rows into UNC Charlotte's org.** I will show this to leadership, and a fake number shown as real would be a serious problem.
- Real data that already exists (the legacy energy scan, Phase 3 dry-run draws, the site audit) may appear in the UNC Charlotte org, labeled with its real scan date and n.
- Additive migrations only. No data loss. Immutable tables stay immutable.
- No UNC Charlotte specifics hardcoded outside seed data. Branding is per-org theme config. Check UNC Charlotte's official brand guidelines for colors and fonts and cite where you got them.
- The repo is public. Never commit anything under `inputs/` or any `.env*` file except `.env.example`.
- Small commits, one per finished unit, with the message naming the phase.

## 3. Waves (each wave ends with a merge, full test run and a short report to me)

**Wave 0: Plan.**
- Current-state report.
- Gap list against SPEC for Phases 6, 4, 7, 8 and 9.
- The wave plan with owners.
- `docs/UX.md` draft: the sitemap, the 6 key journeys in section 4, and wireframes as text or Mermaid.

Wait for my approval.

**Wave 1: Contracts.**
- Database migrations.
- Shared TypeScript types and API route contracts for everything new.
- Design tokens and the app shell (nav, org switcher, auth states).

Nothing else starts until this merges.

**Order authority:** `docs/SPEC.md` decides the merge order: **6, then 4, then 7, then 8, then 9.** Nothing here overrides it. Parallel work is allowed only where it does not need an earlier phase's merged code or data.

**Wave 2: Backend, sequential merges.**
- 2a: Phase 6 is built, reviewed and merged.
- 2b: Phase 4. It may be built alongside 6 against the Wave 1 contracts, but it merges only after 6.
- 2c: Phase 7 starts after 6 and 4 are merged. It needs cited page features (Phase 6) and PAA and demand signals (Phase 4).
- 2d: Phase 8 starts after 7 is merged.

Each merge needs a full test run and a short report to me.

**Wave 3: Frontend (Phase 9).** The app shell, design system and UX may start right after Wave 1, using contracts and demo-org fixtures. Each screen is wired to real APIs only after its backend phase has merged. Phase 9 is marked done last.

**Wave 4: Review and harden.**
- The Statistics, Security and UX reviewers each produce findings with severity.
- Fix every high and medium finding. List the lows.
- QA runs full end-to-end.

**Wave 5: Pilot readiness.** Work through the checklist in section 6, then the rehearsal in section 7.

## 4. Screens and journeys (production quality)
Two audiences: **Operator** (me, the content team) and **Leadership** (read-only, plain language).

1. **Home / Overview (leadership view).**
   - One headline per campaign: "Prompts won: x of n (95% CI a to b)" per engine.
   - The trend since the last scan.
   - The three biggest gaps, and what we're doing about them.
   - Each number has a one-click "how this is measured" panel that explains runner, fidelity and n in plain words.
2. **Campaigns.** List, create, and the campaign dashboard (Phase 5 dashboard, polished):
   - engine × persona heatmap with low-n greying
   - region view
   - share of voice versus peers within one index
   - comparison verdict
   - model event annotations
3. **Prompts.** The review queue (extend the existing one), generation with demand evidence, persona variants, branded tags, near-duplicate highlights, prompt sets with freeze and hash.
4. **Answer Explorer.**
   - The full answer, with brand and competitor spans highlighted.
   - Citations with source class, claims with verdicts, fan-out queries.
   - The runner and fidelity badge, and the raw payload link.
5. **Citations and Off-site.**
   - Top cited domains per engine, the source class mix, and which of our pages get cited.
   - The off-site mentions trend with sentiment (Content Analysis) for us and peers.
6. **Gaps and Recommendations.**
   - Lost prompts, what the cited pages have in common, our closest page, and the recommendation card with lever type, owner, evidence grade and evidence rows.
   - Status workflow and pre-registered targets.
7. **Strategy.** A new-topic report from Phase 8, with demand, the current landscape, our supply, gaps and a prioritized plan.
8. **Site Audit** (existing, polished). Findings by host and severity, with evidence strength.
9. **Budget and Funding.** This is critical for the approval meeting.
   - Provider prices with their verified date.
   - The estimate for the pilot and for steady state: core biweekly plus persona monthly or quarterly, all three campaigns.
   - Spend to date from `cost_ledger`, and the caps.
   - The vendor comparison table from COMPETITOR_MATRIX section 5.
   - Exportable as a one-page PDF.
10. **Settings.** Providers and connection status, budgets, schedules, judge eval scores (gold set), users and roles.

Every chart states its n, runner, fidelity and date. Every screen has empty, loading and error states. Leadership-facing copy contains no jargon: say "AI answers checked", not "draws".

## 5. Journeys QA must cover end to end
1. Onboard a site, then the audit appears.
2. Import or generate prompts, then review, approve and freeze a set.
3. Estimate a scan, then approve it with the cost guard, then run it (fixtures), then see the dashboard update.
4. Open a lost prompt, then see its gap analysis, then create a recommendation, then mark it published.
5. Generate a strategy report for a new topic.
6. Leadership user logs in, sees the overview and budget page, can't edit anything, and exports the PDF.

## 6. Pilot-ready checklist (every item must be green)
- [ ] Full test suite, typecheck and lint all pass. Report the totals, not just related tests.
- [ ] All 6 journeys pass in Playwright.
- [ ] The Statistics reviewer signs off that every displayed number matches METRICS.md.
- [ ] The Security reviewer signs off on auth and org scoping, secrets, the cost guard and public-repo hygiene.
- [ ] Lighthouse accessibility ≥ 95 on the overview, campaign dashboard and budget pages.
- [ ] Backup and restore were tested on the real database.
- [ ] The demo org is clearly bannered, and the UNC Charlotte org contains no demo rows (an automated check proves it).
- [ ] The budget page shows the pilot and steady-state estimates, generated from the estimator and not typed by hand.
- [ ] A stop-loss is built for paid scans: the scan pauses automatically if more than 20% of the first 60 draws come back as errors or blocked, or if actual cost runs more than 25% over the estimate.
- [ ] `docs/CHANGELOG.md` and `docs/UX.md` are complete.

## 7. Pilot plan (prepare it, but do NOT run it)
- **Campaign:** Energy (content team), the core set only: 30 neutral prompts, 6 engines, 3 draws, Charlotte, about 540 answers.
- Freeze `energy-core-v1` **only after I approve its prompts**.
- Show the exact estimate and the stop-loss settings on the Budget page.
- Rehearse the whole pilot on fixtures in the demo org: estimate, approval, run, rollup twice (the results must be identical), the dashboard, gaps and the PDF export. Report how long it took and what broke.
- The pilot doubles as the Phase 5 live gate. After it runs, record the results in CHANGELOG just as the Phase 5 gate required.

Then stop and tell me the pilot is ready for funding approval.

## Do not
- Spend money or call a paid API.
- Freeze any prompt set I haven't approved.
- Show demo numbers anywhere without the banner.
- Delete legacy data.

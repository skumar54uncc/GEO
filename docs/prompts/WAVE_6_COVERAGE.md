# Wave 6: Coverage audit and completion

Save as `docs/prompts/WAVE_6_COVERAGE.md`. Paste everything below the line into a fresh Cursor chat in plan mode, using your strongest model.

---

Timing: this wave must not change capture, judging or metric formulas while a paid pilot is running. If the pilot is scheduled, finish Part A first, run the pilot, then do Part B.

Read `.cursor/rules/geo.mdc`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/METRICS.md`, `docs/GEO_PLAYBOOK.md`, `docs/PROVIDERS.md`, `docs/UX.md` and `docs/CHANGELOG.md`. Then read the codebase.

All existing rules still hold:

- no fabricated data
- n and intervals on every rate
- the displayable rule everywhere
- runners and indexes never pooled
- paid calls estimate-gated
- the demo is bannered
- RBAC
- the public-repo hygiene rules

## Part A: Coverage audit (no code)

Create `docs/COVERAGE.md` with one row per requirement below. Columns:

- Status: done, partial or missing
- Evidence: route, file, test name or screenshot path
- Live or fixture: has it run on real data, or only on fixtures?
- Gap: what's missing

Be strict. "The code exists but has never run on real data" counts as partial.

### A1. The original 10 objectives

1. Campaigns, each with its own prompts and dashboard.
2. Persona-voiced prompt generation, user verification before anything runs, custom prompts, and generation informed by Google Trends, keyword volume and other demand analysis.
3. All 6 engines (ChatGPT, Claude, AI Overview, AI Mode, Gemini, Perplexity) captured as users see them, wherever possible. Google Trends, keywords and Exa are visible in the product.
4. Response and citation analysis, with highlighting, including the headlines (title, H1, H2s) of cited pages.
5. Gap analysis for prompts we lose: what the cited pages have in common; why they appeared and we didn't; their headlines; suggested headline words, content type and FAQ questions.
6. Research-first content strategy for upcoming campaigns (Trends, keywords, prompts, then ideas).
7. "x of N prompts" over time, with automated biweekly or monthly scans.
8. User-selectable regions, so responses are robust across locations.
9. Audit and analysis come first.
10. Enter a website URL, then detect the name and subdomains, plus higher-ed entity analysis.

### A2. Requirements from the GEO dashboard articles

11. Prompt library with categories (education, problem-solution, comparison, recommendation, brand), documented and exportable.
12. Citation frequency: % of prompts where we are cited, plus a trend.
13. Share of AI voice vs competitors, as a trend over scans and a grouped comparison against the top 3 peers, within one index.
14. Prompt coverage by intent and funnel stage: an intent × engine matrix of won rates, labeled strong, partial or invisible in text plus color, with n per cell.
15. Response position, citation sentiment, and the source page referenced, available to practitioners.
16. Engine-specific breakdown.
17. Prompt variation sensitivity: does a reworded prompt change the result?
18. AI referral traffic (GA4): sessions, engaged sessions and key events from chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com and claude.ai, plus top landing pages and AI vs organic trends.
19. Branded search impressions (Search Console), as an indirect awareness indicator.
20. AI crawler activity from server logs, by bot (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Bingbot), page and status over time.
21. Mapping long-tail content to prompts, and measuring whether the mapped content got cited.
22. Layered views: executive (headline outcomes), manager (visibility and competitors) and practitioner (prompt, answer and citation detail).
23. Headline number, period-over-period change, trend lines rather than snapshots, a baseline, and targets and benchmarks for context.
24. A plain-language summary at the top, written by a human.
25. Annotations (model updates, content launches, campaign events) and alerts on material drops.
26. Automated refresh and scheduled report delivery (PDF to leadership).
27. Documented methodology that's defensible when someone asks.
28. Shareable read-only output for people without accounts (PDF).

Post the COVERAGE.md table and stop for my review.

## Part B: Build the gaps

Build only what Part A marks partial or missing, in this order. Each item gets tests, and each paid path stays estimate-gated with fixtures.

(See user Wave 6 message for B1–B9 detail.)

## Part C: Verification

Re-run COVERAGE.md and make every row done, or partial with a stated external dependency. Screenshot/layout QA, full suite, CI green, CHANGELOG, commit and push.

Report: the COVERAGE.md table, new screens with screenshots, and the external access still needed (GA4, Search Console, server logs, SMTP).

# Wave 4: Independent reviews and hardening

Run this only after Phase 9B is accepted. Paste everything below the line into a fresh Cursor chat in plan mode, using your strongest model.

---

Read `.cursor/rules/geo.mdc`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/METRICS.md`, `docs/UX.md`, `docs/DECISIONS.md` and `docs/CHANGELOG.md`.

**Run three independent reviewers.** Use separate subagents or fresh chats that did not write the code. Each writes findings to `docs/reviews/<reviewer>.md`, with severity (high, medium or low), the file and line, how to reproduce it, and the fix.

The reviewers report. They do not fix their own findings. After all three are done, the implementers fix every high and medium finding. Lows are listed in CHANGELOG.

## Reviewer 1: Statistics and data accuracy
- Write an independent script (`scripts/audit-metrics.ts`) that recomputes 25 random displayed numbers directly from raw rows (draws, judge_runs, citations), without using `lib/metrics`. Compare them to what the API returns. Any mismatch is high severity.
- Check every interval method against METRICS.md:
  - Wilson for prompt counts
  - cluster bootstrap only when there are at least 10 prompts
  - paired comparisons
  - McNemar exact
- Check that runners and indexes are never pooled, branded and location-biased prompts are excluded from headlines, `search_used` filtering is applied, and persona group roll-ups use the 30+ draws rule.
- Check that the KPI change badges use only McNemar significance.
- Check the cost estimator against hand-calculated totals for the pilot and steady state, provider by provider.
- Check demo isolation with a row-level check across every table.

## Reviewer 2: Security and reliability
- Write an automated test that lists **every** API route and calls it with a session from another org. Every call must return 403 or 404, and none may leak data.
- Check that viewers get 403 on every write route (enumerated, not sampled).
- The login guard holds: no production mode, localhost only.
- Check cited-page fetching for SSRF with private IPs, redirects, DNS rebinding and file:// URLs.
- **Prove every paid adapter is cost-gated.** In test mode, block network access and show that no paid call can fire without an approved estimate.
- **CSV exports escape formula injection:** cells starting with = + - @ get a leading apostrophe. Prompt text and answer text are user-controlled.
- **PDF and HTML rendering escape prompt and answer text.** No script injection through stored answers.
- Run `npm audit` and fix high and critical findings.
- Set security headers (CSP, X-Frame-Options, Referrer-Policy) on all pages.
- Secrets: none in the repo, logs or error messages. Error responses never include stack traces or keys.
- Backups: run a restore test and record its time. Check that the stalled-scan detector works.

## Reviewer 3: UX and accessibility
- Walk all 6 journeys as leadership and as an operator. Note every point of confusion, dead end or piece of jargon.
- Scan all UI copy for raw keys (`ui_provider`, `on_page`, snake_case), em dashes and unexplained acronyms.
- Run Lighthouse in both themes on all 10 screens. Do a keyboard-only pass, a screen reader pass on the Overview and Budget (headings, labels, chart table alternatives), a reduced-motion pass, and a tablet pass at 1024 and 768.
- Check empty, loading, partial and error states on every screen.

## Exit criteria
- [ ] All three review files exist, with every finding resolved or listed as low.
- [ ] The metrics audit script shows 25 of 25 matches.
- [ ] The cross-org route test covers 100% of API routes.
- [ ] npm audit shows no high or critical issues.
- [ ] Full suite, typecheck, lint, Playwright and CI are all green.
- [ ] CHANGELOG is updated.

Then stop. Wave 5 (pilot rehearsal) comes next.

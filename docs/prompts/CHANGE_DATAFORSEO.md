# Change order: DataForSEO primary plus off-site signals

Paste this into a fresh Cursor chat in the GEO repo, in plan mode, using your strongest model. It changes the plan without breaking finished phases.

---

Read these files before planning: `.cursor/rules/geo.mdc`, `docs/SPEC.md` (including the 2026-11-04 amendment), `docs/ARCHITECTURE.md` (including section 13), `docs/PROVIDERS.md`, `docs/GEO_PLAYBOOK.md`, `docs/DECISIONS.md`, and `docs/CHANGELOG.md`. Then read the codebase.

## Step 0: Status report (no code yet)
Tell me:
- Which phases are complete, partial, or not started, with evidence from the code and tests.
- Any DataForSEO code that already exists, and what it calls.
- Anything that conflicts with section 13.

Wait for my approval.

## Step 1: Fix the current phase to match the amendment
This applies only to work that is already in progress, most likely Phase 3.

1. **One DataForSEO client.**
   - Basic auth from `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.
   - Every call goes through the cost guard.
   - Use task_post and task_get polling through pg-boss for scans. Use live mode only when the UI triggers a single check.
   - Store every raw response in `raw_payloads`.
   - Record the `cost` that DataForSEO returns in `cost_ledger`.
2. **Adapters with the exact labels from PROVIDERS section 1:**
   - ChatGPT and Gemini through LLM Scraper: `ui_provider`, high fidelity.
   - AI Overview and AI Mode through the SERP API: `serp_provider`, high fidelity.
   - Claude through LLM Responses with `web_search: true` (pass country and city): `api_search`, medium fidelity.
   - Perplexity through LLM Responses with a Sonar model (pass country): `api_search`, medium fidelity.
   - The parametric sample through LLM Responses with `web_search: false`: `api_parametric`.

   **Never label a Claude or Perplexity answer as what users see.**
3. **`draws.search_used`** is taken from the response `web_search` flag. Metrics for `api_search` use only draws where search actually ran. The UI shows the count of draws where it didn't.
4. **Store all the answer data:**
   - `annotations` go to `citations`.
   - `fan_out_queries` go to `fanout_queries`.
   - `search_results` go to `draw_search_results`.
   - Store each model name exactly as returned. If the returned model differs from the one requested, store both.
5. **Repeated draws** never reuse a cached response. The cache key includes `draw_index`.
6. **Keep SerpAPI and the local SERP adapters** as fallback and parity sources. Do not delete them.
7. **Tests.** Write fixture tests for every adapter, using saved real responses with secrets stripped. Cover:
   - search did not run
   - empty annotations
   - a model mismatch
   - task timeout
   - a provider error, which must become an error draw
8. **Live smoke test (`npm run smoke:dataforseo`).** Run 2 prompts × 6 engines × 1 draw against the real API. Print the cost and the parsed result for each engine. Show me the estimated cost first.

## Step 2: Additive schema
Make only the schema changes in ARCHITECTURE section 13, as one migration. Check the migration on a copy of the current database. No data loss.

## Step 3: Queue later work, don't build it yet
For each later phase, update its prompt notes in `docs/prompts/` so the amendment items are included when we reach it:
- Phase 4: LLM Mentions discovery.
- Phase 6: page features and Content Analysis.
- Phase 7: lever types and the truth layer check.
- Phase 8: off-site plan.

If Phase 2 is already done, add the new audit rules from the SPEC amendment now. They are small and self-contained. Each rule carries `why` and `evidence_strength`.

## Do not
- Start a later phase.
- Average series across runners.
- Add stealth plugins, proxy rotation, or CAPTCHA solving anywhere.
- Hardcode UNC Charlotte outside seed data.

## Finish
- Typecheck, lint, and tests all pass.
- `docs/CHANGELOG.md` is updated.
- Report the files changed, the smoke test output with costs, and anything still unverified.

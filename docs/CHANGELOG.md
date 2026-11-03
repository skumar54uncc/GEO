# Changelog

## 2026-11-03: Phase 1, Foundation

The app now runs on local Postgres 16 with pgvector (Postgres.app on this Mac), Drizzle, and a pg-boss worker. Every original screen works on migrated data.

Added:
- Full schema for ARCHITECTURE section 3, including the 2026-11-03 tables, in `lib/db/pg/schema.ts` and `drizzle/`. Implementation additions are listed in ARCHITECTURE 3.10.
- Immutability in two layers: `lib/db/pg/immutable.ts` refuses updates and deletes on `draws`, `raw_payloads`, `prompt_set_items`, `audit_log` and frozen `prompt_sets`, and Postgres triggers (`drizzle/0001_immutability.sql`) reject them too. No items can be added to a frozen set.
- Content-addressed raw store (`lib/rawstore.ts`). Payloads over 256 KB go to `data/raw/<sha256>`. The hash is verified on every read.
- `scripts/migrate-sqlite.ts`. Dry run by default; `--apply` runs in one transaction and stamps a marker, so re-running changes nothing. It reads a temporary copy, so `data/tracker.db` is never opened for writing.
- Campaigns: CRUD API (`/api/campaigns`), a campaigns page, engines with runner, regions, personas, archive. The migrated Energy campaign is marked as legacy.
- Prompt set freezing (`lib/promptSets.ts`). The hash is sha256 over the JSON array of sorted prompt texts. Freezing an unchanged set returns the existing version. Comparing scans across versions is refused.
- Worker skeleton (`worker/`): `health.ping`, plus an hourly `schedule.tick` that only logs.
- Dev email login with hashed session tokens. Roles admin, editor and viewer are enforced on every API route. Every successful write records an `audit_log` row; campaign changes record before and after.
- Cost guard (`lib/cost/guard.ts`) on `provider_accounts` and `cost_ledger`. SerpAPI capture behavior is unchanged.
- Scripts: `db:up`, `db:backup`, `db:restore`, `user:role`, `worker:ping`; `typecheck` and `test`.
- CI workflow (`.github/workflows/ci.yml`) and an optional `docker-compose.yml`.

Changed:
- The `Store` methods behind the original screens keep their shapes but are now async. The SQLite and JSON stores are removed.
- Saving a manual capture that already exists with different text now returns 409 instead of overwriting. Saving identical text is a no-op. A re-judge adds a judge run (latest wins) instead of replacing the old one.
- The app binds to 127.0.0.1. Signed-out pages redirect to `/login`, and signed-out API calls get 401. `/api/health` stays public and reports counts only.
- Metrics and briefs load judge results in one query instead of one per answer. The output is identical, as the legacy-equality test checks.
- Header title is "UNC Charlotte AI Visibility Platform".

Verification gate (run 2026-11-03 on this Mac):
1. `db:up`, `typecheck`, `lint` pass. The one lint warning in `app/analyze/page.tsx` predates this phase. `npm test` passes all 50 tests across 8 files.
2. Real `data/tracker.db` (sha256 04bfc5e4…8cc8, unchanged after migration). The dry run wrote nothing. `--apply` moved: prompts 50, draws 46, judge_runs 40, provider_cache 47, serp_snapshots 10, Trends signals 16, autocomplete signals 11, cost_ledger 55, recommendations 0. A second `--apply` reported "already migrated" with identical counts.
3. 20 random answers have identical sha256 before and after. Legacy `computeMetrics()` (frozen copy in `tests/legacy/`) equals the new metrics on the real data and on a fixture covering every legacy table.
4. Raw SQL `UPDATE draws`, `DELETE FROM raw_payloads`, `UPDATE prompt_set_items` and `UPDATE prompt_sets` on the frozen v1 all fail with `immutable_violation`.
5. Live server: a viewer gets 403 creating a campaign. An editor creates one (201) and archives it (200). All of it is in `audit_log`.
6. Every page (`/`, `/capture`, `/analyze`, `/serpapi`, `/demand`, `/recommend`, `/config`, `/campaigns`, `/login`) returns 200 and renders content in a browser, with no console errors and no server errors. Dashboard on migrated data: visibility 80.0% (32 of 40; 95% Wilson CI 65.2% to 89.5%).
7. `npm run worker` processed `health.ping`.
8. `db:backup` then `db:restore` into a scratch database gave identical counts on 11 tables. The triggers are present after restore.

Still unverified or limited:
- Legacy draws keep `region_honored = unknown` and `model_build = unknown`; the source never recorded them. Mentions and citations derived from legacy judge JSON have no character spans, and citation URLs are domains only.
- Legacy SerpAPI events have USD = null because the plan's price per credit is unknown. Set `credit_unit_usd` once the plan is confirmed.
- The dev login has no password. It is safe only because the app listens on 127.0.0.1. Real auth (magic link or SSO) is in `docs/PUBLIC_LAUNCH.md`.
- Next.js's dev server redirects signed-out pages to `localhost:3000` rather than `127.0.0.1:3000`. Browsers handle it; command-line clients may need `-L` and IPv4.
- The gate used throwaway `gate-*@example.test` accounts. Their memberships were removed afterwards, so the first real sign-in becomes admin. Their audit rows and an archived "Gate check (archived)" campaign remain.
- The SerpAPI draw-index cache issue (repeated draws can be cache copies) is unchanged, as planned. It is fixed in Phase 3.

## 2026-11-03: Planning docs for Phases 1 to 9

Docs only. No application code changed.

Added:
- `docs/ROADMAP.md`: objectives with acceptance tests, vendor gaps we target, feature list per phase, UI rules, model roles, verification gates, risks.
- `docs/PROVIDERS.md`: provider table and budget carried over from a 2026-10-21 research pass, with [V]/[E] tags. Added Bright Data and Keyword Planner rows (unknown price). Local SERP marked experimental.
- `docs/PUBLIC_LAUNCH.md`: path to a multi tenant public version.
- `docs/prompts/MASTER_CONTEXT.md` and `docs/prompts/PHASE_2.md` to `PHASE_9.md`.
- `docs/prompts/LOCAL_SERP.md` (written for the openserp fork) and `docs/prompts/LOCAL_MODELS.md`.

Changed:
- `docs/prompts/PHASE_1.md` upgraded: local only binding, backup and restore, raw store with file backing, `audit_log`, sessions, CI, verification gate.
- `docs/ARCHITECTURE.md`: new tables (`bot_hits`, `entity_checks`, `seasonal_events`, `search_console_queries`, `ai_referral_traffic`, `serp_snapshots`, `alerts`, `audit_log`, `sessions`), raw payload file storage, sentiment span on `judge_runs`, owner and publish by on strategy items, first mention rate, branded series kept separate, local SERP rules, new job queues, section 12 decisions, section 13 security, section 14 local first data policy.
- `docs/SPEC.md`: thin UI per phase, added features per phase, McNemar instead of a two proportion test, verification gate in the definition of done.

Reconciled with an earlier draft spec: kept McNemar and cluster bootstrap (the draft's two proportion test and Wilson on draws overstate precision for paired, correlated data), kept 5 runners including api_parametric, kept table names from ARCHITECTURE, kept 20 calibration prompts. Took from the draft: master context block, journalist, donor, research partner personas, Keyword Planner and Bright Data candidates, first mention rate, owner and publish by date, dashboard parts.

Unverified:
- Every price in `docs/PROVIDERS.md` (last checked 2026-10-21). Phase 3 rechecks.
- Whether a UI capture provider exists for Perplexity.
- Whether the local SERP service can pass parity. Its own logs show heavy blocking.

Pending (needs a non markdown edit):
- `.gitignore`: add `SerpAPI/`, `backups/`, `data/raw/`.

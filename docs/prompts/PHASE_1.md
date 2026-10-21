# Phase 1 prompt (paste into a fresh Cursor chat, plan mode, strongest model)

Read `docs/SPEC.md`, `docs/ARCHITECTURE.md`, and `.cursor/rules/geo.mdc` fully. Then read the whole existing codebase (`lib/`, `app/`, `seed/`) before planning.

Goal: move the app onto the Phase 1 foundation from ARCHITECTURE sections 2, 3, 4, and 7, without breaking any existing screen.

## Build
1. **Local Postgres.** `docker-compose.yml` with Postgres 16 and pgvector. `DATABASE_URL` in `.env.example`. A `npm run db:up` script.
2. **Drizzle.** Schema for every table in ARCHITECTURE section 3, with the enums, unique keys, and foreign keys as written. Migrations in `drizzle/`. Do not invent extra tables. If a column seems missing, list it in your plan and ask.
3. **Immutability guard.** A small repository layer so application code cannot UPDATE `draws`, `raw_payloads`, `prompt_set_items`, or a frozen `prompt_sets` row. Add a Postgres trigger that rejects those updates too. Test both.
4. **Migration script** `scripts/migrate-sqlite.ts` exactly per ARCHITECTURE section 4, dry run by default, `--apply` to write. Idempotent. Prints a per table count report.
5. **Data access.** Replace `lib/db/*` with a Postgres store behind the same function signatures the current routes and pages use, so the existing UI keeps working. Remove the JSON fallback.
6. **Campaigns.** CRUD API and a simple page: list, create, edit name/topic/engines/regions/personas, archive. Seed one campaign "Energy" from migrated data.
7. **Prompt sets.** "Freeze prompt set" action: snapshots approved prompts into `prompt_set_items`, computes sha256 over sorted prompt texts, sets `frozen_at`. Editing a prompt after freezing affects only the next version.
8. **Worker skeleton.** `worker/index.ts` running pg-boss, with a `health.ping` job and `schedule.tick` that only logs. `npm run worker`. No scan logic yet.
9. **Auth.** Email magic link or a simple dev login, roles admin/editor/viewer enforced on write routes. Keep it minimal.
10. **Cost ledger.** Point the existing SerpAPI cost guard at `cost_ledger` and `provider_accounts` instead of `serp_events` and config credits.

## Tests (Vitest)
- Migration: counts match, 20 random answer hashes match, legacy metrics from old `computeMetrics()` equal new metrics on the legacy scan.
- Immutability: app layer and trigger both reject updates.
- Prompt set freeze: same prompts give the same hash, an edit gives a new version.
- Campaign CRUD and role checks.

## Do not
- Start Phase 2 or later work.
- Change judge logic, metric formulas, or the SerpAPI capture behavior beyond the storage swap.
- Delete `data/tracker.db`. Keep it as the migration source.

## Finish
- Add `typecheck` (tsc --noEmit) and `test` (vitest) scripts to package.json; they do not exist yet.
- `npm run typecheck`, `npm run lint`, `npm test` all pass.
- Every existing page loads with migrated data.
- `docs/CHANGELOG.md` created with what changed and anything left unverified.
- Reply with: files changed, test results, and anything you were unsure about.

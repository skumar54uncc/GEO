# Phase 1 prompt: Foundation

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file, into a fresh Cursor chat in plan mode with the strongest model.

Then read the whole existing codebase (`lib/`, `app/`, `seed/`, `components/`) before planning.

Goal: move the app onto the foundation from ARCHITECTURE sections 2, 3, 4, 7, 13, and 14, without breaking any existing screen. Local only.

## Build

1. **Local Postgres.** `docker-compose.yml` with Postgres 16 and pgvector, port bound to `127.0.0.1:5432`, named volume. `DATABASE_URL` in `.env.example`. Scripts: `db:up`, `db:down`, `db:migrate`, `db:backup` (pg_dump to `backups/`, gitignored), `db:restore <file>`.
2. **Drizzle.** Schema for every table in ARCHITECTURE section 3, including the tables marked "added 2026-11-03", with enums, unique keys, and foreign keys as written. Migrations in `drizzle/`. Do not invent tables beyond section 3. If a column seems missing, list it in your plan and ask.
3. **Org scoping.** Every org owned table is read and written through a repository layer that requires `org_id`. Seed one organization "UNC Charlotte" and one brand.
4. **Immutability guard.** The repository layer exposes no update for `draws`, `raw_payloads`, `prompt_set_items`, or frozen `prompt_sets`, and `audit_log` is append only. A Postgres trigger rejects those updates too. Test both paths.
5. **Raw store.** `lib/rawstore.ts`: put(content) returns sha256, dedupes, stores inline under 256 KB, else writes `data/raw/<sha256>` once and stores the path. get(sha) verifies the hash on read. `RAW_STORE_DIR` in `.env.example`.
6. **Migration script** `scripts/migrate-sqlite.ts` exactly per ARCHITECTURE section 4. Dry run by default, `--apply` to write. Idempotent. Per table count report. Never modifies `data/tracker.db`.
7. **Data access.** Replace `lib/db/*` with a Postgres store behind the same function signatures the current routes and pages use, so the existing UI keeps working. Remove the JSON fallback.
8. **Campaigns.** CRUD API and a page (shadcn/ui): list, create, edit name, topic, engines, regions, personas, archive. Seed campaign "Energy" from migrated data.
9. **Prompt sets.** "Freeze prompt set" action: snapshots approved prompts into `prompt_set_items`, sha256 over sorted prompt texts, sets `frozen_at`. Editing a prompt after freezing only affects the next version. A helper refuses to compare scans across versions.
10. **Worker skeleton.** `worker/index.ts` with pg-boss, a `health.ping` job and an hourly `schedule.tick` that only logs. `npm run worker`. No scan logic.
11. **Auth.** Dev email login (no password, local only), session token stored hashed in `sessions`, httpOnly cookie. Roles admin, editor, viewer enforced on every write route. Every write route records an `audit_log` row.
12. **Cost ledger.** Point the existing SerpAPI cost guard at `cost_ledger` and `provider_accounts` instead of `serp_events` and config credits. Keep capture behavior identical.
13. **CI.** `.github/workflows/ci.yml`: Postgres service container, install, migrate, typecheck, lint, test.

## Tests (Vitest)

- Migration: counts match, 20 random answer hashes match, legacy metrics from old `computeMetrics()` equal new metrics on the legacy scan.
- Immutability: app layer and trigger both reject updates. `audit_log` rejects updates.
- Raw store: dedupe, file threshold, hash verified on read.
- Prompt set freeze: same prompts give the same hash, an edit gives a new version, cross version comparison refused.
- Campaign CRUD, role checks (viewer 403 on writes), audit rows written.
- Smoke: every existing page and `/campaigns` returns 200 with migrated data.

## Do not

- Start Phase 2 or later work.
- Change judge logic, metric formulas, or SerpAPI capture behavior beyond the storage swap.
- Delete or modify `data/tracker.db`.
- Expose Postgres or the app beyond 127.0.0.1.

## Verification gate

1. `npm run db:up`, `npm run db:migrate`, then `npm run typecheck`, `npm run lint`, `npm test` all pass.
2. Migration dry run report, then `--apply`, then a second `--apply` that changes nothing.
3. Hash and metric equality checks pass on the legacy scan.
4. A raw SQL `UPDATE draws ...` fails with the trigger error.
5. Viewer write returns 403, editor create works, both appear in `audit_log`.
6. Every page (`/`, `/capture`, `/analyze`, `/serpapi`, `/demand`, `/recommend`, `/config`, `/campaigns`) loads with no console errors.
7. `npm run worker` processes `health.ping`.
8. `db:backup` then `db:restore` into a scratch database gives the same row counts.

## Finish

- Add `typecheck` (tsc --noEmit) and `test` (vitest) scripts.
- Create `docs/CHANGELOG.md` with what changed, the gate results, and anything unverified.
- Reply with: files changed, test and gate results, anything you were unsure about.

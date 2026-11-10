# R1 — `db:restore` FK orphan root cause

**Date:** 2026-11-10  
**Branch:** `fix/db-restore-orphans` (off `v1.0-rc2`)

## How `4c1c3ac3-138f-41ce-a3c3-46416554ff2a` disappeared

Demo re-seed tears down the previous Demo University org via `deleteAllDataForOrg`:

1. `lib/demo/seedMarked.ts:407` / `:414` — `seedFullDemoOrg` calls `deleteAllDataForOrg(db, …)` for the slug / duplicate demo name.
2. `lib/demo/deleteDemoOrgData.ts:93` — `set_config('session_replication_role', 'replica', true)` disables **FK checks and immutability triggers** for the transaction.
3. `lib/demo/deleteDemoOrgData.ts:211` — `DELETE FROM organizations WHERE id = orgId`.
4. **`audit_log` is never deleted** (immutable; not in the delete list). With replica role, Postgres does not reject the org delete for dangling `audit_log.org_id`.

`scripts/admin-cleanup-fixture-contamination.ts:121` also sets replica role, but it does **not** delete organizations — it is not the source of this orphan. The org delete path above is.

Live sample for the reported id: 1 `audit_log` row (`scan.stop_loss_paused`); org row absent.

## Live orphan counts (every public FK)

Scanned against local `DATABASE_URL` on 2026-11-10. **110** constraints; **1** with orphans:

| orphans | constraint | table |
|--------:|------------|-------|
| **11** | `audit_log_org_id_organizations_id_fk` | `audit_log` |
| 0 | *(all other 109 constraints)* | |

Orphaned `audit_log.org_id` values (11 rows total):

| org_id | n | sample actions |
|--------|--:|----------------|
| `be0492a8-a91d-4b0f-8182-8f9539c8d4f9` | 6 | `auth.login` |
| `52324c02-3fee-4e6b-ab41-8a83081307c8` | 4 | `scan.stalled_reconciled`, `scan.stop_loss_paused` |
| `4c1c3ac3-138f-41ce-a3c3-46416554ff2a` | 1 | `scan.stop_loss_paused` |

Scanner: `lib/db/pg/orphanFks.ts` (`scanForeignKeyOrphans` / `assertNoForeignKeyOrphans`).

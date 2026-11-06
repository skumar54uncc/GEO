# Local backups and restore

`npm run db:backup` creates a timestamped directory under `backups/` containing:

- `database.dump`: a custom-format `pg_dump` of the local database.
- `data/raw/`: a separate copy of the file-backed raw payload store, when it exists.
- `manifest.json`: database name plus raw-file count and bytes.

The bundle is local and gitignored. It is not an off-device backup. `data/tracker.db`, `.env.local`, and files outside `data/raw/` are not included.

## Nightly macOS job

Run `npm run db:nightly:install` to install a per-user launchd job at 02:00 local time. The job runs `npm run db:nightly:run` from this repository and writes output to `backups/nightly.log`. It embeds no database URL; `scripts/db.ts` loads the repository's local environment at run time.

The installer is macOS-only and must be run from the checkout that should own the schedule. It replaces only the `edu.charlotte.geo.backup` launch agent. Confirm it is loaded with:

```sh
launchctl print "gui/$(id -u)/edu.charlotte.geo.backup"
```

No retention or off-device copy is automatic. Review and remove old bundles according to local storage policy.

## Restore

Restore into a scratch database first:

```sh
npm run db:restore -- backups/<bundle-directory> geo_restore_check
```

For a bundle, the command restores Postgres and then copies missing files into `data/raw/`. It keeps byte-identical files and refuses to overwrite a path whose bytes differ. A legacy `.dump` file is still accepted, but it cannot restore file-backed payloads.

Validate the scratch restore by checking table counts, immutable triggers, and representative `raw_payloads.path` files before restoring over the normal local database. Restore uses `pg_restore --clean --if-exists`; targeting the normal database replaces its database objects and should only be done intentionally.

The database dump and raw-file copy are sequential, not a filesystem snapshot. Raw payloads are content-addressed and immutable, which limits inconsistency, but a payload created during the backup could be referenced by the dump and miss the raw copy. The nightly runner does not claim transactional coverage across Postgres and `data/raw/`; verify the manifest and referenced paths for recovery-critical backups.

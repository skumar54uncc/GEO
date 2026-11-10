-- Tombstones for org_ids still referenced by immutable audit_log after demo teardown.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;

INSERT INTO "organizations" ("id", "name", "slug", "is_demo", "theme_config", "created_at", "archived_at")
SELECT DISTINCT
  a."org_id",
  'Deleted organization ' || a."org_id"::text,
  'deleted-' || replace(a."org_id"::text, '-', ''),
  false,
  '{}'::jsonb,
  now(),
  now()
FROM "audit_log" a
WHERE a."org_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "organizations" o WHERE o."id" = a."org_id")
ON CONFLICT ("id") DO NOTHING;

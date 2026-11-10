import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";

/**
 * Insert archived placeholder organizations for every orphaned org_id found in
 * referencing tables (today: audit_log). Does not UPDATE or DELETE audit_log.
 */
export async function repairOrphanOrganizationTombstones(db: Db): Promise<{ inserted: number }> {
  const result = await db.execute(sql`
    WITH orphan_ids AS (
      SELECT DISTINCT a.org_id AS id
      FROM audit_log a
      WHERE a.org_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = a.org_id)
    ),
    inserted AS (
      INSERT INTO organizations (id, name, slug, is_demo, theme_config, created_at, archived_at)
      SELECT
        o.id,
        'Deleted organization ' || o.id::text,
        'deleted-' || replace(o.id::text, '-', ''),
        false,
        '{}'::jsonb,
        now(),
        now()
      FROM orphan_ids o
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::int AS inserted FROM inserted
  `);
  const row = (result.rows as Array<{ inserted: number }>)[0];
  return { inserted: row?.inserted ?? 0 };
}

import type { Client } from "pg";
import { assertNoForeignKeyOrphans } from "@/lib/db/pg/orphanFks";

/** Pre-backup gate: refuse to write a bundle that cannot restore cleanly. */
export async function assertBackupHasNoOrphans(client: Client): Promise<void> {
  await assertNoForeignKeyOrphans(client);
}

/** Row counts for every public table (ordered). */
export async function publicTableRowCounts(client: Client): Promise<Record<string, number>> {
  const tables = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const out: Record<string, number> = {};
  for (const { tablename } of tables.rows) {
    const r = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${tablename.replace(/"/g, '""')}"`);
    out[tablename] = r.rows[0]?.n ?? 0;
  }
  return out;
}

export type CountCompare = {
  ok: boolean;
  liveOnly: string[];
  restoreOnly: string[];
  mismatches: Array<{ table: string; live: number; restored: number }>;
};

export function compareTableCounts(
  live: Record<string, number>,
  restored: Record<string, number>,
): CountCompare {
  const liveKeys = new Set(Object.keys(live));
  const restoreKeys = new Set(Object.keys(restored));
  const liveOnly = [...liveKeys].filter((k) => !restoreKeys.has(k)).sort();
  const restoreOnly = [...restoreKeys].filter((k) => !liveKeys.has(k)).sort();
  const mismatches: CountCompare["mismatches"] = [];
  for (const table of [...liveKeys].sort()) {
    if (!restoreKeys.has(table)) continue;
    if (live[table] !== restored[table]) {
      mismatches.push({ table, live: live[table]!, restored: restored[table]! });
    }
  }
  return {
    ok: liveOnly.length === 0 && restoreOnly.length === 0 && mismatches.length === 0,
    liveOnly,
    restoreOnly,
    mismatches,
  };
}

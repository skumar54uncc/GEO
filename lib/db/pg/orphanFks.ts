import type { Client } from "pg";

export type FkOrphanCount = {
  constraintName: string;
  tableName: string;
  columnNames: string[];
  refTable: string;
  refColumns: string[];
  orphans: number;
};

type FkMeta = {
  constraintName: string;
  tableName: string;
  columnNames: string[];
  refTable: string;
  refColumns: string[];
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** List every foreign key in `public` (composite keys collapsed to one entry). */
export async function listForeignKeys(client: Client): Promise<FkMeta[]> {
  const fks = await client.query<{
    constraint_name: string;
    table_name: string;
    column_name: string;
    ref_table: string;
    ref_column: string;
  }>(`
    SELECT c.conname AS constraint_name,
           rel.relname AS table_name,
           a.attname AS column_name,
           frel.relname AS ref_table,
           fa.attname AS ref_column
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = cols.attnum
    JOIN pg_class frel ON frel.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = frel.relnamespace
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS fcols(attnum, ord) ON fcols.ord = cols.ord
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = fcols.attnum
    WHERE c.contype = 'f' AND n.nspname = 'public'
    ORDER BY c.conname, cols.ord
  `);

  const byName = new Map<string, FkMeta>();
  for (const row of fks.rows) {
    const cur = byName.get(row.constraint_name);
    if (!cur) {
      byName.set(row.constraint_name, {
        constraintName: row.constraint_name,
        tableName: row.table_name,
        columnNames: [row.column_name],
        refTable: row.ref_table,
        refColumns: [row.ref_column],
      });
    } else {
      cur.columnNames.push(row.column_name);
      cur.refColumns.push(row.ref_column);
    }
  }
  return [...byName.values()].sort((a, b) => a.constraintName.localeCompare(b.constraintName));
}

/** Count child rows whose non-null FK values do not exist in the parent table. */
export async function countOrphansForFk(client: Client, fk: FkMeta): Promise<number> {
  const childCols = fk.columnNames.map((c) => `c.${quoteIdent(c)}`).join(", ");
  const parentCols = fk.refColumns.map((c) => `p.${quoteIdent(c)}`).join(", ");
  const nullOk = fk.columnNames.map((c) => `c.${quoteIdent(c)} IS NULL`).join(" AND ");
  const sql = `
    SELECT count(*)::int AS orphans
    FROM ${quoteIdent(fk.tableName)} c
    WHERE NOT (${nullOk})
      AND NOT EXISTS (
        SELECT 1 FROM ${quoteIdent(fk.refTable)} p
        WHERE (${parentCols}) IS NOT DISTINCT FROM (${childCols})
      )`;
  const r = await client.query<{ orphans: number }>(sql);
  return r.rows[0]?.orphans ?? 0;
}

/** Scan every public FK. Returns all constraints; `orphans > 0` means a restore hazard. */
export async function scanForeignKeyOrphans(client: Client): Promise<FkOrphanCount[]> {
  const fks = await listForeignKeys(client);
  const out: FkOrphanCount[] = [];
  for (const fk of fks) {
    const orphans = await countOrphansForFk(client, fk);
    out.push({ ...fk, orphans });
  }
  return out;
}

/** Throws if any FK has orphan rows. Used by backup and verify. */
export async function assertNoForeignKeyOrphans(client: Client): Promise<void> {
  const rows = await scanForeignKeyOrphans(client);
  const bad = rows.filter((r) => r.orphans > 0);
  if (!bad.length) return;
  const detail = bad.map((r) => `${r.constraintName}=${r.orphans}`).join(", ");
  throw new Error(`Foreign-key orphans present (restore would fail): ${detail}`);
}

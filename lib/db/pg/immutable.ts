import { eq, getTableName, type SQL } from "drizzle-orm";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { IMMUTABLE_TABLES, promptSets } from "./schema";

export class ImmutableViolation extends Error {
  constructor(message: string) {
    super(`immutable_violation: ${message}`);
    this.name = "ImmutableViolation";
  }
}

const IMMUTABLE = new Set<string>(IMMUTABLE_TABLES);

export function isImmutableTable(table: PgTable): boolean {
  return IMMUTABLE.has(getTableName(table));
}

/**
 * The only update path application code should use. Refuses immutable tables and frozen
 * prompt sets before the database trigger has to.
 */
export async function guardedUpdate<T extends PgTable>(
  db: Db,
  table: T,
  set: PgUpdateSetSource<T>,
  where: SQL,
): Promise<void> {
  const name = getTableName(table);
  if (IMMUTABLE.has(name)) throw new ImmutableViolation(`UPDATE on ${name} is not allowed`);
  if (name === getTableName(promptSets)) {
    const rows = await db.select({ id: promptSets.id, frozenAt: promptSets.frozenAt }).from(promptSets).where(where);
    const frozen = rows.find((r) => r.frozenAt !== null);
    if (frozen) throw new ImmutableViolation(`prompt set ${frozen.id} is frozen`);
  }
  await db.update(table).set(set).where(where);
}

export async function guardedDelete<T extends PgTable>(db: Db, table: T, where: SQL): Promise<void> {
  const name = getTableName(table);
  if (IMMUTABLE.has(name)) throw new ImmutableViolation(`DELETE on ${name} is not allowed`);
  if (name === getTableName(promptSets)) {
    const rows = await db.select({ id: promptSets.id, frozenAt: promptSets.frozenAt }).from(promptSets).where(where);
    if (rows.some((r) => r.frozenAt !== null)) throw new ImmutableViolation("prompt set is frozen");
  }
  await db.delete(table).where(where);
}

export function isImmutableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: unknown })?.cause;
  const causeMsg = cause instanceof Error ? cause.message : "";
  return msg.includes("immutable_violation") || causeMsg.includes("immutable_violation");
}

export { eq };

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __geoPool?: Pool; __geoDb?: Db };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return url;
}

export function getPool(): Pool {
  if (!g.__geoPool) {
    g.__geoPool = new Pool({ connectionString: databaseUrl(), max: 10 });
  }
  return g.__geoPool;
}

export function getDb(): Db {
  if (!g.__geoDb) g.__geoDb = drizzle(getPool(), { schema });
  return g.__geoDb;
}

export async function closeDb(): Promise<void> {
  if (g.__geoPool) await g.__geoPool.end();
  g.__geoPool = undefined;
  g.__geoDb = undefined;
}

export { schema };

import { getDb } from "./pg/client";
import { PgStore } from "./pg/store";
import type { Store } from "./types";

const globalForStore = globalThis as unknown as { __geoStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__geoStore) globalForStore.__geoStore = new PgStore(getDb());
  return globalForStore.__geoStore;
}

export function storeBackend(): string {
  return "postgres";
}

export { hashParams } from "./types";

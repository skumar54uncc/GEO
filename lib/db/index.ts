import { tryOpenSqlite } from "./sqlite";
import { openJsonStore } from "./json";
import type { Store } from "./types";

const globalForStore = globalThis as unknown as { __unccStore?: Store; __unccStoreNote?: string };

export function getStore(): Store {
  if (globalForStore.__unccStore) return globalForStore.__unccStore;
  const sqlite = tryOpenSqlite();
  if (sqlite) {
    globalForStore.__unccStore = sqlite;
    globalForStore.__unccStoreNote = "sqlite";
    return sqlite;
  }
  const json = openJsonStore();
  globalForStore.__unccStore = json;
  globalForStore.__unccStoreNote = "json";
  return json;
}

export function storeBackend(): string {
  getStore();
  return globalForStore.__unccStoreNote ?? "unknown";
}

export { hashParams } from "./types";

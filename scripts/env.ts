import fs from "fs";
import path from "path";

/** Loads .env.local then .env into process.env without overriding variables already set. */
export function loadEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

/** Finds a Postgres client binary on PATH, in PG_BIN, or inside Postgres.app. */
export function pgBinary(name: "pg_dump" | "pg_restore" | "psql"): string {
  const home = process.env.HOME ?? "";
  const dirs = [
    process.env.PG_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(home, "Applications/Postgres.app/Contents/Versions/latest/bin"),
    "/Applications/Postgres.app/Contents/Versions/latest/bin",
  ].filter(Boolean) as string[];
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} not found. Install Postgres.app or set PG_BIN to the folder containing ${name}.`);
}

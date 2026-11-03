import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { loadEnv, pgBinary } from "./env";

loadEnv();

function urlFor(dbName?: string): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const u = new URL(raw);
  if (dbName) u.pathname = `/${dbName}`;
  return u.toString();
}

function dbNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && process.env.ALLOW_REMOTE_DB !== "1") {
    throw new Error(`Refusing to run against non-local host ${host}. Set ALLOW_REMOTE_DB=1 to override.`);
  }
}

/** Creates the database if missing and checks that pgvector is available. */
export async function setup(target = urlFor()): Promise<void> {
  assertLocal(target);
  const name = dbNameOf(target);
  const admin = new Client({ connectionString: urlFor("postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!exists.rowCount) {
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`created database ${name}`);
  } else {
    console.log(`database ${name} exists`);
  }
  await admin.end();
  const client = new Client({ connectionString: target });
  await client.connect();
  const ext = await client.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
  await client.end();
  if (!ext.rowCount) {
    throw new Error("pgvector is not available in this Postgres. Use Postgres.app 2.7+ or install pgvector.");
  }
  console.log("pgvector available");
}

export async function runMigrations(target = urlFor()): Promise<void> {
  assertLocal(target);
  const client = new Client({ connectionString: target });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log(`migrations applied to ${dbNameOf(target)}`);
}

function backup(): void {
  const url = urlFor();
  assertLocal(url);
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${dbNameOf(url)}-${stamp}.dump`);
  const res = spawnSync(pgBinary("pg_dump"), ["--format=custom", "--no-owner", `--file=${file}`, url], {
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error("pg_dump failed");
  console.log(`backup written: ${path.relative(process.cwd(), file)}`);
  console.log("Raw files in data/raw/ are not inside the dump. Copy that folder alongside it.");
}

async function restore(file: string | undefined, targetName: string | undefined): Promise<void> {
  if (!file) throw new Error("usage: npm run db:restore -- <backup file> [target database name]");
  const target = targetName ? urlFor(targetName) : urlFor();
  assertLocal(target);
  await setup(target);
  const res = spawnSync(
    pgBinary("pg_restore"),
    ["--clean", "--if-exists", "--no-owner", `--dbname=${target}`, file],
    { stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error("pg_restore failed");
  console.log(`restored ${file} into ${dbNameOf(target)}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "setup":
      await setup();
      break;
    case "migrate":
      await runMigrations();
      break;
    case "up":
      await setup();
      await runMigrations();
      break;
    case "backup":
      backup();
      break;
    case "restore":
      await restore(args[0], args[1]);
      break;
    default:
      console.log("usage: tsx scripts/db.ts <up|setup|migrate|backup|restore>");
      process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

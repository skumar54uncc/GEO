import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { assertBackupHasNoOrphans, compareTableCounts, publicTableRowCounts } from "@/lib/db/pg/backupGuard";
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

type BackupManifest = {
  version: 1;
  createdAt: string;
  database: string;
  databaseDump: "database.dump";
  rawStore: { source: "data/raw"; included: boolean; files: number; bytes: number };
};

function filesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Creates one self-contained local bundle: Postgres dump, data/raw, and a manifest. */
export async function backup(): Promise<string> {
  const url = urlFor();
  assertLocal(url);

  const gate = new Client({ connectionString: url });
  await gate.connect();
  try {
    await assertBackupHasNoOrphans(gate);
  } finally {
    await gate.end();
  }

  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundle = path.join(dir, `${dbNameOf(url)}-${stamp}`);
  const dump = path.join(bundle, "database.dump");
  const rawSource = path.join(process.cwd(), "data", "raw");
  const rawTarget = path.join(bundle, "data", "raw");
  fs.mkdirSync(bundle, { recursive: false });
  try {
    const res = spawnSync(pgBinary("pg_dump"), ["--format=custom", "--no-owner", `--file=${dump}`, url], {
      stdio: "inherit",
    });
    if (res.status !== 0) throw new Error("pg_dump failed");

    if (fs.existsSync(rawSource)) fs.cpSync(rawSource, rawTarget, { recursive: true, errorOnExist: true });
    const rawFiles = filesUnder(rawTarget);
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      database: dbNameOf(url),
      databaseDump: "database.dump",
      rawStore: {
        source: "data/raw",
        included: fs.existsSync(rawSource),
        files: rawFiles.length,
        bytes: rawFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0),
      },
    };
    fs.writeFileSync(path.join(bundle, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
    });
  } catch (error) {
    fs.rmSync(bundle, { recursive: true, force: true });
    throw error;
  }
  console.log(`backup bundle written: ${path.relative(process.cwd(), bundle)}`);
  return bundle;
}

/**
 * Restore a bundle into a temporary database, compare public table row counts to live, drop temp.
 * Prints PASS or FAIL. Returns true on PASS.
 */
export async function verifyBackup(bundlePath: string | undefined): Promise<boolean> {
  if (!bundlePath) throw new Error("usage: npm run db:verify-backup -- <backup bundle>");
  const bundle = path.resolve(bundlePath);
  const dump = path.join(bundle, "database.dump");
  if (!fs.existsSync(dump)) throw new Error(`database dump not found: ${dump}`);

  const liveUrl = urlFor();
  assertLocal(liveUrl);
  const tempName = `geo_verify_${Date.now()}`;
  const tempUrl = urlFor(tempName);

  const live = new Client({ connectionString: liveUrl });
  await live.connect();
  let liveCounts: Record<string, number>;
  try {
    liveCounts = await publicTableRowCounts(live);
  } finally {
    await live.end();
  }

  await setup(tempUrl);
  const restoreRes = spawnSync(
    pgBinary("pg_restore"),
    ["--clean", "--if-exists", "--no-owner", `--dbname=${tempUrl}`, dump],
    { stdio: "inherit" },
  );
  if (restoreRes.status !== 0) {
    await dropDatabase(tempName);
    console.log("FAIL");
    throw new Error("pg_restore failed during verify-backup");
  }

  const restoredClient = new Client({ connectionString: tempUrl });
  await restoredClient.connect();
  let restoredCounts: Record<string, number>;
  try {
    restoredCounts = await publicTableRowCounts(restoredClient);
  } finally {
    await restoredClient.end();
  }

  await dropDatabase(tempName);

  const compare = compareTableCounts(liveCounts, restoredCounts);
  if (!compare.ok) {
    if (compare.liveOnly.length) console.error("tables only on live:", compare.liveOnly.join(", "));
    if (compare.restoreOnly.length) console.error("tables only on restore:", compare.restoreOnly.join(", "));
    for (const m of compare.mismatches) {
      console.error(`count mismatch ${m.table}: live=${m.live} restored=${m.restored}`);
    }
    console.log("FAIL");
    return false;
  }
  console.log("PASS");
  return true;
}

async function dropDatabase(name: string): Promise<void> {
  const admin = new Client({ connectionString: urlFor("postgres") });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }
}

export function restoreRawStore(
  bundle: string,
  targetRoot = path.join(process.cwd(), "data", "raw"),
): number {
  const source = path.join(bundle, "data", "raw");
  if (!fs.existsSync(source)) return 0;
  let copied = 0;
  for (const sourceFile of filesUnder(source)) {
    const relative = path.relative(source, sourceFile);
    const targetFile = path.join(targetRoot, relative);
    if (fs.existsSync(targetFile)) {
      if (sha256(targetFile) !== sha256(sourceFile)) {
        throw new Error(`refusing to overwrite different raw-store file: data/raw/${relative}`);
      }
      continue;
    }
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile, fs.constants.COPYFILE_EXCL);
    copied++;
  }
  return copied;
}

export async function restore(file: string | undefined, targetName: string | undefined): Promise<void> {
  if (!file) throw new Error("usage: npm run db:restore -- <backup bundle or .dump file> [target database name]");
  const resolved = path.resolve(file);
  const bundle = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : null;
  const dump = bundle ? path.join(bundle, "database.dump") : resolved;
  if (!fs.existsSync(dump)) throw new Error(`database dump not found: ${dump}`);
  const target = targetName ? urlFor(targetName) : urlFor();
  assertLocal(target);
  await setup(target);
  const res = spawnSync(
    pgBinary("pg_restore"),
    ["--clean", "--if-exists", "--no-owner", `--dbname=${target}`, dump],
    { stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error("pg_restore failed");
  const copied = bundle ? restoreRawStore(bundle) : 0;
  console.log(`restored ${dump} into ${dbNameOf(target)}`);
  if (bundle) console.log(`restored ${copied} new data/raw file(s); identical existing files were kept`);
  else console.log("Legacy .dump restored without data/raw; restore a backup bundle for file-backed payloads.");
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pure generation is exported so the launchd contract can be tested without installing it. */
export function nightlyLaunchAgent(repo: string, node: string, npmCli: string): string {
  const log = path.join(repo, "backups", "nightly.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>edu.charlotte.geo.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(npmCli)}</string>
    <string>run</string>
    <string>db:nightly:run</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(repo)}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
}

function nightlyInstall(): void {
  if (process.platform !== "darwin") throw new Error("nightly installer currently supports macOS launchd only");
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("run this installer through npm so npm_execpath is available");
  const agents = path.join(os.homedir(), "Library", "LaunchAgents");
  const plist = path.join(agents, "edu.charlotte.geo.backup.plist");
  fs.mkdirSync(path.join(process.cwd(), "backups"), { recursive: true });
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(plist, nightlyLaunchAgent(process.cwd(), process.execPath, npmCli), { mode: 0o600 });
  const domain = `gui/${process.getuid?.()}`;
  spawnSync("launchctl", ["bootout", domain, plist], { stdio: "ignore" });
  const loaded = spawnSync("launchctl", ["bootstrap", domain, plist], { stdio: "inherit" });
  if (loaded.status !== 0) throw new Error(`launchctl could not load ${plist}`);
  console.log(`nightly 02:00 local backup installed: ${plist}`);
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
      await backup();
      break;
    case "nightly-install":
      nightlyInstall();
      break;
    case "restore":
      await restore(args[0], args[1]);
      break;
    case "verify-backup": {
      const ok = await verifyBackup(args[0]);
      if (!ok) process.exit(1);
      break;
    }
    default:
      console.log("usage: tsx scripts/db.ts <up|setup|migrate|backup|restore|verify-backup|nightly-install>");
      process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

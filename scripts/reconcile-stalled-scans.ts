/**
 * One-shot job: mark long-running scans with no worker as stalled (partial/complete), merge estimate metadata, audit.
 *
 * Usage: `npx tsx scripts/reconcile-stalled-scans.ts`
 * Requires DATABASE_URL (must not equal TEST_DATABASE_URL).
 */
import { loadEnv } from "./env";
import { reconcileStalledScans } from "@/lib/scans/stalled";
import { closeDb, getDb } from "@/lib/db/pg/client";

loadEnv();

const dbUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set.");
if (testUrl && dbUrl === testUrl) {
  throw new Error("Refusing to run: DATABASE_URL equals TEST_DATABASE_URL. Point DATABASE_URL at a non-test database.");
}

async function main(): Promise<void> {
  const db = getDb();
  const changed = await reconcileStalledScans(db);
  if (!changed.length) {
    console.log("No stalled running scans reconciled.");
    return;
  }
  console.log(`Reconciled ${changed.length} scan(s):`);
  for (const r of changed) {
    console.log(
      `  ${r.scanId}: ${r.previousStatus} → ${r.nextStatus} (hadOkDraws=${r.hadOkDraws})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());

/**
 * Export 50 random draw IDs from a scan for gold-label hand checks (docs/EVALS.md).
 *
 *   npx tsx scripts/export-gold-label-sample.ts --scanId <uuid> [--limit 50] [--org <orgId>]
 */
import { eq } from "drizzle-orm";
import { sampleDrawsForGoldLabels } from "@/lib/goldLabels/sample";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { organizations } from "@/lib/db/pg/schema";
import { loadEnv } from "./env";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const scanId = arg("scanId");
  if (!scanId) throw new Error("--scanId is required");
  const limit = Number(arg("limit") ?? "50");
  const db = getDb();
  let orgId = arg("org");
  if (!orgId) {
    ({ orgId } = await legacyContext(db));
  }
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  const rows = await sampleDrawsForGoldLabels(db, orgId, scanId, limit);
  console.log(`# Gold-label sample: org=${org?.name ?? orgId} scan=${scanId} n=${rows.length}`);
  for (const r of rows) {
    console.log([r.drawId, r.engine, r.runner, r.drawIndex].join("\t"));
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

/**
 * Recompute demo-org rollups after the won-rule change (read-only vs draws).
 *   npx tsx scripts/p0-demo-rollup.ts
 */
import { and, desc, eq } from "drizzle-orm";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, organizations, scans } from "@/lib/db/pg/schema";
import { rollupScan } from "@/lib/metrics/rollup";
import { wonRuleLabel } from "@/lib/metrics/stats";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const db = getDb();
  const [demo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (!demo) throw new Error("Demo org missing — run scripts/seed-demo-org.ts first");

  const camps = await db.select().from(campaigns).where(eq(campaigns.orgId, demo.id));
  let totalCells = 0;
  const rules = new Set<string>();

  for (const camp of camps) {
    const scs = await db
      .select()
      .from(scans)
      .where(eq(scans.campaignId, camp.id))
      .orderBy(desc(scans.createdAt));
    for (const scan of scs) {
      const r = await rollupScan(db, { orgId: demo.id, scanId: scan.id, iterations: 200 });
      totalCells += r.cells.length;
      for (const cell of r.cells) {
        if (cell.promptsWon?.rule) rules.add(cell.promptsWon.rule);
      }
      const headline = r.cells
        .filter((x) => !x.key.branded && x.key.regionId == null && x.key.personaId == null)
        .slice(0, 4)
        .map((x) => `${x.key.engine}:${x.promptsWon?.won}/${x.promptsWon?.prompts} [${x.promptsWon?.rule}]`)
        .join("; ");
      console.log(`${camp.name} scan=${scan.id.slice(0, 8)} cells=${r.cells.length} ${headline}`);
    }
  }

  console.log(JSON.stringify({ totalCells, rules: [...rules], n2Label: wonRuleLabel(2) }, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

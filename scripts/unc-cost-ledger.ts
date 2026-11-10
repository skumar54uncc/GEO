/** One-off: UNC Charlotte cost_ledger spend check for B1 gate. */
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const db = getDb();
  const orgs = await db.execute(
    sql`select id, name, is_demo, slug from organizations where slug = ${"unc-charlotte"} or name ilike ${"%UNC Charlotte%"}`,
  );
  console.log("ORGS", orgs.rows);
  const orgId = (orgs.rows[0] as { id: string } | undefined)?.id;
  if (!orgId) {
    await closeDb();
    return;
  }
  const byProvider = await db.execute(sql`
    SELECT provider, count(*)::int AS n,
           coalesce(sum(usd::numeric), 0)::text AS usd_sum,
           count(*) FILTER (WHERE seed_marker IS NULL AND usd IS NOT NULL AND usd::numeric > 0)::int AS paid_positive_usd
    FROM cost_ledger WHERE org_id = ${orgId}::uuid
    GROUP BY provider ORDER BY provider`);
  console.log("BY_PROVIDER", byProvider.rows);
  const total = await db.execute(sql`
    SELECT count(*)::int AS rows,
           coalesce(sum(CASE WHEN usd IS NOT NULL THEN usd::numeric ELSE 0 END), 0)::text AS usd_total,
           count(*) FILTER (WHERE seed_marker IS NOT NULL)::int AS demo_seed_rows,
           count(*) FILTER (WHERE seed_marker IS NULL AND usd IS NOT NULL AND usd::numeric > 0)::int AS paid_positive_usd
    FROM cost_ledger WHERE org_id = ${orgId}::uuid`);
  console.log("TOTAL", total.rows[0]);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

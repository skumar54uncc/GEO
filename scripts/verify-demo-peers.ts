import { loadEnv } from "./env";
loadEnv();
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/pg/client";

async function main() {
  const db = getDb();
  const peers = await db.execute(
    sql`SELECT c.name FROM competitors c JOIN organizations o ON o.id=c.org_id WHERE o.is_demo ORDER BY c.sort_order, c.name`,
  );
  const draws = await db.execute(
    sql`SELECT count(*)::int AS n FROM draws d JOIN scans s ON s.id=d.scan_id JOIN campaigns c ON c.id=s.campaign_id JOIN organizations o ON o.id=c.org_id WHERE o.is_demo`,
  );
  const comps = await db.execute(
    sql`SELECT count(*)::int AS n FROM mentions m JOIN judge_runs j ON j.id=m.judge_run_id JOIN draws d ON d.id=j.draw_id WHERE m.entity_type='competitor' AND d.seed_marker IS NOT NULL`,
  );
  const stalled = await db.execute(
    sql`SELECT id, name, status, estimate->>'stalled' AS stalled FROM scans WHERE status IN ('partial','complete') AND estimate->>'stalled' = 'true' LIMIT 5`,
  );
  console.log(JSON.stringify({ peers: peers.rows, draws: draws.rows, competitorMentions: comps.rows, stalled: stalled.rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

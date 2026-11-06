/**
 * One-shot: compare DATABASE_URL vs TEST_DATABASE_URL and list "prompt N" fixture rows.
 * Does not mutate anything.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadEnv } from "./env";

loadEnv();

function parts(u: string) {
  const x = new URL(u);
  return { host: x.host, db: x.pathname.replace(/^\//, ""), user: x.username };
}

async function inspect(label: string, url: string) {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(parts(url)));
  try {
    const prompts = await db.execute(sql`
      SELECT p.id, p.text, p.status, p.provenance, p.created_at, c.name AS campaign, o.name AS org, o.is_demo
      FROM prompts p
      JOIN campaigns c ON c.id = p.campaign_id
      JOIN organizations o ON o.id = c.org_id
      WHERE p.text ~ '^prompt [0-9]+$'
      ORDER BY p.created_at
    `);
    console.log(`fixture-style prompts (text ~ 'prompt N'): ${(prompts.rows as unknown[]).length}`);
    for (const r of prompts.rows as Array<Record<string, unknown>>) {
      console.log(JSON.stringify(r));
    }

    const draws = await db.execute(sql`
      SELECT d.id, d.engine, d.runner, d.provider, d.status, d.seed_marker, d.created_at,
             p.text AS prompt_text, s.name AS scan_name, s.status AS scan_status, s.created_at AS scan_created,
             c.name AS campaign, o.name AS org, o.is_demo
      FROM draws d
      JOIN prompts p ON p.id = d.prompt_id
      JOIN scans s ON s.id = d.scan_id
      JOIN campaigns c ON c.id = s.campaign_id
      JOIN organizations o ON o.id = c.org_id
      WHERE p.text ~ '^prompt [0-9]+$'
         OR d.answer_text = 'fixture answer'
         OR s.name = 'fixture'
      ORDER BY d.created_at
    `);
    console.log(`fixture-linked draws: ${(draws.rows as unknown[]).length}`);
    for (const r of draws.rows as Array<Record<string, unknown>>) {
      console.log(JSON.stringify(r));
    }

    const scans = await db.execute(sql`
      SELECT s.id, s.name, s.status, s.kind, s.created_at, c.name AS campaign, o.name AS org,
             (SELECT count(*)::int FROM draws d WHERE d.scan_id = s.id) AS draw_count
      FROM scans s
      JOIN campaigns c ON c.id = s.campaign_id
      JOIN organizations o ON o.id = c.org_id
      WHERE s.name = 'fixture' OR o.name ILIKE '%charlotte%'
      ORDER BY s.created_at DESC
      LIMIT 20
    `);
    console.log(`recent charlotte/fixture scans: ${(scans.rows as unknown[]).length}`);
    for (const r of scans.rows as Array<Record<string, unknown>>) {
      console.log(JSON.stringify(r));
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const a = process.env.DATABASE_URL;
  const b = process.env.TEST_DATABASE_URL;
  if (!a || !b) throw new Error("DATABASE_URL and TEST_DATABASE_URL required");
  console.log("equal URLs?", a === b);
  await inspect("DATABASE_URL (dev)", a);
  await inspect("TEST_DATABASE_URL (test)", b);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

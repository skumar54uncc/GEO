/**
 * Lighthouse a11y ≥95 and performance ≥90 on Overview, Visibility, Budget.
 *
 *   npx tsx scripts/phase9b-lighthouse.ts
 */
import fs from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, users } from "@/lib/db/pg/schema";
import { startNextDev, stopNextDev, type NextDevServer } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  const [unc] = await db.select().from(organizations).where(eq(organizations.name, "UNC Charlotte"));
  if (!unc) throw new Error("UNC Charlotte missing");

  const email = "lighthouse@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "Lighthouse" }).returning();
  await db
    .insert(memberships)
    .values({ orgId: unc.id, userId: user.id, role: "viewer" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "viewer" } });
  const { token } = await createSession(email);

  const uncWithDraws = await db.execute(sql`
    SELECT c.id FROM campaigns c
    JOIN scans s ON s.campaign_id = c.id
    JOIN draws d ON d.scan_id = s.id
    WHERE c.org_id = ${unc.id}
    GROUP BY c.id ORDER BY count(d.id) DESC LIMIT 1
  `);
  const uncCampaignId = (uncWithDraws.rows as Array<{ id: string }>)[0]?.id;
  if (!uncCampaignId) throw new Error("No campaign with draws");

  const server: NextDevServer = await startNextDev();
  // Lighthouse needs a Chrome debug port. Launch Playwright Chromium with remote debugging.
  const browser = await chromium.launch({
    headless: true,
    args: ["--remote-debugging-port=9222"],
  });

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const paths = [
    { path: "/", name: "overview" },
    { path: `/campaigns/${uncCampaignId}/dashboard`, name: "visibility" },
    { path: "/budget", name: "budget" },
  ];

  const results: Array<{ name: string; a11y: number; perf: number }> = [];

  try {
    for (const p of paths) {
      const context = await browser.newContext({
        baseURL: server.baseUrl,
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: server.baseUrl },
        { name: ACTIVE_ORG_COOKIE, value: unc.id, url: server.baseUrl },
      ]);
      const page = await context.newPage();
      await page.goto(p.path, { waitUntil: "networkidle" });
      await page.waitForSelector("h1", { timeout: 45_000 });

      const url = page.url();
      const runnerResult = await lighthouse(url, {
        port: 9222,
        output: "json",
        logLevel: "error",
        onlyCategories: ["accessibility", "performance"],
        formFactor: "desktop",
        screenEmulation: { disabled: true },
      });
      const lhr = runnerResult?.lhr;
      const a11y = Math.round((lhr?.categories.accessibility?.score ?? 0) * 100);
      const perf = Math.round((lhr?.categories.performance?.score ?? 0) * 100);
      results.push({ name: p.name, a11y, perf });
      fs.writeFileSync(path.join(outDir, `lighthouse-${p.name}.json`), JSON.stringify({ a11y, perf, url }, null, 2));
      console.log(`${p.name}: a11y=${a11y} perf=${perf}`);
      await context.close();
    }
  } finally {
    await browser.close();
    await stopNextDev(server);
  }

  const failed = results.filter((r) => r.a11y < 95 || r.perf < 90);
  console.log(JSON.stringify(results, null, 2));
  if (failed.length) {
    console.error("Lighthouse thresholds failed:", failed);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

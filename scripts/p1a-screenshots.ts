/**
 * P1a B2 screenshots — demo org @ 390 / 1024 / 1440.
 *   npx tsx scripts/p1a-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, users } from "@/lib/db/pg/schema";
import { startNextDev, stopNextDev } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

const WIDTHS = [390, 1024, 1440] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL");
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  let [demo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (!demo) {
    const seeded = await seedFullDemoOrg(db);
    [demo] = await db.select().from(organizations).where(eq(organizations.id, seeded.orgId));
  }
  if (!demo) throw new Error("Demo org missing");

  const [energy] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, demo.id), eq(campaigns.name, "Energy")))
    .limit(1);
  if (!energy) throw new Error("Energy campaign missing");

  const email = "p1a-review@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "P1a Reviewer" }).returning();
  await db
    .insert(memberships)
    .values({ orgId: demo.id, userId: user.id, role: "editor" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "editor" } });
  const { token } = await createSession(email);

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startNextDev();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        baseURL: server.baseUrl,
        viewport: { width, height: width === 390 ? 844 : 900 },
      });
      await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: server.baseUrl },
        { name: ACTIVE_ORG_COOKIE, value: demo.id, url: server.baseUrl },
      ]);
      const page = await context.newPage();

      await page.goto(`/campaigns/${energy.id}/answers`, { waitUntil: "networkidle", timeout: 180_000 });
      await page.waitForSelector("h1", { timeout: 90_000 });
      await page.getByTestId("answer-filters").waitFor({ timeout: 120_000 });
      await page.waitForTimeout(800);
      // Open first prompt / draw so citations panel can load page headlines.
      const promptBtn = page.getByTestId("answer-list").locator("button").first();
      if ((await promptBtn.count()) > 0) await promptBtn.click();
      await page.waitForTimeout(700);
      const cite = page.getByTestId("citations-panel");
      if ((await cite.count()) > 0) await cite.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const answersPath = path.join(outDir, `p1a-answers-headlines-${width}.png`);
      await page.screenshot({ path: answersPath, fullPage: true });
      console.log("wrote", answersPath);

      await page.goto(`/campaigns/${energy.id}/gaps`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.getByTestId("gap-cards").waitFor({ timeout: 90_000 });
      const share = page.getByTestId("cited-pages-share").first();
      if ((await share.count()) > 0) await share.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const gapsPath = path.join(outDir, `p1a-gaps-share-${width}.png`);
      await page.screenshot({ path: gapsPath, fullPage: true });
      console.log("wrote", gapsPath);

      await context.close();
    }
  } finally {
    await browser.close();
    await stopNextDev(server);
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * P1b Schedules UI screenshots — demo org @ 390 / 1024 / 1440.
 *   npx tsx scripts/p1b-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, promptSets, users } from "@/lib/db/pg/schema";
import { createSchedule, listSchedules } from "@/lib/schedules";
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

  const [frozen] = await db
    .select()
    .from(promptSets)
    .where(and(eq(promptSets.campaignId, energy.id)))
    .limit(1);
  if (!frozen?.frozenAt) throw new Error("Energy frozen prompt set missing");

  const existing = await listSchedules(db, demo.id, energy.id);
  if (existing.length === 0) {
    await createSchedule(db, demo.id, {
      campaign_id: energy.id,
      prompt_set_id: frozen.id,
      cadence: "biweekly",
      budget_cap_usd: 12.5,
      estimate_approved: true,
      approved_estimate_usd: 12.5,
    });
  }

  const email = "p1b-review@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "P1b Reviewer" }).returning();
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
      page.on("pageerror", (err) => console.error("pageerror", err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.error("console", msg.text());
      });
      const res = await page.goto("/settings", { waitUntil: "domcontentloaded", timeout: 180_000 });
      console.log("settings status", res?.status(), "url", page.url());
      await page.waitForSelector("h1", { timeout: 90_000 });
      const panel = page.getByTestId("schedules-panel");
      try {
        await panel.waitFor({ timeout: 60_000 });
      } catch (err) {
        const html = await page.content();
        console.error("schedules-panel missing; title=", await page.title());
        console.error(html.slice(0, 2000));
        throw err;
      }
      await panel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const shot = path.join(outDir, `p1b-schedules-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log("wrote", shot);
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

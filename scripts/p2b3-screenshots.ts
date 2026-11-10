/**
 * P2 B3 Regions screenshots — Visibility region comparison @ 390 / 1024 / 1440.
 *   npx tsx scripts/p2b3-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { ensureCatalogRegions } from "@/lib/capture/regions";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaignRegions, campaigns, memberships, organizations, users } from "@/lib/db/pg/schema";
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

  // Attach US national as a second region so the comparison table has >1 region when data exists.
  const catalog = await ensureCatalogRegions(db);
  const us = catalog.find((r) => r.label === "United States");
  if (us) {
    await db.insert(campaignRegions).values({ campaignId: energy.id, regionId: us.id }).onConflictDoNothing();
  }

  const email = "p2b3-review@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "P2 B3 Reviewer" }).returning();
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
      await page.goto(`/campaigns/${energy.id}/dashboard`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForSelector("h1", { timeout: 90_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `p2b3-regions-${width}.png`), fullPage: true });
      console.log("wrote", `p2b3-regions-${width}.png`);

      await page.goto("/campaigns", { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForSelector("h1", { timeout: 90_000 });
      const newBtn = page.getByRole("button", { name: /New campaign|Create campaign/i }).first();
      if (await newBtn.count()) {
        await newBtn.click();
        await page.waitForSelector('[data-testid="campaign-regions"]', { timeout: 15_000 }).catch(() => null);
      }
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `p2b3-campaign-regions-${width}.png`), fullPage: true });
      console.log("wrote", `p2b3-campaign-regions-${width}.png`);
      await context.close();
    }
  } finally {
    await browser.close();
    await stopNextDev(server);
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

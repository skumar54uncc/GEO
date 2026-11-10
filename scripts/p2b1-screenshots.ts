/**
 * P2 B1 Demand screenshots — demo + UNC orgs @ 390 / 1024 / 1440.
 *   npx tsx scripts/p2b1-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedDemoDemandSignals } from "@/lib/demand/demoSeedSignals";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, demandSignals, memberships, organizations, users } from "@/lib/db/pg/schema";
import { startNextDev, stopNextDev } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

const WIDTHS = [390, 1024, 1440] as const;

async function ensureUser(email: string, name: string, orgId: string) {
  const db = getDb();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name }).returning();
  await db
    .insert(memberships)
    .values({ orgId, userId: user.id, role: "editor" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "editor" } });
  return createSession(email);
}

async function shot(
  baseUrl: string,
  token: string,
  orgId: string,
  campaignId: string,
  prefix: string,
  outDir: string,
) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width, height: width === 390 ? 844 : 900 },
      });
      await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: baseUrl },
        { name: ACTIVE_ORG_COOKIE, value: orgId, url: baseUrl },
      ]);
      const page = await context.newPage();
      await page.goto(`/campaigns/${campaignId}/demand`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForSelector('[data-testid="demand-page"]', { timeout: 90_000 });
      await page.waitForTimeout(400);
      const file = `p2b1-demand-${prefix}-${width}.png`;
      await page.screenshot({ path: path.join(outDir, file), fullPage: true });
      console.log("wrote", file);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

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

  const [existingDemand] = await db
    .select({ id: demandSignals.id })
    .from(demandSignals)
    .where(eq(demandSignals.campaignId, energy.id))
    .limit(1);
  if (!existingDemand) await seedDemoDemandSignals(db, energy.id, "Energy");

  const unc = await legacyContext(db);
  const [uncCampaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, unc.campaignId))
    .limit(1);
  if (!uncCampaign) throw new Error("UNC campaign missing");

  const demoSession = await ensureUser("p2b1-demo@charlotte.edu", "P2 B1 Demo", demo.id);
  const uncSession = await ensureUser("p2b1-unc@charlotte.edu", "P2 B1 UNC", unc.orgId);

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startNextDev();
  try {
    await shot(server.baseUrl, demoSession.token, demo.id, energy.id, "demo", outDir);
    await shot(server.baseUrl, uncSession.token, unc.orgId, uncCampaign.id, "unc", outDir);
  } finally {
    await stopNextDev(server);
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

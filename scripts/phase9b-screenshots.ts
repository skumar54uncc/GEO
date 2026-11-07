/**
 * Phase 9B Scout redesign screenshots (gitignored under docs/phase9-screenshots/).
 *
 *   npx tsx scripts/phase9b-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, users } from "@/lib/db/pg/schema";
import { startNextDev, stopNextDev, type NextDevServer } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) {
    throw new Error("Refusing screenshots: DATABASE_URL equals TEST_DATABASE_URL");
  }

  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  const [unc] = await db.select().from(organizations).where(eq(organizations.name, "UNC Charlotte"));
  if (!unc) throw new Error("UNC Charlotte org missing from DATABASE_URL");

  let demo: { orgId: string; campaignIds: string[] };
  const [existingDemo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (existingDemo) {
    const camps = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, existingDemo.id));
    if (camps.length >= 3) {
      demo = { orgId: existingDemo.id, campaignIds: camps.map((c) => c.id) };
    } else {
      demo = await seedFullDemoOrg(db);
    }
  } else {
    demo = await seedFullDemoOrg(db);
  }

  const email = "leadership@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await db.insert(users).values({ email, name: "Lauren" }).returning();
  } else if (user.name !== "Lauren") {
    await db.update(users).set({ name: "Lauren" }).where(eq(users.id, user.id));
  }
  await db
    .insert(memberships)
    .values({ orgId: unc.id, userId: user.id, role: "viewer" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "viewer" } });
  await db
    .insert(memberships)
    .values({ orgId: demo.orgId, userId: user.id, role: "viewer" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "viewer" } });
  const { token } = await createSession(email);

  const uncWithDraws = await db.execute(sql`
    SELECT c.id, c.name
    FROM campaigns c
    JOIN scans s ON s.campaign_id = c.id AND s.kind = 'scan'
    JOIN draws d ON d.scan_id = s.id
    WHERE c.org_id = ${unc.id}
    GROUP BY c.id, c.name
    ORDER BY count(d.id) DESC
    LIMIT 1
  `);
  const top = (uncWithDraws.rows as Array<{ id: string; name: string }>)[0];
  let uncCampaignId = top?.id ?? null;
  if (!uncCampaignId) {
    const [fallback] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.orgId, unc.id), eq(campaigns.status, "active")))
      .orderBy(campaigns.createdAt)
      .limit(1);
    uncCampaignId = fallback?.id ?? null;
  }
  if (!uncCampaignId) throw new Error("No UNC Charlotte campaign");

  const demoCamps = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, demo.orgId));
  const demoCampaignId = (demoCamps.find((c) => c.name === "Energy") ?? demoCamps[0])?.id ?? demo.campaignIds[0];

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const server: NextDevServer = await startNextDev();
  const browser = await chromium.launch({ headless: true });

  async function shot(
    orgId: string,
    pagePath: string,
    file: string,
    opts?: { width?: number; height?: number; dark?: boolean; reducedMotion?: boolean },
  ) {
    const context = await browser.newContext({
      baseURL: server.baseUrl,
      viewport: { width: opts?.width ?? 1440, height: opts?.height ?? 900 },
      colorScheme: opts?.dark ? "dark" : "light",
      reducedMotion: opts?.reducedMotion ? "reduce" : "no-preference",
    });
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: server.baseUrl },
      { name: ACTIVE_ORG_COOKIE, value: orgId, url: server.baseUrl },
    ]);
    const page = await context.newPage();
    if (opts?.dark) {
      await page.addInitScript(() => document.documentElement.classList.add("dark"));
    }
    await page.goto(pagePath, { waitUntil: "networkidle" });
    await page.waitForSelector("h1", { timeout: 45_000 });
    await page.screenshot({ path: path.join(outDir, file), fullPage: true });
    await context.close();
    console.log("wrote", file);
  }

  try {
    await shot(unc.id, "/", "overview-unc.png");
    await shot(demo.orgId, "/", "overview-demo.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/dashboard`, "visibility-unc.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/answers`, "answers-unc.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/gaps`, "gaps-unc.png");
    await shot(unc.id, "/budget", "budget-unc.png");
    await shot(unc.id, "/", "overview-tablet.png", { width: 1024, height: 900 });
    await shot(unc.id, "/", "overview-dark.png", { dark: true });
    await shot(unc.id, "/", "overview-reduced-motion.png", { reducedMotion: true });
    await shot(demo.orgId, `/campaigns/${demoCampaignId}/dashboard`, "visibility-demo.png");
    await shot(demo.orgId, "/budget", "budget-demo.png");
    console.log(JSON.stringify({ uncOrgId: unc.id, uncCampaignId, demoOrgId: demo.orgId, demoCampaignId }, null, 2));
  } finally {
    await browser.close();
    await stopNextDev(server);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

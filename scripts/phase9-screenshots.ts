/**
 * Retake Phase 9 review screenshots from the real DATABASE_URL (never TEST_DATABASE_URL).
 *
 *   npx tsx scripts/phase9-screenshots.ts
 *
 * Writes to docs/phase9-screenshots/ (gitignored). Seeds Demo University if needed.
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

  // Force Next + this process onto the real DB (do not let TEST override).
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  const [unc] = await db.select().from(organizations).where(eq(organizations.name, "UNC Charlotte"));
  if (!unc) throw new Error("UNC Charlotte org missing from DATABASE_URL");

  // Reuse an existing full demo seed when present (avoid re-deleting immutable draws every run).
  let demo: { orgId: string; campaignIds: string[] };
  const [existingDemo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (existingDemo) {
    const camps = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, existingDemo.id));
    if (camps.length >= 3) {
      demo = { orgId: existingDemo.id, campaignIds: camps.map((c) => c.id) };
      console.log("Reusing existing Demo University seed", demo.orgId);
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

  // Prefer the UNC campaign that actually has measured draws (legacy Energy).
  const uncWithDraws = await db.execute(sql`
    SELECT c.id, c.name, s.id AS scan_id, count(d.id)::int AS draw_count
    FROM campaigns c
    JOIN scans s ON s.campaign_id = c.id AND s.kind = 'scan'
    JOIN draws d ON d.scan_id = s.id
    WHERE c.org_id = ${unc.id}
    GROUP BY c.id, c.name, s.id
    ORDER BY count(d.id) DESC
    LIMIT 1
  `);
  const top = (uncWithDraws.rows as Array<{ id: string; name: string; scan_id: string; draw_count: number }>)[0];
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
  const uncScanId = top?.scan_id ?? null;

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  // nextDevServer prefers TEST_DATABASE_URL — we deleted it so DATABASE_URL is used.
  const server: NextDevServer = await startNextDev();
  const browser = await chromium.launch({ headless: true });

  async function shot(orgId: string, pagePath: string, file: string) {
    const context = await browser.newContext({
      baseURL: server.baseUrl,
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: server.baseUrl },
      { name: ACTIVE_ORG_COOKIE, value: orgId, url: server.baseUrl },
    ]);
    const page = await context.newPage();
    await page.goto(pagePath, { waitUntil: "networkidle" });
    await page.waitForSelector("h1", { timeout: 45_000 });
    await page.screenshot({ path: path.join(outDir, file), fullPage: true });
    await context.close();
    console.log("wrote", file);
  }

  try {
    // Prefer Energy demo campaign for dashboard/gaps when present (varied scan deltas).
    const demoCamps = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.orgId, demo.orgId));
    const demoEnergy = demoCamps.find((c) => c.name === "Energy") ?? demoCamps[0];
    const demoCampaignId = demoEnergy?.id ?? demo.campaignIds[0];
    await shot(unc.id, "/", "overview-unc.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/dashboard`, "campaign-dashboard-unc.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/answers`, "answers-unc.png");
    await shot(unc.id, `/campaigns/${uncCampaignId}/gaps`, "gaps-unc.png");
    await shot(unc.id, "/budget", "budget-unc.png");
    await shot(demo.orgId, "/", "overview-demo.png");
    await shot(demo.orgId, `/campaigns/${demoCampaignId}/dashboard`, "campaign-dashboard-demo.png");
    await shot(demo.orgId, `/campaigns/${demoCampaignId}/answers`, "answers-demo.png");
    await shot(demo.orgId, `/campaigns/${demoCampaignId}/gaps`, "gaps-demo.png");
    await shot(demo.orgId, "/budget", "budget-demo.png");
    console.log(
      JSON.stringify(
        {
          database: new URL(databaseUrl).pathname.replace(/^\//, ""),
          uncOrgId: unc.id,
          uncCampaignId,
          uncScanId,
          demoOrgId: demo.orgId,
          demoCampaignIds: demo.campaignIds,
          demoOrgName: DEMO_ORG_NAME,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await stopNextDev(server);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

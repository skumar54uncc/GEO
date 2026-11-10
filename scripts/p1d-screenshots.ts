/**
 * P1d Overview + leadership PDF screenshots — demo org @ 390 / 1024 / 1440.
 *   npx tsx scripts/p1d-screenshots.ts
 */
import fs from "fs";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, scans, users } from "@/lib/db/pg/schema";
import { setAnalystNote } from "@/lib/scans/analystNote";
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

  await db
    .update(campaigns)
    .set({
      target: { metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" },
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, energy.id));

  const email = "p1d-review@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "P1d Reviewer" }).returning();
  await db
    .insert(memberships)
    .values({ orgId: demo.id, userId: user.id, role: "editor" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "editor" } });

  const [latestScan] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.campaignId, energy.id), eq(scans.kind, "scan")))
    .orderBy(desc(scans.createdAt))
    .limit(1);
  if (latestScan) {
    await setAnalystNote(db, {
      orgId: demo.id,
      scanId: latestScan.id,
      authorId: user.id,
      text: "Chat engines held steady this cycle for Energy. Citation coverage on owned domains remains the clearest gap. Share of voice improved slightly on ChatGPT versus the prior scan. Leadership should treat the first frozen-set scan as Baseline when reading the trend.",
      status: "published",
    });
  }

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
      await page.goto(`/`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForSelector("h1", { timeout: 90_000 });
      await page.waitForTimeout(600);
      const shot = path.join(outDir, `p1d-overview-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log("wrote", shot);
      await context.close();
    }

    // Real application/pdf sample from the demo org.
    const pdfUrl = `${server.baseUrl}/api/campaigns/${energy.id}/leadership-pdf`;
    const pdfRes = await fetch(pdfUrl, {
      headers: { cookie: `${SESSION_COOKIE}=${token}; ${ACTIVE_ORG_COOKIE}=${demo.id}` },
    });
    if (!pdfRes.ok) throw new Error(`leadership-pdf HTTP ${pdfRes.status}`);
    const ct = pdfRes.headers.get("content-type") ?? "";
    if (!ct.includes("application/pdf")) throw new Error(`expected application/pdf, got ${ct}`);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    if (pdfBuf.subarray(0, 5).toString("utf8") !== "%PDF-") throw new Error("response is not a PDF");
    const pdfPath = path.join(outDir, "p1d-leadership-demo.pdf");
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log("wrote", pdfPath, "bytes", pdfBuf.length, "content-type", ct);
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

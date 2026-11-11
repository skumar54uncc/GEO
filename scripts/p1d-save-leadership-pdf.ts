/**
 * Save a real demo leadership PDF without starting Next/Playwright.
 *   npx tsx scripts/p1d-save-leadership-pdf.ts
 */
import fs from "fs";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, scans, users } from "@/lib/db/pg/schema";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { leadershipPdfInputFromCells, type PdfCell } from "@/lib/exports/leadershipPdfInput";
import { extractPdfStrings } from "@/lib/exports/simplePdf";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";
import { setAnalystNote } from "@/lib/scans/analystNote";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL");
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;

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

  const email = "p1d-pdf-sample@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "Editor" }).returning();
  else if (user.name !== "Editor") {
    [user] = await db.update(users).set({ name: "Editor" }).where(eq(users.id, user.id)).returning();
  }
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
      text: "Chat engines held steady this cycle for Energy. Citation coverage on owned domains remains the clearest gap. Leadership should treat the first frozen-set scan as Baseline when reading the trend.",
      status: "published",
    });
  }

  const dash = await rollupCampaignDashboard(db, { orgId: demo.id, campaignId: energy.id });
  const view = dash.promptSets[0] ?? null;
  const cells: PdfCell[] =
    view?.rollup.cells
      .filter(
        (c) => !c.key.branded && c.key.personaId == null && c.key.personaGroup == null && c.key.regionId == null,
      )
      .map((c) => ({
        engine: c.key.engine,
        runner: c.key.runner,
        won: c.promptsWon?.won ?? null,
        prompts: c.promptsWon?.prompts ?? null,
        rate: c.promptsWon?.rate ?? null,
        ciLow: c.promptsWon?.ciLow ?? null,
        ciHigh: c.promptsWon?.ciHigh ?? null,
        draws: c.draws,
      })) ?? [];

  const input = leadershipPdfInputFromCells({
    organization: { name: dash.organization.name, isDemo: true },
    campaign: { name: dash.campaign.name, topic: dash.campaign.topic },
    cells,
    target: dash.target,
    trendLabel: null,
    previousScanDate: view?.previousScan?.createdAt.slice(0, 10) ?? null,
    analystNote:
      dash.analystNote?.status === "published"
        ? {
            text: dash.analystNote.text,
            authorName: dash.analystNote.authorName,
            at: dash.analystNote.at,
            status: "published",
          }
        : null,
    baselineDate: (view?.trend ?? []).find((t) => t.isBaseline)?.createdAt.slice(0, 10) ?? null,
    latestScan: view
      ? {
          createdAt: view.latestScan.createdAt,
          isBaseline: Boolean(
            view.trend[view.trend.length - 1]?.isBaseline &&
              view.trend[view.trend.length - 1]?.scanId === view.latestScan.id,
          ),
        }
      : null,
    includeAccuracy: false,
  });
  if (input.headline) {
    input.trendLabel =
      view?.comparisons.find(
        (c) =>
          c.series.engine === input.headline!.engine &&
          c.series.runner === input.headline!.runner &&
          !c.series.branded,
      )?.label ?? null;
  }

  const bytes = leadershipPdfBytes(input);
  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "p1d-leadership-demo.pdf");
  fs.writeFileSync(out, Buffer.from(bytes));
  const extracted = extractPdfStrings(bytes);
  fs.writeFileSync(path.join(outDir, "p1d-leadership-demo.txt"), extracted);
  console.log("wrote", out, "bytes", bytes.length);
  console.log(
    "runners",
    input.engines.map((e) => `${e.engine}:${e.runner}`),
  );
  console.log("checks", {
    pdfHeader: Buffer.from(bytes).subarray(0, 5).toString() === "%PDF-",
    demo: extracted.includes("DEMO DATA"),
    banner: extracted.includes("Demo data. Fictional university"),
    consumerApp: extracted.includes("Captured from the consumer app"),
    noLocalhost: !extracted.includes("127.0.0.1") && !extracted.includes("localhost"),
  });
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Lists or removes test/fixture rows accidentally stored under UNC Charlotte.
 *
 * Default: dry-run (no deletes).
 * Apply: `npx tsx scripts/admin-cleanup-fixture-contamination.ts --apply`
 * Test DB: refused unless `--allow-test-db`.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { loadEnv } from "./env";
import { FORBIDDEN_SEED_MARKERS } from "@/lib/contracts/demoSeed";
import { DEFAULT_ORG_SLUG } from "@/lib/db/pg/bootstrap";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { auditLog, campaigns, draws, organizations, prompts, scans } from "@/lib/db/pg/schema";

loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set.");
if (process.env.TEST_DATABASE_URL && dbUrl === process.env.TEST_DATABASE_URL && !process.argv.includes("--allow-test-db")) {
  throw new Error("Refusing to run against TEST_DATABASE_URL. Pass --allow-test-db if you really mean to.");
}

const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORG_SLUG));
  if (!org) {
    console.log(`No organization with slug ${DEFAULT_ORG_SLUG}. Nothing to do.`);
    return;
  }

  const campRows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, org.id));
  const campaignIds = campRows.map((r) => r.id);
  if (!campaignIds.length) {
    console.log("UNC Charlotte has no campaigns.");
    return;
  }

  const markerList = sql.join(
    FORBIDDEN_SEED_MARKERS.map((m) => sql`${m}`),
    sql`, `,
  );

  const badPrompts = await db
    .select({ id: prompts.id, text: prompts.text })
    .from(prompts)
    .where(and(inArray(prompts.campaignId, campaignIds), sql`${prompts.text} ~ '^[[:space:]]*prompt[[:space:]]+[0-9]+[[:space:]]*$'`));

  const badScans = await db
    .select({ id: scans.id, name: scans.name })
    .from(scans)
    .where(and(inArray(scans.campaignId, campaignIds), sql`lower(trim(${scans.name})) in ('fixture', 'demo seed scan')`));

  const badPromptIds = new Set(badPrompts.map((p) => p.id));
  const badScanIds = new Set(badScans.map((s) => s.id));
  const promptIdList = [...badPromptIds];
  const scanIdList = [...badScanIds];

  const promptClause = promptIdList.length ? inArray(draws.promptId, promptIdList) : sql`false`;
  const scanClause = scanIdList.length ? inArray(draws.scanId, scanIdList) : sql`false`;

  const drawRows = await db
    .select({
      id: draws.id,
      answerText: draws.answerText,
      seedMarker: draws.seedMarker,
      scanId: draws.scanId,
      promptId: draws.promptId,
    })
    .from(draws)
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .where(
      and(
        inArray(scans.campaignId, campaignIds),
        or(
          sql`${draws.seedMarker} in (${markerList})`,
          eq(sql`trim(${draws.answerText})`, "fixture answer"),
          promptClause,
          scanClause,
        ),
      ),
    );

  const drawIds = [...new Set(drawRows.map((r) => r.id))];

  console.log(`Organization: ${org.name} (${org.slug})`);
  console.log(`Fixture-like prompts: ${badPrompts.length}`);
  console.log(`Fixture-like scans: ${badScans.length}`);
  console.log(`Contaminated draws: ${drawIds.length}`);

  if (!apply) {
    if (badPrompts.length) console.log("Sample prompts:", badPrompts.slice(0, 5).map((p) => p.text));
    if (badScans.length) console.log("Scans:", badScans.map((s) => `${s.name} (${s.id})`).join("; "));
    console.log("Dry-run only. Pass --apply to delete (with audit_log rows).");
    return;
  }

  if (!drawIds.length && !badScanIds.size && !badPromptIds.size) {
    console.log("Nothing to delete.");
    return;
  }

  if (drawIds.length) {
    throw new Error(
      `Refusing: ${drawIds.length} draw(s) match fixture patterns. Draws are immutable — cannot DELETE them (session_replication_role bypass removed). Soft-archive the org or leave the rows.`,
    );
  }

  await db.transaction(async (tx) => {
    const t = tx as typeof db;

    const emptyScans =
      badScanIds.size === 0
        ? []
        : await t
            .select({ id: scans.id })
            .from(scans)
            .leftJoin(draws, eq(draws.scanId, scans.id))
            .where(and(inArray(scans.campaignId, campaignIds), inArray(scans.id, scanIdList), sql`${draws.id} is null`));

    if (emptyScans.length) {
      const ids = emptyScans.map((r) => r.id);
      await t.insert(auditLog).values({
        orgId: org.id,
        action: "admin_cleanup_fixture_scans",
        entityType: "scan",
        entityId: "batch",
        before: { ids },
        after: null,
      });
      await t.delete(scans).where(inArray(scans.id, ids));
    }

    const orphanPrompts =
      badPromptIds.size === 0
        ? []
        : await t
            .select({ id: prompts.id })
            .from(prompts)
            .leftJoin(draws, eq(draws.promptId, prompts.id))
            .where(and(inArray(prompts.campaignId, campaignIds), inArray(prompts.id, promptIdList), sql`${draws.id} is null`));

    if (orphanPrompts.length) {
      const ids = orphanPrompts.map((r) => r.id);
      await t.insert(auditLog).values({
        orgId: org.id,
        action: "admin_cleanup_fixture_prompts",
        entityType: "prompt",
        entityId: "batch",
        before: { count: ids.length, ids },
        after: null,
      });
      await t.delete(prompts).where(inArray(prompts.id, ids));
    }
  });

  console.log("Applied: deleted contaminated rows (see audit_log).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());

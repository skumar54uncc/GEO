/**
 * Backfill citation rows for google_aio draws that have none, from stored raw payloads.
 * Never updates draws. Dry-run by default; pass --apply to insert.
 * Also reflags location-biased prompts (brand alias or city) when --org is set.
 *
 * Usage: npx tsx scripts/backfill-aio-citations.ts [--apply] [--org <slug>]
 */
import { eq } from "drizzle-orm";
import { backfillAioCitationsFromRaw, reflagLocationBiasedPrompts } from "@/lib/citations/backfillFromRaw";
import { getDb } from "@/lib/db/pg/client";
import { brands, organizations } from "@/lib/db/pg/schema";
import { loadAliases } from "@/lib/judge/aliases";
import { isLocationBiasedPrompt } from "@/lib/prompts/branded";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const apply = process.argv.includes("--apply");
  const orgIdx = process.argv.indexOf("--org");
  const orgSlug = orgIdx >= 0 ? process.argv[orgIdx + 1] : undefined;
  const db = getDb();

  let orgId: string | undefined;
  let brandId: string | undefined;
  if (orgSlug) {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
    if (!org) {
      console.error(`Org slug not found: ${orgSlug}`);
      process.exit(1);
    }
    orgId = org.id;
    const [brand] = await db.select().from(brands).where(eq(brands.orgId, org.id)).limit(1);
    brandId = brand?.id;
  }

  const result = await backfillAioCitationsFromRaw(db, { orgId, dryRun: !apply });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", citations: result }, null, 2));

  if (apply && orgId && brandId) {
    const aliases = await loadAliases(db, orgId, brandId);
    const reflag = await reflagLocationBiasedPrompts(db, {
      orgId,
      isBiased: (text) => isLocationBiasedPrompt(text, aliases),
    });
    console.log(JSON.stringify({ locationBiasedReflag: reflag }, null, 2));
  } else if (orgId && brandId) {
    console.log("Skipping location-biased reflag (pass --apply).");
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to insert citation rows and reflag prompts.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

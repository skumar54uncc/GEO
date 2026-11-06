/**
 * Seeds the full Demo University leadership dataset (see `seedFullDemoOrg`).
 *
 * Usage: `npx tsx scripts/seed-demo-org.ts`
 * Requires DATABASE_URL (not the same as TEST_DATABASE_URL).
 */
import { eq } from "drizzle-orm";
import { loadEnv } from "./env";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns } from "@/lib/db/pg/schema";

loadEnv();

const dbUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is not set.");
if (testUrl && dbUrl === testUrl) {
  throw new Error("Refusing to run: DATABASE_URL equals TEST_DATABASE_URL. Point DATABASE_URL at a non-test database.");
}

async function main(): Promise<void> {
  const db = getDb();
  const { orgId, campaignIds } = await seedFullDemoOrg(db);
  const names = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, orgId));
  console.log(`Demo org id: ${orgId}`);
  console.log(
    "Campaigns:",
    names.map((r) => r.name).join(", "),
  );
  console.log(`Campaign ids (${campaignIds.length}):`, campaignIds.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());

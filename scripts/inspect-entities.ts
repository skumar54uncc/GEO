import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db/pg/client";
import { crawlRuns } from "../lib/db/pg/schema";
import { primaryHostFor } from "../lib/site/context";
import { extractEntityCandidates, loadEntityPages } from "../lib/site/entities";
import { nodeTypes, schemaNodes } from "../lib/site/extract";
import { loadEnv } from "./env";

loadEnv();

// usage: npm run entities:inspect -- <site id>
// Read only: prints what deterministic extraction sees on the latest crawl, for tuning the rules.
async function main() {
  const siteId = process.argv[2];
  if (!siteId) throw new Error("usage: npm run entities:inspect -- <site id>");
  const db = getDb();
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.siteId, siteId)).orderBy(desc(crawlRuns.createdAt)).limit(1);
  const pages = await loadEntityPages(db, run.id);
  console.log(`crawl ${run.id}: ${pages.length} pages`);
  const titleTails = new Map<string, number>();
  const orgNames = new Map<string, number>();
  for (const p of pages) {
    const parts = (p.title ?? "").split(/\s+[|–—-]\s+/);
    if (parts.length > 1) titleTails.set(parts[parts.length - 1], (titleTails.get(parts[parts.length - 1]) ?? 0) + 1);
    for (const n of schemaNodes(Array.isArray(p.schemaRaw) ? p.schemaRaw : [])) {
      if (nodeTypes(n).some((t) => /Organization|CollegeOrUniversity/.test(t)) && typeof n.name === "string") {
        const key = `${nodeTypes(n).join("/")}: ${n.name}`;
        orgNames.set(key, (orgNames.get(key) ?? 0) + 1);
      }
    }
  }
  console.log("title tails:", Array.from(titleTails.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15));
  console.log("schema org names:", Array.from(orgNames.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15));
  const c = extractEntityCandidates(pages, { primaryHost: await primaryHostFor(db, siteId) });
  for (const kind of ["name", "alias", "college", "program", "research_center", "location", "ranking_claim"]) {
    const list = c.filter((x) => x.kind === kind);
    console.log(`\n${kind} (${list.length})`);
    for (const x of list.slice(0, 40)) console.log(`  ${x.requiresContext ? "[ctx] " : ""}${x.value.slice(0, 110)}  <- ${x.method} ${x.sourceUrls.length}p`);
  }
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

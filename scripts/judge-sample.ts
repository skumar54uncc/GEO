import fs from "fs";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { sampleRowsToCsv, selectBrandMatchedSample } from "../lib/judge/sample";
import { loadEnv } from "./env";

loadEnv();

const USAGE = `usage:
  npm run judge:sample -- <scanId> [--out path.csv]

Picks 20 ok brand-matched draws spread across engines. No paid calls.
CSV columns: draw_id, engine, prompt, answer, sentiment, missed_mention, named_sources
(label columns left blank for hand labeling).`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const scanId = process.argv.find((a, i) => i >= 2 && !a.startsWith("--") && /^[0-9a-f-]{36}$/i.test(a));
  if (!scanId) {
    console.error(USAGE);
    process.exit(1);
  }
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : `judge-sample-${scanId.slice(0, 8)}.csv`;

  const db = getDb();
  const { orgId } = await legacyContext(db);
  const rows = await selectBrandMatchedSample(db, { orgId, scanId, limit: 20 });
  const csv = sampleRowsToCsv(rows);
  fs.writeFileSync(outPath, csv, "utf8");
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
  const byEngine = new Map<string, number>();
  for (const r of rows) byEngine.set(r.engine, (byEngine.get(r.engine) ?? 0) + 1);
  console.table([...byEngine.entries()].map(([engine, n]) => ({ engine, n })));
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

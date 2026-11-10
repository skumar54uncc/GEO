import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { sendJob } from "../lib/jobs";
import { runJudgeScanEnqueue } from "../lib/judge/scanEnqueue";
import { loadEnv } from "./env";

loadEnv();

const USAGE = `usage:
  npm run judge:scan -- <scanId>
  npm run judge:scan -- <scanId> --approve

Runs Fireworks model preflight, prints a judge estimate, and enqueues judge.run only with --approve.`;

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
  const approve = process.argv.includes("--approve");
  const db = getDb();
  const { orgId } = await legacyContext(db);
  const boss = {
    send: async (queue: string, data: { scan_id: string; org_id: string }) => sendJob(queue, data),
  };
  const result = await runJudgeScanEnqueue(db, boss, { orgId, scanId, approve });
  console.log(
    `Judge estimate for scan ${result.estimate.scanId}: ${result.estimate.okDraws} ok draws ≈ ${result.estimate.estimatedUnits} token-units (chars/4 stand-in).`,
  );
  console.log(`Models: ${result.estimate.modelIds.join(", ") || "(none)"}`);
  if (!result.enqueued) {
    console.log(result.reason ?? "No job sent.");
    if (!approve) console.log("Re-run with --approve to enqueue judge.run.");
    return;
  }
  console.log("Enqueued judge.run.");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

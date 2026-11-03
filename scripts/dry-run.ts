import { asc, eq } from "drizzle-orm";
import { planDryRun, runDryRun } from "../lib/capture/dryRun";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { campaigns } from "../lib/db/pg/schema";
import { loadEnv } from "./env";

loadEnv();

const USAGE = `usage:
  npm run capture:dry-run                                   plan: prints the estimate and a scan id, calls nothing
  npm run capture:dry-run -- --campaign <id>                plan for a specific campaign
  npm run capture:dry-run -- --approve <scan id> --usd <total from the plan>   run it`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const money = (v: number | null) => (v === null ? "unknown" : `$${v.toFixed(4)}`);

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const db = getDb();
  const { orgId } = await legacyContext(db);
  const scanId = arg("approve");

  if (!scanId) {
    const campaignId = arg("campaign") ?? (await db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(asc(campaigns.createdAt)))[0]?.id;
    if (!campaignId) throw new Error("No campaign. Create one first.");
    const { scanId: id, estimate } = await planDryRun(db, { orgId, campaignId });
    console.table(
      estimate.cells.map((c) => ({ engine: c.engine, runner: c.runner, provider: c.provider, fidelity: c.fidelity, draws: c.draws, each: money(c.usdEach), total: money(c.usd), missing: c.missingConfig.join(" ") })),
    );
    console.log(`Draws: ${estimate.totalDraws} (including ${estimate.canaryDraws} canary draws). Estimated total: ${money(estimate.totalUsd)}`);
    if (estimate.refusals.length) {
      console.log("\nRefused; this dry run cannot be approved:");
      for (const r of estimate.refusals) console.log(`  - ${r}`);
      console.log("\nFix the above, then plan again.");
      return;
    }
    console.log(`\nTo run it, approve this exact amount:\n  npm run capture:dry-run -- --approve ${id} --usd ${estimate.totalUsd}`);
    return;
  }

  const usd = Number(arg("usd"));
  if (!Number.isFinite(usd)) throw new Error(`--usd is required.\n${USAGE}`);
  const summary = await runDryRun(db, { orgId, scanId, approvedUsd: usd, approver: "cli:dry-run", log: (m) => console.log(m) });
  console.log("");
  for (const c of summary.canaries) console.log(`canary ${c.route.engine} ${c.route.runner} ${c.route.provider}: ${c.ok ? "ok" : `FAILED ${c.reason}`}`);
  console.table(
    summary.byCell.map((c) => ({ engine: c.engine, runner: c.runner, provider: c.provider, fidelity: c.fidelity, ok: c.ok, empty: c.empty, error: c.error, blocked: c.blocked, actual: money(c.costUsd), estimate: money(c.estimateUsd) })),
  );
  console.log(`Status: ${summary.status}. Actual ${money(summary.actualUsd)} vs estimate ${money(summary.estimateUsd)}. Scan ${summary.scanId}.`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

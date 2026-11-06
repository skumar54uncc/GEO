import { planRetry, runRetry } from "../lib/capture/batch";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { loadEnv } from "./env";

loadEnv();

const USAGE = `usage:
  npm run capture:retry -- --scan <scan id>           plan only (no paid calls)
  npm run capture:retry -- --scan <scan id> --approve --usd <exact from plan>`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const scanId = arg("scan");
  if (!scanId) throw new Error(`--scan is required.\n${USAGE}`);
  const db = getDb();
  const { orgId } = await legacyContext(db);
  const plan = await planRetry(db, scanId, orgId);
  console.table(
    plan.draws.map((d) => ({
      engine: d.engine,
      runner: d.runner,
      provider: d.provider,
      drawIndex: d.drawIndex,
      nextAttempt: d.nextAttempt,
      promptId: d.promptId.slice(0, 8),
    })),
  );
  console.log(`Failed draws: ${plan.draws.length}. Estimated retry: ${plan.usd === null ? "unknown" : `$${plan.usd.toFixed(4)}`}`);
  if (plan.refusals.length) {
    console.log("Refused:");
    for (const r of plan.refusals) console.log(`  - ${r}`);
    return;
  }
  if (!plan.draws.length) {
    console.log("Nothing to retry.");
    return;
  }
  if (!process.argv.includes("--approve")) {
    console.log(`\nTo run it:\n  npm run capture:retry -- --scan ${scanId} --approve --usd ${plan.usd}`);
    return;
  }
  const usd = Number(arg("usd"));
  if (!Number.isFinite(usd)) throw new Error(`--usd is required with --approve.\n${USAGE}`);
  if (usd !== plan.usd) throw new Error(`Approved ${usd} does not match plan ${plan.usd}; plan again`);
  console.log(`Approving $${usd} and retrying ${plan.draws.length} draws...`);
  const outs = await runRetry(db, plan, { orgId, approvedUsd: plan.usd });
  console.table(
    outs.map((o, i) => {
      const src = plan.draws[i];
      return {
        engine: src?.engine ?? "",
        runner: src?.runner ?? "",
        drawIndex: src?.drawIndex ?? "",
        status: o.status,
        cost: o.costUsd === null || o.costUsd === undefined ? "—" : `$${Number(o.costUsd).toFixed(4)}`,
        error: typeof o.error === "string" ? o.error.slice(0, 80) : o.error ?? "",
      };
    }),
  );
  const ok = outs.filter((o) => o.status === "ok").length;
  const err = outs.filter((o) => o.status === "error").length;
  const spent = outs.reduce((s, o) => s + (o.costUsd ?? 0), 0);
  console.log(`Done: ${ok} ok, ${err} error. Actual $${spent.toFixed(4)}.`);
  const again = await planRetry(db, scanId, orgId);
  console.log(`Still failed (latest attempt): ${again.draws.length}`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

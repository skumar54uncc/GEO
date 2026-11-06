import path from "path";
import { estimateContentTeamSeries } from "../lib/contentTeam/estimate";
import { EXPECTED_NEUTRAL, EXPECTED_VARIANTS, importContentTeamCsv } from "../lib/contentTeam/import";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { loadEnv } from "./env";

loadEnv();

const DEFAULT_CSV = "inputs/content-team/content_team_prompts_v1.csv";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const csvPath = path.resolve(arg("csv") ?? DEFAULT_CSV);
  const db = getDb();
  const { orgId } = await legacyContext(db);

  console.log(`Importing ${csvPath} (expect ${EXPECTED_NEUTRAL} neutral + ${EXPECTED_VARIANTS} variants)…`);
  const result = await importContentTeamCsv(db, orgId, csvPath);
  console.log("\nPer campaign:");
  console.table(
    Object.entries(result.perCampaign).map(([campaign, c]) => ({
      campaign,
      neutral: c.neutral,
      variants: c.variants,
    })),
  );
  console.log(
    `Totals: ${result.neutral} neutral (${result.insertedNeutral} inserted), ${result.variants} variants (${result.insertedVariants} inserted).`,
  );
  if (result.insertedNeutral === 0 && result.insertedVariants === 0) {
    console.log("Idempotent re-run: nothing new created.");
  }

  console.log("\nCost estimates only (6 engines × 3 draws × Charlotte). No scan. No spend.");
  const est = await estimateContentTeamSeries(db, orgId);
  console.table(
    est.series.map((s) => ({
      campaign: s.campaign,
      series: s.series,
      prompts: s.prompts,
      draws: s.totalDraws,
      usd_upper: s.usdTotalUpper === null ? "unknown" : `$${s.usdTotalUpper.toFixed(4)}`,
    })),
  );
  console.log(
    `Core draws: ${est.coreDraws} (brief ~2124). Persona draws: ${est.personaDraws} (brief ~6138).`,
  );
  console.log(
    `Core USD upper: ${est.coreUsd === null ? "unknown" : "$" + est.coreUsd.toFixed(4)}; persona: ${
      est.personaUsd === null ? "unknown" : "$" + est.personaUsd.toFixed(4)
    }; total: ${est.totalUsd === null ? "unknown" : "$" + est.totalUsd.toFixed(4)}.`,
  );
  console.log("\nStopped. Approve prompts in the review UI before freezing or scanning.");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

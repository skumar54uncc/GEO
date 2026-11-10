import fs from "fs";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import {
  BAKEOFF_PRICE_DATE,
  BAKEOFF_PRICE_SOURCE,
  estimateBakeoffUnits,
  parseHandLabelsCsv,
  runModelBakeoff,
  usdFromUsage,
} from "../lib/judge/bakeoff";
import { loadEnv } from "./env";

loadEnv();

const USAGE = `usage:
  npm run judge:bakeoff -- --labels <csv> --model <id> [--model <id> ...]
  npm run judge:bakeoff -- --labels <csv> --model <id> --model <id> --approve

CSV columns: draw_id, sentiment (positive|neutral|negative), missed_mention (y/n), named_sources (semicolon list or blank).
Writes only to cost_ledger (engine judge_bakeoff). Never writes judge_runs or metrics.`;

function argAll(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[++i]);
  }
  return out;
}

function arg(name: string): string | undefined {
  return argAll(name)[0];
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }
  const labelsPath = arg("labels");
  const models = argAll("model");
  const approve = process.argv.includes("--approve");
  if (!labelsPath || !models.length) {
    console.error(USAGE);
    process.exit(1);
  }

  const labels = parseHandLabelsCsv(fs.readFileSync(labelsPath, "utf8"));
  if (!labels.length) throw new Error("No hand labels in CSV");

  const db = getDb();
  const { orgId } = await legacyContext(db);
  const units = estimateBakeoffUnits(labels, models);

  console.log(`Bake-off estimate (chars/4 stand-in): ~${units} token-units across ${labels.length} labels × ${models.length} models.`);
  console.log(`Prices source: ${BAKEOFF_PRICE_SOURCE} (${BAKEOFF_PRICE_DATE}).`);
  for (const model of models) {
    const sample = usdFromUsage(model, 1000, 1000);
    console.log(
      `  ${model}: ${sample.priceNeeded ? "PRICE NEEDED" : sample.priceLabel} (sample 1k+1k tok → ${sample.usd === null ? "n/a" : `$${sample.usd.toFixed(6)}`})`,
    );
  }

  if (!approve) {
    console.log("\nNo calls made. Re-run with --approve to spend.");
    return;
  }

  const rows = [];
  for (const model of models) {
    rows.push(await runModelBakeoff(db, { orgId, model, labels, approve: true }));
  }

  console.log("\nResults (rates over n hand labels; USD from real usage tokens):");
  console.table(
    rows.map((r) => ({
      model: r.model,
      n: r.n,
      valid_json: r.validJsonRate.toFixed(3),
      sentiment: r.sentimentAgree.toFixed(3),
      missed_mention: r.missedMentionAgree.toFixed(3),
      named_sources_jaccard: r.namedSourcesJaccard.toFixed(3),
      prompt_tok: r.promptTokens,
      completion_tok: r.completionTokens,
      usd: r.priceNeeded ? "PRICE NEEDED" : r.usd === null ? "n/a" : `$${r.usd.toFixed(6)}`,
      price: r.priceLabel,
      source: `${BAKEOFF_PRICE_SOURCE} ${BAKEOFF_PRICE_DATE}`,
    })),
  );
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });

import { eq, inArray } from "drizzle-orm";
import { checkBudget, recordCall } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, draws, prompts, scans } from "@/lib/db/pg/schema";
import { fireworksChat } from "@/lib/fireworks";
import { loadAliases, matchAliases, summarizeMatches } from "@/lib/judge/aliases";
import {
  buildJudgeUserPrompt,
  buildSystemPrompt,
  ledgerUnitsFromUsage,
  validateJudge,
} from "@/lib/judge/v2";

export const BAKEOFF_ENGINE = "judge_bakeoff";
export const BAKEOFF_PRICE_SOURCE = "docs.fireworks.ai/serverless/pricing";
export const BAKEOFF_PRICE_DATE = "2026-11-10";

/** Per-1M-token USD rates (input / output). Matched by substring on the model id. */
export const BAKEOFF_PRICES: Array<{ match: string; label: string; inputPerM: number; outputPerM: number }> = [
  { match: "qwen3p8-max", label: "Qwen 3.8 Max", inputPerM: 2.0, outputPerM: 6.0 },
  { match: "glm-5p3", label: "GLM 5.3", inputPerM: 1.4, outputPerM: 4.4 },
  { match: "kimi-k3", label: "Kimi K3", inputPerM: 3.0, outputPerM: 15.0 },
  { match: "deepseek-v4p1-flash", label: "DeepSeek V4.1 Flash", inputPerM: 0.3, outputPerM: 1.2 },
];

export type HandLabel = {
  drawId: string;
  brandMentioned: boolean;
  sentiment: "positive" | "neutral" | "negative";
  position: number | null;
};

export type BakeoffChat = (opts: {
  model: string;
  system: string;
  user: string;
}) => Promise<{
  ok: boolean;
  text: string;
  error: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}>;

export type ModelBakeoffRow = {
  model: string;
  n: number;
  validJsonRate: number;
  brandMentionedAgree: number;
  sentimentAgree: number;
  positionAgree: number;
  promptTokens: number;
  completionTokens: number;
  usd: number | null;
  priceLabel: string;
  priceNeeded: boolean;
};

export function priceForModel(modelId: string): {
  label: string;
  inputPerM: number;
  outputPerM: number;
  priceNeeded: boolean;
} {
  const hit = BAKEOFF_PRICES.find((p) => modelId.includes(p.match));
  if (!hit) return { label: "PRICE NEEDED", inputPerM: 0, outputPerM: 0, priceNeeded: true };
  return { label: hit.label, inputPerM: hit.inputPerM, outputPerM: hit.outputPerM, priceNeeded: false };
}

export function usdFromUsage(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): { usd: number | null; priceLabel: string; priceNeeded: boolean } {
  const price = priceForModel(modelId);
  if (price.priceNeeded) return { usd: null, priceLabel: price.label, priceNeeded: true };
  const usd = (promptTokens / 1_000_000) * price.inputPerM + (completionTokens / 1_000_000) * price.outputPerM;
  return {
    usd,
    priceLabel: `${price.label} $${price.inputPerM.toFixed(2)} in / $${price.outputPerM.toFixed(2)} out`,
    priceNeeded: false,
  };
}

/** Parse hand-label CSV: draw_id, brand_mentioned (y/n), sentiment, position (int or blank). */
export function parseHandLabelsCsv(text: string): HandLabel[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().split(",").map((c) => c.trim());
  const idx = {
    draw: header.indexOf("draw_id"),
    brand: header.indexOf("brand_mentioned"),
    sentiment: header.indexOf("sentiment"),
    position: header.indexOf("position"),
  };
  if (idx.draw < 0 || idx.brand < 0 || idx.sentiment < 0 || idx.position < 0) {
    throw new Error("CSV header must include draw_id, brand_mentioned, sentiment, position");
  }
  const out: HandLabel[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const brandRaw = cols[idx.brand]?.toLowerCase();
    if (brandRaw !== "y" && brandRaw !== "n") throw new Error(`brand_mentioned must be y/n (got ${cols[idx.brand]})`);
    const sentiment = cols[idx.sentiment]?.toLowerCase();
    if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") {
      throw new Error(`sentiment must be positive|neutral|negative (got ${cols[idx.sentiment]})`);
    }
    const posRaw = cols[idx.position] ?? "";
    const position = posRaw === "" ? null : Number(posRaw);
    if (posRaw !== "" && (!Number.isInteger(position) || position! < 1)) {
      throw new Error(`position must be a positive integer or blank (got ${posRaw})`);
    }
    out.push({
      drawId: cols[idx.draw],
      brandMentioned: brandRaw === "y",
      sentiment,
      position,
    });
  }
  return out;
}

export function estimateBakeoffUnits(labels: HandLabel[], models: string[]): number {
  return Math.max(1, labels.length * models.length * 2000);
}

export async function runModelBakeoff(
  db: Db,
  opts: {
    orgId: string;
    model: string;
    labels: HandLabel[];
    approve: boolean;
    chat?: BakeoffChat;
  },
): Promise<ModelBakeoffRow> {
  const empty = (): ModelBakeoffRow => {
    const priced = usdFromUsage(opts.model, 0, 0);
    return {
      model: opts.model,
      n: opts.labels.length,
      validJsonRate: 0,
      brandMentionedAgree: 0,
      sentimentAgree: 0,
      positionAgree: 0,
      promptTokens: 0,
      completionTokens: 0,
      usd: priced.usd,
      priceLabel: priced.priceLabel,
      priceNeeded: priced.priceNeeded,
    };
  };

  if (!opts.approve) return empty();

  const chat: BakeoffChat =
    opts.chat ??
    (async ({ model, system, user }) => {
      const res = await fireworksChat({ model, system, user, json: true });
      return {
        ok: res.ok,
        text: res.text,
        error: res.error,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      };
    });

  const drawIds = opts.labels.map((l) => l.drawId);
  const drawRows = await db.select().from(draws).where(inArray(draws.id, drawIds));
  const byId = new Map(drawRows.map((d) => [d.id, d]));
  const promptIds = [...new Set(drawRows.map((d) => d.promptId))];
  const promptRows = promptIds.length
    ? await db.select({ id: prompts.id, text: prompts.text }).from(prompts).where(inArray(prompts.id, promptIds))
    : [];
  const promptText = new Map(promptRows.map((p) => [p.id, p.text]));

  let validJson = 0;
  let brandAgree = 0;
  let sentimentAgree = 0;
  let positionAgree = 0;
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;

  for (const label of opts.labels) {
    const draw = byId.get(label.drawId);
    if (!draw || draw.status !== "ok") {
      throw new Error(`Draw ${label.drawId} not found or not ok`);
    }
    const [scan] = await db.select({ campaignId: scans.campaignId }).from(scans).where(eq(scans.id, draw.scanId));
    if (!scan) throw new Error(`Scan missing for draw ${label.drawId}`);
    const [campaign] = await db
      .select({ brandId: campaigns.brandId, orgId: campaigns.orgId })
      .from(campaigns)
      .where(eq(campaigns.id, scan.campaignId));
    if (!campaign || campaign.orgId !== opts.orgId) {
      throw new Error(`Draw ${label.drawId} is not in org ${opts.orgId}`);
    }
    const aliases = await loadAliases(db, opts.orgId, campaign.brandId);
    const entities = summarizeMatches(draw.answerText, matchAliases(draw.answerText, aliases));
    const keyFor = (e: { entityType: string; entityName: string }) => (e.entityType === "brand" ? "brand" : e.entityName);
    const keys = entities.map(keyFor);
    const brandEntity = entities.find((e) => e.entityType === "brand");
    const modelBrandMentioned = Boolean(brandEntity);
    const modelPosition = brandEntity?.listPosition ?? null;

    if (modelBrandMentioned === label.brandMentioned) brandAgree++;
    if (modelPosition === label.position) positionAgree++;

    if (!keys.length) continue;

    const system = buildSystemPrompt(keys);
    const user = buildJudgeUserPrompt(promptText.get(draw.promptId) ?? "", draw.answerText);
    const estimatedUnits = Math.ceil((system.length + user.length) / 4) + 800;

    const budget = await checkBudget(db, opts.orgId, "fireworks", { units: estimatedUnits });
    if (!budget.allowed) throw new Error(`Refused by cost guard: ${budget.reason}`);

    const res = await chat({ model: opts.model, system, user });
    const usage = ledgerUnitsFromUsage(res.promptTokens, res.completionTokens);
    await recordCall(db, {
      orgId: opts.orgId,
      provider: "fireworks",
      units: usage ?? estimatedUnits,
      ok: res.ok,
      engine: BAKEOFF_ENGINE,
      drawId: draw.id,
      scanId: draw.scanId,
      error: res.error,
      usageEstimated: usage === null,
    });
    if (typeof res.promptTokens === "number") promptTokensTotal += res.promptTokens;
    if (typeof res.completionTokens === "number") completionTokensTotal += res.completionTokens;

    const check = res.ok ? validateJudge(res.text, keys) : { value: null, errors: [res.error ?? "call failed"] };
    if (check.value) {
      validJson++;
      const brand = check.value.entities.find((e) => e.key === "brand");
      if (brand && brand.sentiment === label.sentiment) sentimentAgree++;
    }
  }

  const n = opts.labels.length;
  const priced = usdFromUsage(opts.model, promptTokensTotal, completionTokensTotal);
  return {
    model: opts.model,
    n,
    validJsonRate: n ? validJson / n : 0,
    brandMentionedAgree: n ? brandAgree / n : 0,
    sentimentAgree: n ? sentimentAgree / n : 0,
    positionAgree: n ? positionAgree / n : 0,
    promptTokens: promptTokensTotal,
    completionTokens: completionTokensTotal,
    usd: priced.usd,
    priceLabel: priced.priceLabel,
    priceNeeded: priced.priceNeeded,
  };
}

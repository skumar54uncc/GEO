import { getStore } from "../db";
import { fireworksChat, judgeModel } from "../fireworks";
import { seedAioCitations } from "../serpapi";
import { isTargetDomain, registrableDomain } from "../domain";
import type { JudgeCitation, JudgeJson, ResponseRow } from "../types";
import { buildJudgeSystemPrompt, parseJudgeJson } from "./prompt";

function normalizeJudge(parsed: JudgeJson, config: ReturnType<ReturnType<typeof getStore>["getConfig"]>): JudgeJson {
  const citations = (parsed.citations ?? []).map((c) => {
    const domain = registrableDomain(c.domain) || String(c.domain || "").toLowerCase();
    return { domain, is_target: isTargetDomain(domain, config) };
  });
  const allowedSub = new Set(config.subtopics.map((s) => s.id));
  const allowedAssets = new Set(config.assets.map((a) => a.name));
  const allowedComp = new Map<string, string>();
  for (const c of config.competitors) {
    allowedComp.set(c.name.toLowerCase(), c.name);
    for (const a of c.aliases) allowedComp.set(a.toLowerCase(), c.name);
  }
  return {
    brand_mentioned: Boolean(parsed.brand_mentioned),
    brand_aliases_found: Array.isArray(parsed.brand_aliases_found) ? parsed.brand_aliases_found : [],
    mention_rank: typeof parsed.mention_rank === "number" ? parsed.mention_rank : null,
    total_entities_listed: typeof parsed.total_entities_listed === "number" ? parsed.total_entities_listed : null,
    mention_prominence: parsed.mention_prominence || (parsed.brand_mentioned ? "body" : "absent"),
    mention_sentiment: parsed.mention_sentiment || "neutral",
    mention_context: parsed.mention_context || "",
    competitors: (parsed.competitors ?? [])
      .map((c) => {
        const name = allowedComp.get(String(c.name || "").toLowerCase());
        if (!name) return null;
        return { name, rank: typeof c.rank === "number" ? c.rank : null, sentiment: c.sentiment || "neutral" };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    citations,
    target_cited: citations.some((c) => c.is_target),
    subtopics_covered: (parsed.subtopics_covered ?? []).filter((s) => allowedSub.has(s)),
    assets_surfaced: (parsed.assets_surfaced ?? []).filter((a) => allowedAssets.has(a)),
    answer_summary: parsed.answer_summary || "",
    hallucination_flags: Array.isArray(parsed.hallucination_flags) ? parsed.hallucination_flags : [],
  };
}

function applySeededCitations(judge: JudgeJson, seeded: JudgeCitation[]): JudgeJson {
  return {
    ...judge,
    citations: seeded,
    target_cited: seeded.some((c) => c.is_target),
  };
}

export type AnalyzeResult = {
  response_id: number;
  ok: boolean;
  error_flag: boolean;
  error: string | null;
  repaired: boolean;
};

export async function analyzeResponse(responseId: number): Promise<AnalyzeResult> {
  const store = getStore();
  const response = store.getResponse(responseId);
  if (!response) {
    return { response_id: responseId, ok: false, error_flag: true, error: "response not found", repaired: false };
  }
  const config = store.getConfig();
  const citationsSeeded = response.surface === "google_aio" || response.surface === "google_ai_mode";
  const system = buildJudgeSystemPrompt(config, { citationsSeeded });
  const prompt = store.getPrompt(response.prompt_id);
  const user = [
    `PROMPT (audience=${prompt?.audience ?? "?"}; subtopics=${(prompt?.subtopics ?? []).join(",")}):`,
    prompt?.text ?? "",
    "",
    `SURFACE: ${response.surface}`,
    `LOCATION NOTE: ${response.location_note}`,
    "",
    "ANSWER TEXT:",
    response.raw_text,
  ].join("\n");

  const model = judgeModel();
  const first = await fireworksChat({ model, system, user, json: true });
  let parsed = first.ok ? parseJudgeJson(first.text) : null;
  let repaired = false;
  let rawDump = first.text;
  let error = first.error;

  if (!parsed) {
    repaired = true;
    const repair = await fireworksChat({
      model,
      system: "Return valid JSON only matching the judge schema. No markdown.",
      user: `Repair this into the required JSON object. Previous output:\n${first.text || first.error || ""}`,
      json: true,
    });
    rawDump = repair.text || first.text;
    error = repair.error || error;
    parsed = repair.ok ? parseJudgeJson(repair.text) : null;
  }

  if (!parsed) {
    store.upsertAnalysis({
      response_id: responseId,
      judge_json: JSON.stringify({ parse_error: true, raw: rawDump, error }),
      judge_model: model,
      error_flag: true,
    });
    return { response_id: responseId, ok: false, error_flag: true, error: error || "JSON parse failed after repair", repaired };
  }

  let judge = normalizeJudge(parsed, config);
  if (citationsSeeded) {
    const seeded = seedFromStoredAio(response, config);
    if (seeded.length) judge = applySeededCitations(judge, seeded);
  }

  store.upsertAnalysis({
    response_id: responseId,
    judge_json: JSON.stringify(judge),
    judge_model: model,
    error_flag: false,
  });
  return { response_id: responseId, ok: true, error_flag: false, error: null, repaired };
}

function seedFromStoredAio(response: ResponseRow, config: ReturnType<ReturnType<typeof getStore>["getConfig"]>): JudgeCitation[] {
  const store = getStore();
  const events = store.listSerpEvents(200).filter((e) => e.prompt_id === response.prompt_id && e.ok);
  for (const ev of events) {
    if (!ev.params_hash) continue;
    const cached = store.getSerpCache(ev.params_hash);
    if (!cached) continue;
    try {
      const json = JSON.parse(cached.raw_json);
      const seeded = seedAioCitations(json, config);
      if (seeded.length) return seeded;
    } catch {
      continue;
    }
  }
  return [];
}

export async function analyzeBatch(responseIds: number[]): Promise<AnalyzeResult[]> {
  const results: AnalyzeResult[] = [];
  for (const id of responseIds) {
    try {
      results.push(await analyzeResponse(id));
    } catch (err) {
      const store = getStore();
      store.upsertAnalysis({
        response_id: id,
        judge_json: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        judge_model: judgeModel(),
        error_flag: true,
      });
      results.push({
        response_id: id,
        ok: false,
        error_flag: true,
        error: err instanceof Error ? err.message : String(err),
        repaired: false,
      });
    }
  }
  return results;
}

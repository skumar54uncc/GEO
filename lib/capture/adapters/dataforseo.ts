import { asArray, asRecord, httpJson, num, str } from "../http";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";
import { DATAFORSEO, TOKEN_ASSUMPTIONS, roundUsd } from "../pricing";
import { countryName, regionHonored } from "../regions";
import {
  errorResult,
  type CaptureCitation,
  type CaptureRequest,
  type CaptureResult,
  type Engine,
  type Estimate,
  type ProviderAdapter,
  type Runner,
} from "../types";

const BASE = "https://api.dataforseo.com";

/** LLM Responses API engine path segment per engine. */
const LLM_SE: Partial<Record<Engine, string>> = { chatgpt: "chat_gpt", claude: "claude", gemini: "gemini", perplexity: "perplexity" };

/** Env var holding the model for the parametric series per engine. No default: the owner picks the model. */
export const PARAMETRIC_MODEL_ENV: Partial<Record<Engine, string>> = {
  chatgpt: "DATAFORSEO_PARAMETRIC_MODEL_CHATGPT",
  claude: "DATAFORSEO_PARAMETRIC_MODEL_CLAUDE",
  gemini: "DATAFORSEO_PARAMETRIC_MODEL_GEMINI",
  perplexity: "DATAFORSEO_PARAMETRIC_MODEL_PERPLEXITY",
};

/** One endpoint call per draw. Live mode only: one POST, no polling, no retries. */
function endpointFor(engine: Engine, runner: Runner): string | null {
  if (runner === "ui_provider" && engine === "chatgpt") return "/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced";
  if (runner === "ui_provider" && engine === "gemini") return "/v3/ai_optimization/gemini/llm_scraper/live/advanced";
  if (runner === "serp_provider" && engine === "google_ai_mode") return "/v3/serp/google/ai_mode/live/advanced";
  if (runner === "serp_provider" && engine === "google_aio") return "/v3/serp/google/organic/live/advanced";
  if (runner === "api_parametric" && LLM_SE[engine]) return `/v3/ai_optimization/${LLM_SE[engine]}/llm_responses/live`;
  return null;
}

function citationsFrom(list: unknown): CaptureCitation[] {
  const out: CaptureCitation[] = [];
  for (const item of asArray(list)) {
    const r = asRecord(item);
    const url = str(r?.url);
    if (!url) continue;
    out.push({ url, position: out.length + 1, linked: true, title: str(r?.title) });
  }
  return out;
}

export type OrganicRow = { position: number; url: string; domain: string; title: string | null };

export function parseOrganic(items: unknown[]): OrganicRow[] {
  const rows: OrganicRow[] = [];
  for (const it of items) {
    const r = asRecord(it);
    if (r?.type !== "organic") continue;
    const url = str(r.url);
    if (!url) continue;
    rows.push({ position: num(r.rank_group) ?? rows.length + 1, url, domain: str(r.domain) ?? "", title: str(r.title) });
  }
  return rows;
}

/** Turns one DataForSEO response body into a draw. Exported for fixture tests. */
export function parseDataForSeo(req: CaptureRequest, json: unknown, latencyMs: number): CaptureResult {
  const root = asRecord(json);
  const task = asRecord(asArray(root?.tasks)[0]);
  const costUsd = num(task?.cost) ?? num(root?.cost) ?? 0;
  if (!root || !task) return errorResult("DataForSEO response has no task", { raw: json, latencyMs, costUsd: 0 });
  const code = num(task.status_code);
  if (code !== 20000) {
    const msg = `DataForSEO task ${code ?? "?"}: ${str(task.status_message) ?? "unknown error"}`;
    const blocked = code === 40200 || code === 40210 || code === 40100 || code === 40104;
    return errorResult(msg, { raw: json, latencyMs, costUsd, status: blocked ? "blocked" : "error" });
  }
  const result = asRecord(asArray(task.result)[0]);
  if (!result) return errorResult("DataForSEO task returned no result", { raw: json, latencyMs, costUsd });

  const base = { raw: json, latencyMs, costUsd: roundUsd(costUsd), costUnits: 1 };
  const region = req.region;

  if (req.runner === "ui_provider") {
    const text = str(result.markdown) ?? "";
    return {
      ...base,
      status: text.trim() ? "ok" : "empty",
      answerText: text,
      citations: citationsFrom(result.sources),
      fanoutQueries: asArray(result.fan_out_queries).filter((q): q is string => typeof q === "string"),
      modelBuild: str(result.model) ?? "unknown",
      regionHonored: regionHonored(region, countryName(region.country) ? "country" : "none", "native"),
    };
  }

  if (req.runner === "api_parametric") {
    const item = asRecord(asArray(result.items)[0]);
    const text = asArray(item?.sections)
      .map((s) => str(asRecord(s)?.text) ?? "")
      .join("\n")
      .trim();
    return {
      ...base,
      status: text ? "ok" : "empty",
      answerText: text,
      citations: [],
      fanoutQueries: [],
      modelBuild: str(result.model_name) ?? "unknown",
      regionHonored: "no",
    };
  }

  // SERP: AI Mode returns one ai_overview item; organic returns ai_overview only when Google showed one.
  const items = asArray(result.items);
  const aio = asRecord(items.find((it) => asRecord(it)?.type === "ai_overview"));
  const organic = req.engine === "google_aio" ? parseOrganic(items) : undefined;
  const honored = regionHonored(region, region.serpLocation ? (region.city ? "city" : region.state ? "state" : "country") : "none", "native");
  if (!aio) {
    return { ...base, status: "empty", answerText: "", citations: [], fanoutQueries: [], modelBuild: "unknown", regionHonored: honored, organic };
  }
  const text = str(aio.markdown) ?? asArray(aio.items).map((i) => str(asRecord(i)?.text) ?? "").join("\n").trim();
  return {
    ...base,
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations: citationsFrom(aio.references),
    fanoutQueries: [],
    modelBuild: "unknown",
    regionHonored: honored,
    organic,
  };
}

export function createDataForSeoAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);

  function body(req: CaptureRequest): Record<string, unknown> | { error: string; missing?: true } {
    const language_code = req.region.language || "en";
    if (req.runner === "ui_provider") {
      const location_name = countryName(req.region.country);
      if (!location_name) return { error: `No DataForSEO location for country ${req.region.country ?? "(none)"}` };
      return { keyword: req.prompt, location_name, language_code };
    }
    if (req.runner === "serp_provider") {
      if (!req.region.serpLocation) return { error: `Region ${req.region.label} has no serp_location` };
      const b: Record<string, unknown> = { keyword: req.prompt, location_name: req.region.serpLocation, language_code, device: "desktop" };
      if (req.engine === "google_aio") b.load_async_ai_overview = true;
      return b;
    }
    const modelEnv = PARAMETRIC_MODEL_ENV[req.engine];
    const model = modelEnv ? env()[modelEnv] : undefined;
    if (!model) return { error: `Missing ${modelEnv ?? "parametric model"}`, missing: true };
    return { user_prompt: req.prompt, model_name: model, web_search: false };
  }

  const missingConfig = () => missingVars(env(), ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);

  return {
    id: "dataforseo",
    supports: (engine, runner) => endpointFor(engine, runner) !== null,
    missingConfig,
    estimate(req): Estimate {
      if (req.runner === "ui_provider") return { units: 1, usd: DATAFORSEO.llmScraper.live };
      if (req.runner === "serp_provider" && req.engine === "google_ai_mode") return { units: 1, usd: DATAFORSEO.aiMode.live };
      if (req.runner === "serp_provider") return { units: 1, usd: DATAFORSEO.organic.live * 2, note: "includes load_async_ai_overview" };
      // Parametric: task fee plus the model's own tokens, priced by the provider; upper bound assumption.
      const t = TOKEN_ASSUMPTIONS.parametric;
      return { units: 1, usd: roundUsd(DATAFORSEO.llmResponsesTask.live + (t.input * 10 + t.output * 50) / 1_000_000), note: "token cost assumed at $10/$50 per MTok upper bound" };
    },
    async capture(req) {
      const path = endpointFor(req.engine, req.runner);
      if (!path) return errorResult(`dataforseo does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const b = body(req);
      if ("error" in b) return errorResult(String(b.error), { status: b.missing ? "blocked" : "error" });
      const e = env();
      const auth = Buffer.from(`${e.DATAFORSEO_LOGIN}:${e.DATAFORSEO_PASSWORD}`).toString("base64");
      const res = await httpJson(fetchImpl, BASE + path, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify([b]),
        timeoutMs: 180_000,
      });
      return httpFailure(res) ?? parseDataForSeo(req, res.json, res.latencyMs);
    },
  };
}

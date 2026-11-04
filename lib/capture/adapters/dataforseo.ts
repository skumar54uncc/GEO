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

/**
 * Model for Perplexity via LLM Responses with web search (medium fidelity, not the perplexity.ai UI).
 * Docs examples use `sonar`. No default: unset means that route is refused.
 */
export const PERPLEXITY_SEARCH_MODEL_ENV = "DATAFORSEO_PERPLEXITY_MODEL";

/** One endpoint call per draw. Live mode only: one POST, no polling, no retries. */
function endpointFor(engine: Engine, runner: Runner): string | null {
  if (runner === "ui_provider" && engine === "chatgpt") return "/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced";
  if (runner === "ui_provider" && engine === "gemini") return "/v3/ai_optimization/gemini/llm_scraper/live/advanced";
  if (runner === "serp_provider" && engine === "google_ai_mode") return "/v3/serp/google/ai_mode/live/advanced";
  if (runner === "serp_provider" && engine === "google_aio") return "/v3/serp/google/organic/live/advanced";
  // Perplexity has no DataForSEO UI scraper. LLM Responses with sonar-family search is api_search (medium).
  if (runner === "api_search" && engine === "perplexity") return `/v3/ai_optimization/perplexity/llm_responses/live`;
  if (runner === "api_parametric" && LLM_SE[engine]) return `/v3/ai_optimization/${LLM_SE[engine]}/llm_responses/live`;
  return null;
}

function parseLlmResponseText(result: Record<string, unknown>): { text: string; citations: CaptureCitation[]; fanoutQueries: string[] } {
  const item = asRecord(asArray(result.items)[0]);
  const sections = asArray(item?.sections);
  const text = sections
    .map((s) => str(asRecord(s)?.text) ?? "")
    .join("\n")
    .trim();
  const citations: CaptureCitation[] = [];
  for (const sec of sections) {
    for (const c of citationsFrom(asRecord(sec)?.annotations)) citations.push({ ...c, position: citations.length + 1 });
  }
  if (!citations.length) {
    for (const c of citationsFrom(result.search_results)) citations.push({ ...c, position: citations.length + 1 });
  }
  return {
    text,
    citations,
    fanoutQueries: asArray(result.fan_out_queries).filter((q): q is string => typeof q === "string"),
  };
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

  if (req.runner === "api_parametric" || req.runner === "api_search") {
    const parsed = parseLlmResponseText(result);
    // Country ISO on web search is coarser than a city region, so Charlotte draws get region_honored = no.
    const honored =
      req.runner === "api_search"
        ? regionHonored(region, req.region.country ? "country" : "none", "native")
        : ("no" as const);
    return {
      ...base,
      status: parsed.text ? "ok" : "empty",
      answerText: parsed.text,
      citations: req.runner === "api_parametric" ? [] : parsed.citations,
      fanoutQueries: req.runner === "api_parametric" ? [] : parsed.fanoutQueries,
      modelBuild: str(result.model_name) ?? "unknown",
      regionHonored: honored,
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

/** Plain Google organic results for a fan out query (no AI Overview). One live SERP call. */
export async function fetchOrganic(
  deps: AdapterDeps,
  query: string,
  region: { serpLocation: string | null; language: string | null },
): Promise<{ ok: boolean; rows: OrganicRow[]; raw: unknown; costUsd: number | null; error: string | null }> {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const missing = missingVars(env(), ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
  if (missing.length) return { ok: false, rows: [], raw: null, costUsd: 0, error: `Missing ${missing.join(", ")}` };
  if (!region.serpLocation) return { ok: false, rows: [], raw: null, costUsd: 0, error: "Region has no serp_location" };
  const e = env();
  const res = await httpJson(fetchImpl, `${BASE}/v3/serp/google/organic/live/advanced`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${e.DATAFORSEO_LOGIN}:${e.DATAFORSEO_PASSWORD}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ keyword: query, location_name: region.serpLocation, language_code: region.language || "en", device: "desktop" }]),
    timeoutMs: 120_000,
  });
  if (!res.ok) return { ok: false, rows: [], raw: res.json ?? res.text, costUsd: res.status === 0 ? null : 0, error: res.error };
  const task = asRecord(asArray(asRecord(res.json)?.tasks)[0]);
  const cost = num(task?.cost);
  if (num(task?.status_code) !== 20000) return { ok: false, rows: [], raw: res.json, costUsd: cost ?? 0, error: `DataForSEO task ${num(task?.status_code) ?? "?"}: ${str(task?.status_message) ?? "unknown"}` };
  const items = asArray(asRecord(asArray(task?.result)[0])?.items);
  return { ok: true, rows: parseOrganic(items), raw: res.json, costUsd: cost ?? DATAFORSEO.organic.live, error: null };
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
    if (req.runner === "api_search" && req.engine === "perplexity") {
      const model = env()[PERPLEXITY_SEARCH_MODEL_ENV];
      if (!model) return { error: `Missing ${PERPLEXITY_SEARCH_MODEL_ENV}`, missing: true };
      const b: Record<string, unknown> = { user_prompt: req.prompt, model_name: model };
      // Docs: sonar-family search is on by default; country localizes sources. City/state are not accepted here.
      if (req.region.country) b.web_search_country_iso_code = req.region.country;
      return b;
    }
    const modelEnv = PARAMETRIC_MODEL_ENV[req.engine];
    const model = modelEnv ? env()[modelEnv] : undefined;
    if (!model) return { error: `Missing ${modelEnv ?? "parametric model"}`, missing: true };
    return { user_prompt: req.prompt, model_name: model, web_search: false };
  }

  // Login/password only. Per-route models (Perplexity search, parametric) refuse as blocked draws when unset.
  const missingConfig = () => missingVars(env(), ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);

  return {
    id: "dataforseo",
    supports: (engine, runner) => endpointFor(engine, runner) !== null,
    missingConfig,
    estimate(req): Estimate {
      if (req.runner === "ui_provider") return { units: 1, usd: DATAFORSEO.llmScraper.live };
      if (req.runner === "serp_provider" && req.engine === "google_ai_mode") return { units: 1, usd: DATAFORSEO.aiMode.live };
      if (req.runner === "serp_provider") return { units: 1, usd: DATAFORSEO.organic.live * 2, note: "includes load_async_ai_overview" };
      // LLM Responses: task fee plus the model's own tokens; upper bound until the response reports money_spent.
      const t = TOKEN_ASSUMPTIONS.parametric;
      const note = req.runner === "api_search" ? "Perplexity via DataForSEO LLM Responses (medium fidelity, not the UI)" : "token cost assumed at $10/$50 per MTok upper bound";
      return { units: 1, usd: roundUsd(DATAFORSEO.llmResponsesTask.live + (t.input * 10 + t.output * 50) / 1_000_000), note };
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

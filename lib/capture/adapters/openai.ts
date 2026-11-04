import { asArray, asRecord, httpJson, num, str } from "../http";
import { SEARCH_CALL_USD, TOKEN_ASSUMPTIONS, TOKEN_RATES, roundUsd, tokenUsd } from "../pricing";
import { regionHonored } from "../regions";
import { errorResult, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter } from "../types";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";

export const OPENAI_MODEL_ENV = "OPENAI_SEARCH_MODEL";

export function userLocation(req: CaptureRequest) {
  const r = req.region;
  const loc: Record<string, string> = { type: "approximate" };
  if (r.country) loc.country = r.country;
  if (r.state) loc.region = r.state;
  if (r.city) loc.city = r.city;
  if (r.timezone) loc.timezone = r.timezone;
  return loc;
}

export function passedGranularity(req: CaptureRequest) {
  const r = req.region;
  return r.city ? ("city" as const) : r.state ? ("state" as const) : r.country ? ("country" as const) : ("none" as const);
}

export function parseOpenAi(req: CaptureRequest, json: unknown, latencyMs: number, requestedModel: string): CaptureResult {
  const root = asRecord(json);
  const output = asArray(root?.output);
  if (!root || !output.length) return errorResult("OpenAI response has no output", { raw: json, latencyMs, costUsd: null });
  const apiError = asRecord(root.error);
  if (apiError) return errorResult(`OpenAI error: ${str(apiError.message) ?? "unknown"}`, { raw: json, latencyMs, costUsd: null });

  const fanout: string[] = [];
  let searches = 0;
  let text = "";
  const citations: CaptureCitation[] = [];
  for (const item of output) {
    const r = asRecord(item);
    if (r?.type === "web_search_call") {
      searches++;
      const q = str(asRecord(r.action)?.query);
      if (q) fanout.push(q);
    }
    if (r?.type !== "message") continue;
    for (const part of asArray(r.content)) {
      const p = asRecord(part);
      if (p?.type !== "output_text") continue;
      const offset = text.length;
      text += str(p.text) ?? "";
      for (const a of asArray(p.annotations)) {
        const an = asRecord(a);
        const url = str(an?.url);
        if (an?.type !== "url_citation" || !url) continue;
        const s = num(an.start_index);
        const e = num(an.end_index);
        citations.push({ url, position: citations.length + 1, linked: true, title: str(an.title), spanStart: s === null ? null : s + offset, spanEnd: e === null ? null : e + offset });
      }
    }
  }
  const usage = asRecord(root.usage);
  const model = str(root.model) ?? requestedModel;
  const tokens = tokenUsd(model, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0) ?? tokenUsd(requestedModel, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0);
  return {
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations,
    fanoutQueries: fanout,
    modelBuild: str(root.model) ?? `requested:${requestedModel}`,
    regionHonored: regionHonored(req.region, passedGranularity(req), "approximate"),
    searchUsed: searches > 0 || citations.length > 0 || fanout.length > 0,
    raw: json,
    costUnits: searches,
    costUsd: tokens === null || !usage ? null : roundUsd(tokens + searches * SEARCH_CALL_USD.openai),
    latencyMs,
  };
}

export function createOpenAiAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const missingConfig = () => missingVars(env(), ["OPENAI_API_KEY", OPENAI_MODEL_ENV]);
  return {
    id: "openai",
    supports: (engine, runner) => engine === "chatgpt" && runner === "api_search",
    missingConfig,
    estimate() {
      const model = env()[OPENAI_MODEL_ENV] ?? "";
      const t = TOKEN_ASSUMPTIONS.openai;
      const tokens = TOKEN_RATES[model] ? tokenUsd(model, t.input, t.output) : null;
      return { units: t.searches, usd: tokens === null ? null : roundUsd(tokens + t.searches * SEARCH_CALL_USD.openai), note: "upper bound assumption on tokens and searches" };
    },
    async capture(req) {
      if (!(req.engine === "chatgpt" && req.runner === "api_search")) return errorResult(`openai does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const model = env()[OPENAI_MODEL_ENV] as string;
      const res = await httpJson(fetchImpl, "https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env().OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: req.prompt, tools: [{ type: "web_search", user_location: userLocation(req) }], store: false }),
        timeoutMs: 180_000,
      });
      return httpFailure(res) ?? parseOpenAi(req, res.json, res.latencyMs, model);
    },
  };
}

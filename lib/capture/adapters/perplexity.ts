import { asArray, asRecord, httpJson, num, str } from "../http";
import { SEARCH_CALL_USD, TOKEN_ASSUMPTIONS, TOKEN_RATES, roundUsd, tokenUsd } from "../pricing";
import { regionHonored } from "../regions";
import { errorResult, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter } from "../types";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";
import { passedGranularity } from "./openai";

export const PERPLEXITY_MODEL_ENV = "PERPLEXITY_MODEL";

function location(req: CaptureRequest) {
  const r = req.region;
  const loc: Record<string, string | number> = {};
  if (r.country) loc.country = r.country;
  if (r.state) loc.region = r.state;
  if (r.city) loc.city = r.city;
  if (r.latitude !== null && r.longitude !== null) {
    loc.latitude = r.latitude;
    loc.longitude = r.longitude;
  }
  return loc;
}

/** Search results are what the Perplexity answer lists as sources; the API does not mark which were cited inline. */
export function parsePerplexity(req: CaptureRequest, json: unknown, latencyMs: number, requestedModel: string): CaptureResult {
  const root = asRecord(json);
  const output = asArray(root?.output);
  if (!root || !output.length) return errorResult("Perplexity response has no output", { raw: json, latencyMs, costUsd: null });

  let text = "";
  const fanout: string[] = [];
  const citations: CaptureCitation[] = [];
  for (const item of output) {
    const r = asRecord(item);
    if (r?.type === "search_results") {
      for (const q of asArray(r.queries)) if (typeof q === "string") fanout.push(q);
      for (const res of asArray(r.results)) {
        const s = asRecord(res);
        const url = str(s?.url);
        if (url) citations.push({ url, position: citations.length + 1, linked: true, title: str(s?.title) });
      }
    }
    if (r?.type === "message") {
      for (const part of asArray(r.content)) {
        const p = asRecord(part);
        if (p?.type === "output_text") text += str(p.text) ?? "";
      }
    }
  }
  const usage = asRecord(root.usage);
  const searches = num(asRecord(asRecord(usage?.tool_calls_details)?.search_web)?.invocation) ?? 0;
  const model = str(root.model) ?? requestedModel;
  const tokens = tokenUsd(model, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0) ?? tokenUsd(requestedModel, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0);
  return {
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations,
    fanoutQueries: fanout,
    modelBuild: str(root.model) ?? `requested:${requestedModel}`,
    regionHonored: regionHonored(req.region, passedGranularity(req), "approximate"),
    raw: json,
    costUnits: searches,
    costUsd: tokens === null || !usage ? null : roundUsd(tokens + searches * SEARCH_CALL_USD.perplexity),
    latencyMs,
  };
}

export function createPerplexityAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const missingConfig = () => missingVars(env(), ["PERPLEXITY_API_KEY", PERPLEXITY_MODEL_ENV]);
  return {
    id: "perplexity",
    supports: (engine, runner) => engine === "perplexity" && runner === "api_search",
    missingConfig,
    estimate() {
      const model = env()[PERPLEXITY_MODEL_ENV] ?? "";
      const t = TOKEN_ASSUMPTIONS.perplexity;
      const tokens = TOKEN_RATES[model] ? tokenUsd(model, t.input, t.output) : null;
      return { units: t.searches, usd: tokens === null ? null : roundUsd(tokens + t.searches * SEARCH_CALL_USD.perplexity), note: "upper bound assumption on tokens and searches" };
    },
    async capture(req) {
      if (!(req.engine === "perplexity" && req.runner === "api_search")) return errorResult(`perplexity does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const model = env()[PERPLEXITY_MODEL_ENV] as string;
      const res = await httpJson(fetchImpl, "https://api.perplexity.ai/v1/agent", {
        method: "POST",
        headers: { Authorization: `Bearer ${env().PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: req.prompt,
          tools: [{ type: "web_search", user_location: location(req) }],
          tool_choice: { type: "web_search" },
        }),
        timeoutMs: 180_000,
      });
      return httpFailure(res) ?? parsePerplexity(req, res.json, res.latencyMs, model);
    },
  };
}

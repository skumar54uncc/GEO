import { asArray, asRecord, httpJson, num, str } from "../http";
import { SEARCH_CALL_USD, TOKEN_ASSUMPTIONS, TOKEN_RATES, roundUsd, tokenUsd } from "../pricing";
import { regionHonored } from "../regions";
import { errorResult, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter } from "../types";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";
import { passedGranularity, userLocation } from "./openai";

export const ANTHROPIC_MODEL_ENV = "ANTHROPIC_MODEL";
const MAX_SEARCHES = 5;

export function parseAnthropic(req: CaptureRequest, json: unknown, latencyMs: number, requestedModel: string): CaptureResult {
  const root = asRecord(json);
  if (!root) return errorResult("Anthropic response is not an object", { raw: json, latencyMs, costUsd: null });
  if (root.type === "error") return errorResult(`Anthropic error: ${str(asRecord(root.error)?.message) ?? "unknown"}`, { raw: json, latencyMs, costUsd: 0 });

  const usage = asRecord(root.usage);
  const searches = num(asRecord(usage?.server_tool_use)?.web_search_requests) ?? 0;
  const model = str(root.model) ?? requestedModel;
  const tokens = tokenUsd(model, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0) ?? tokenUsd(requestedModel, num(usage?.input_tokens) ?? 0, num(usage?.output_tokens) ?? 0);
  const costUsd = tokens === null || !usage ? null : roundUsd(tokens + searches * SEARCH_CALL_USD.anthropic);

  let text = "";
  const fanout: string[] = [];
  const toolErrors: string[] = [];
  const citations: CaptureCitation[] = [];
  for (const block of asArray(root.content)) {
    const b = asRecord(block);
    if (b?.type === "server_tool_use") {
      const q = str(asRecord(b.input)?.query);
      if (q) fanout.push(q);
    } else if (b?.type === "web_search_tool_result") {
      const err = asRecord(b.content);
      if (err?.type === "web_search_tool_result_error") toolErrors.push(str(err.error_code) ?? "unknown");
    } else if (b?.type === "text") {
      const start = text.length;
      text += str(b.text) ?? "";
      for (const c of asArray(b.citations)) {
        const cit = asRecord(c);
        const url = str(cit?.url);
        if (!url) continue;
        citations.push({ url, position: citations.length + 1, linked: true, title: str(cit?.title), spanStart: start, spanEnd: text.length });
      }
    }
  }

  const base = { raw: json, latencyMs, costUnits: searches, costUsd };
  // pause_turn needs a second paid call to finish; we never continue automatically.
  if (root.stop_reason === "pause_turn") return errorResult("Anthropic paused the turn (pause_turn); not continued", base);
  if (!text.trim() && toolErrors.length) return errorResult(`Anthropic web search error: ${toolErrors.join(", ")}`, base);
  return {
    ...base,
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations,
    fanoutQueries: fanout,
    modelBuild: str(root.model) ?? `requested:${requestedModel}`,
    regionHonored: regionHonored(req.region, passedGranularity(req), "approximate"),
    error: toolErrors.length ? `web search errors: ${toolErrors.join(", ")}` : undefined,
  };
}

export function createAnthropicAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const missingConfig = () => missingVars(env(), ["ANTHROPIC_API_KEY", ANTHROPIC_MODEL_ENV]);
  return {
    id: "anthropic",
    supports: (engine, runner) => engine === "claude" && runner === "api_search",
    missingConfig,
    estimate() {
      const model = env()[ANTHROPIC_MODEL_ENV] ?? "";
      const t = TOKEN_ASSUMPTIONS.anthropic;
      const tokens = TOKEN_RATES[model] ? tokenUsd(model, t.input, t.output) : null;
      return { units: t.searches, usd: tokens === null ? null : roundUsd(tokens + t.searches * SEARCH_CALL_USD.anthropic), note: "upper bound assumption on tokens and searches" };
    },
    async capture(req) {
      if (!(req.engine === "claude" && req.runner === "api_search")) return errorResult(`anthropic does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const model = env()[ANTHROPIC_MODEL_ENV] as string;
      const res = await httpJson(fetchImpl, "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env().ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: "user", content: req.prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES, user_location: userLocation(req) }],
        }),
        timeoutMs: 180_000,
      });
      return httpFailure(res) ?? parseAnthropic(req, res.json, res.latencyMs, model);
    },
  };
}

import { asArray, asRecord, httpJson, num, str } from "../http";
import { SEARCH_CALL_USD, TOKEN_ASSUMPTIONS, TOKEN_RATES, roundUsd, tokenUsd } from "../pricing";
import { regionHonored } from "../regions";
import { errorResult, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter } from "../types";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";

export const GEMINI_MODEL_ENV = "GEMINI_MODEL";

/**
 * Grounding chunks are the sources; a chunk referenced by a grounding support is linked to a span of the
 * answer. Search queries are billed per query (Gemini 3+); the free monthly allowance is not deducted.
 */
export function parseGemini(req: CaptureRequest, json: unknown, latencyMs: number, requestedModel: string): CaptureResult {
  const root = asRecord(json);
  const cand = asRecord(asArray(root?.candidates)[0]);
  if (!root || !cand) {
    const blocked = str(asRecord(root?.promptFeedback)?.blockReason);
    return errorResult(blocked ? `Gemini blocked the prompt: ${blocked}` : "Gemini response has no candidates", { raw: json, latencyMs, costUsd: null });
  }
  const text = asArray(asRecord(cand.content)?.parts)
    .map((p) => str(asRecord(p)?.text) ?? "")
    .join("");
  const gm = asRecord(cand.groundingMetadata);
  const queries = asArray(gm?.webSearchQueries).filter((q): q is string => typeof q === "string");
  const spans = new Map<number, { start: number | null; end: number | null }>();
  for (const s of asArray(gm?.groundingSupports)) {
    const sup = asRecord(s);
    const seg = asRecord(sup?.segment);
    for (const i of asArray(sup?.groundingChunkIndices)) {
      if (typeof i === "number" && !spans.has(i)) spans.set(i, { start: num(seg?.startIndex) ?? 0, end: num(seg?.endIndex) });
    }
  }
  const citations: CaptureCitation[] = [];
  asArray(gm?.groundingChunks).forEach((c, i) => {
    const web = asRecord(asRecord(c)?.web);
    const url = str(web?.uri);
    if (!url) return;
    const span = spans.get(i);
    citations.push({ url, position: citations.length + 1, linked: Boolean(span), title: str(web?.title), domain: str(web?.domain), spanStart: span?.start ?? null, spanEnd: span?.end ?? null });
  });

  const usage = asRecord(root.usageMetadata);
  const model = str(root.modelVersion) ?? requestedModel;
  const inTok = num(usage?.promptTokenCount) ?? 0;
  const outTok = (num(usage?.candidatesTokenCount) ?? 0) + (num(usage?.thoughtsTokenCount) ?? 0);
  const tokens = tokenUsd(model, inTok, outTok) ?? tokenUsd(requestedModel, inTok, outTok);
  return {
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations,
    fanoutQueries: queries,
    modelBuild: str(root.modelVersion) ?? `requested:${requestedModel}`,
    regionHonored: regionHonored(req.region, req.region.latitude !== null && req.region.longitude !== null ? "coordinates" : "none", "approximate"),
    searchUsed: queries.length > 0 || citations.length > 0,
    raw: json,
    costUnits: queries.length,
    costUsd: tokens === null || !usage ? null : roundUsd(tokens + queries.length * SEARCH_CALL_USD.gemini),
    latencyMs,
    error: str(cand.finishReason) && cand.finishReason !== "STOP" ? `finishReason ${String(cand.finishReason)}` : undefined,
  };
}

export function createGeminiAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const missingConfig = () => missingVars(env(), ["GEMINI_API_KEY", GEMINI_MODEL_ENV]);
  return {
    id: "gemini",
    supports: (engine, runner) => engine === "gemini" && runner === "api_search",
    missingConfig,
    estimate() {
      const model = env()[GEMINI_MODEL_ENV] ?? "";
      const t = TOKEN_ASSUMPTIONS.gemini;
      const tokens = TOKEN_RATES[model] ? tokenUsd(model, t.input, t.output) : null;
      return { units: t.searches, usd: tokens === null ? null : roundUsd(tokens + t.searches * SEARCH_CALL_USD.gemini), note: "upper bound; ignores the free monthly search allowance" };
    },
    async capture(req) {
      if (!(req.engine === "gemini" && req.runner === "api_search")) return errorResult(`gemini does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const model = env()[GEMINI_MODEL_ENV] as string;
      const body: Record<string, unknown> = { contents: [{ role: "user", parts: [{ text: req.prompt }] }], tools: [{ googleSearch: {} }] };
      if (req.region.latitude !== null && req.region.longitude !== null) {
        body.toolConfig = { retrievalConfig: { latLng: { latitude: req.region.latitude, longitude: req.region.longitude } } };
      }
      const res = await httpJson(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": env().GEMINI_API_KEY as string, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 180_000,
      });
      return httpFailure(res) ?? parseGemini(req, res.json, res.latencyMs, model);
    },
  };
}

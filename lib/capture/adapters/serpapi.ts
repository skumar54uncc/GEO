import { flattenTextBlocks, registrableDomain } from "@/lib/domain";
import { asArray, asRecord, httpJson, num, str, type HttpResult } from "../http";
import { regionHonored } from "../regions";
import { errorResult, type AioState, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter, type RegionHonored } from "../types";
import { depsOf, missingVars, type AdapterDeps } from "./common";

/** Google returned no results at all: a real outcome (no overview), not a failure. */
const NO_RESULTS = /hasn't returned any results/i;
const BLOCKED = /(invalid api key|run out of searches|account.*(suspended|disabled)|rate limit)/i;

export function measurementParams(req: CaptureRequest): Record<string, string> {
  const p: Record<string, string> = { engine: "google", q: req.prompt, hl: req.region.language || "en", device: "desktop", no_cache: "true" };
  if (req.region.serpLocation) p.location = req.region.serpLocation;
  if (req.region.country) p.gl = req.region.country.toLowerCase();
  return p;
}

function serpRegionHonored(req: CaptureRequest, json: Record<string, unknown> | null): RegionHonored {
  const sp = asRecord(json?.search_parameters);
  const used = str(sp?.location_used);
  if (!req.region.serpLocation) return "no";
  if (used && used.replace(/\s/g, "").toLowerCase() !== req.region.serpLocation.replace(/\s/g, "").toLowerCase()) return "no";
  return regionHonored(req.region, req.region.city ? "city" : req.region.state ? "state" : "country", "native");
}

export function parseSerpApi(req: CaptureRequest, search: Record<string, unknown>, followUp: Record<string, unknown> | null, searches: number, latencyMs: number): CaptureResult & { aioState: AioState } {
  const organic = asArray(search.organic_results)
    .map((o, i) => {
      const r = asRecord(o);
      const url = str(r?.link);
      return url ? { position: num(r?.position) ?? i + 1, url, domain: registrableDomain(url) ?? "", title: str(r?.title) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const aio = asRecord(followUp?.ai_overview) ?? asRecord(search.ai_overview);
  const raw = followUp ? { search, ai_overview_followup: followUp } : search;
  const base = { raw, latencyMs, costUnits: searches, costUsd: null, fanoutQueries: [] as string[], modelBuild: "unknown", regionHonored: serpRegionHonored(req, search), organic };

  if (!aio) return { ...base, status: "empty", answerText: "", citations: [], aioState: "not_shown" };
  if (str(aio.error)) return { ...base, ...errorResult(`AI Overview error: ${str(aio.error)}`, { raw }), costUnits: searches, costUsd: null, organic, aioState: "failed" };
  const text = flattenTextBlocks(aio.text_blocks);
  if (!text.trim()) {
    // A page_token with no follow-up, or a follow-up without text blocks: the overview was shown but not captured.
    return { ...base, ...errorResult("AI Overview shown but text not captured", { raw }), costUnits: searches, costUsd: null, organic, aioState: "failed" };
  }
  const citations: CaptureCitation[] = [];
  for (const ref of asArray(aio.references)) {
    const r = asRecord(ref);
    const url = str(r?.link);
    if (url) citations.push({ url, position: citations.length + 1, linked: true, title: str(r?.title) });
  }
  return { ...base, status: "ok", answerText: text, citations, aioState: "shown" };
}

function bodyError(res: HttpResult): string | null {
  return str(asRecord(res.json)?.error);
}

/**
 * SerpAPI compatible Google search for AI Overview. Measurement draws always send no_cache=true, so each
 * draw is a real capture. A page_token answer needs a second search within about a minute.
 */
export function createSerpApiAdapter(
  deps: AdapterDeps & { id?: string; baseUrl?: string; keyEnv?: string | null } = {},
): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const id = deps.id ?? "serpapi";
  const keyEnv = deps.keyEnv === undefined ? "SERPAPI_API_KEY" : deps.keyEnv;
  const baseUrl = () => (deps.baseUrl ?? "https://serpapi.com").replace(/\/$/, "");
  const missingConfig = () => (keyEnv ? missingVars(env(), [keyEnv]) : []);

  async function search(params: Record<string, string>): Promise<HttpResult> {
    const q = new URLSearchParams(params);
    if (keyEnv) q.set("api_key", env()[keyEnv] as string);
    return httpJson(fetchImpl, `${baseUrl()}/search?${q.toString()}`, { timeoutMs: 120_000 });
  }

  function failure(res: HttpResult, searches: number, raw: unknown): CaptureResult & { aioState: AioState } {
    const msg = bodyError(res) ?? res.error ?? `HTTP ${res.status}`;
    const blocked = res.status === 401 || res.status === 403 || res.status === 429 || BLOCKED.test(msg);
    return { ...errorResult(msg, { raw, latencyMs: res.latencyMs, status: blocked ? "blocked" : "error", costUsd: null }), costUnits: searches, aioState: blocked ? "blocked" : "failed" };
  }

  return {
    id,
    supports: (engine, runner) => engine === "google_aio" && runner === "serp_provider",
    missingConfig,
    estimate: () => ({ units: 2, usd: null, note: "1 search, plus 1 when the overview arrives as a page_token; price depends on the plan" }),
    async capture(req) {
      if (!(req.engine === "google_aio" && req.runner === "serp_provider")) return errorResult(`${id} does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const started = Date.now();
      const first = await search(measurementParams(req));
      const firstJson = asRecord(first.json);
      if (firstJson && NO_RESULTS.test(bodyError(first) ?? "")) {
        return parseSerpApi(req, firstJson, null, 1, Date.now() - started);
      }
      if (!first.ok || !firstJson || bodyError(first)) return failure(first, first.status === 0 ? 0 : 1, first.json ?? (first.text || null));

      const aio = asRecord(firstJson.ai_overview);
      const token = str(aio?.page_token);
      if (!aio || aio.text_blocks || !token) return parseSerpApi(req, firstJson, null, 1, Date.now() - started);

      const second = await search({ engine: "google_ai_overview", page_token: token, no_cache: "true" });
      const secondJson = asRecord(second.json);
      if (!second.ok || !secondJson || bodyError(second)) {
        const f = failure(second, second.status === 0 ? 1 : 2, { search: firstJson, ai_overview_followup: second.json ?? second.text });
        return { ...f, latencyMs: Date.now() - started, organic: parseSerpApi(req, firstJson, null, 1, 0).organic };
      }
      return parseSerpApi(req, firstJson, secondJson, 2, Date.now() - started);
    },
  };
}

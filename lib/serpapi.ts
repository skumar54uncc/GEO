import { AIO_LOCATION_NOTE, GOOGLE_AIO_LOCATION, type AppConfig, type JudgeCitation } from "./types";
import { competitorForDomain, flattenTextBlocks, isTargetDomain, nowIso, registrableDomain } from "./domain";
import { getStore, hashParams } from "./db";
import { TARGET_REGISTRABLE_DOMAIN } from "@/seed/config";

const SERP_ENDPOINT = "https://serpapi.com/search";

export type SerpCallResult = {
  ok: boolean;
  cached: boolean;
  credits_charged: number;
  engine: string;
  params_hash: string;
  json: Record<string, unknown> | null;
  error: string | null;
};

export type CreditEstimate = {
  prompt_count: number;
  calls_per_prompt: number;
  estimated_calls: number;
  estimated_uncached_calls: number;
  credits_remaining: number;
  per_run_cap: number;
  allowed: boolean;
  refusal_reason: string | null;
  breakdown: Array<{ prompt_id: number; google_cached: boolean; aio_unknown: boolean }>;
};

function apiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY is not set");
  return key;
}

export function estimateAioBatch(promptIds: number[]): CreditEstimate {
  const store = getStore();
  const cfg = store.getConfig();
  const calls_per_prompt = 2;
  const breakdown: CreditEstimate["breakdown"] = [];
  let uncached = 0;
  for (const prompt_id of promptIds) {
    const prompt = store.getPrompt(prompt_id);
    if (!prompt) continue;
    const googleParams = googleSearchParams(prompt.text);
    const googleHash = hashParams(googleParams);
    const cached = store.getSerpCache(googleHash);
    const googleCached = Boolean(cached);
    let aioCached = false;
    if (cached) {
      try {
        const json = JSON.parse(cached.raw_json) as { ai_overview?: { text_blocks?: unknown; page_token?: string } };
        const aio = json.ai_overview;
        aioCached = Boolean(aio?.text_blocks) || !aio;
      } catch {
        aioCached = false;
      }
    }
    breakdown.push({ prompt_id, google_cached: googleCached, aio_unknown: !aioCached });
    if (!googleCached) uncached += 1;
    if (!aioCached) uncached += 1;
  }
  const estimated_calls = promptIds.length * calls_per_prompt;
  const allowedByCap = estimated_calls <= cfg.serpapi_per_run_cap;
  const allowedByBalance = uncached <= cfg.serpapi_credits_remaining;
  let refusal_reason: string | null = null;
  if (!allowedByCap) {
    refusal_reason = `Estimate ${estimated_calls} calls exceeds per-run cap of ${cfg.serpapi_per_run_cap}.`;
  } else if (!allowedByBalance) {
    refusal_reason = `Estimate up to ${uncached} uncached credits exceeds remaining balance of ${cfg.serpapi_credits_remaining}.`;
  }
  return {
    prompt_count: promptIds.length,
    calls_per_prompt,
    estimated_calls,
    estimated_uncached_calls: uncached,
    credits_remaining: cfg.serpapi_credits_remaining,
    per_run_cap: cfg.serpapi_per_run_cap,
    allowed: allowedByCap && allowedByBalance,
    refusal_reason,
    breakdown,
  };
}

function googleSearchParams(q: string): Record<string, unknown> {
  return {
    engine: "google",
    q,
    location: GOOGLE_AIO_LOCATION,
    gl: "us",
    hl: "en",
    no_cache: "false",
  };
}

export async function serpCall(
  params: Record<string, unknown>,
  opts: { prompt_id?: number | null } = {},
): Promise<SerpCallResult> {
  const store = getStore();
  const engine = String(params.engine ?? "unknown");
  const params_hash = hashParams(params);
  const cached = store.getSerpCache(params_hash);
  if (cached) {
    store.logSerpEvent({
      created_at: nowIso(),
      engine,
      ok: 1,
      cached: 1,
      credits_charged: 0,
      error: null,
      prompt_id: opts.prompt_id ?? null,
      params_hash,
    });
    return {
      ok: true,
      cached: true,
      credits_charged: 0,
      engine,
      params_hash,
      json: JSON.parse(cached.raw_json) as Record<string, unknown>,
      error: null,
    };
  }

  const cfg = store.getConfig();
  if (cfg.serpapi_credits_remaining < 1) {
    const error = "SerpAPI credit balance is 0. Refusing uncached call.";
    store.logSerpEvent({
      created_at: nowIso(),
      engine,
      ok: 0,
      cached: 0,
      credits_charged: 0,
      error,
      prompt_id: opts.prompt_id ?? null,
      params_hash,
    });
    return { ok: false, cached: false, credits_charged: 0, engine, params_hash, json: null, error };
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    query.set(k, String(v));
  }
  query.set("api_key", apiKey());
  query.set("no_cache", "false");

  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${SERP_ENDPOINT}?${query.toString()}`, { cache: "no-store" });
    const text = await res.text();
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { parse_error: true, raw: text };
    }
    if (!res.ok || (json && typeof json.error === "string")) {
      const error = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
      store.putSerpCache({
        engine,
        params_hash,
        params_json: JSON.stringify(params),
        raw_json: JSON.stringify(json),
        credits_charged: 1,
      });
      store.chargeCredits(1);
      store.logSerpEvent({
        created_at: nowIso(),
        engine,
        ok: 0,
        cached: 0,
        credits_charged: 1,
        error,
        prompt_id: opts.prompt_id ?? null,
        params_hash,
      });
      return { ok: false, cached: false, credits_charged: 1, engine, params_hash, json, error };
    }
    store.putSerpCache({
      engine,
      params_hash,
      params_json: JSON.stringify(params),
      raw_json: JSON.stringify(json),
      credits_charged: 1,
    });
    store.chargeCredits(1);
    store.logSerpEvent({
      created_at: nowIso(),
      engine,
      ok: 1,
      cached: 0,
      credits_charged: 1,
      error: null,
      prompt_id: opts.prompt_id ?? null,
      params_hash,
    });
    return { ok: true, cached: false, credits_charged: 1, engine, params_hash, json, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    store.logSerpEvent({
      created_at: nowIso(),
      engine,
      ok: 0,
      cached: 0,
      credits_charged: 0,
      error,
      prompt_id: opts.prompt_id ?? null,
      params_hash,
    });
    return { ok: false, cached: false, credits_charged: 0, engine, params_hash, json: null, error };
  }
}

export type AioFetchResult = {
  prompt_id: number;
  ok: boolean;
  aio_shown: boolean;
  finding: string;
  error: string | null;
  credits_charged: number;
  cached_calls: number;
  live_calls: number;
  response_id: number | null;
  organic: {
    target_ranked: boolean;
    target_position: number | null;
    competitor_domains: string[];
  } | null;
};

function citationsFromReferences(refs: unknown, config: AppConfig): JudgeCitation[] {
  if (!Array.isArray(refs)) return [];
  const out: JudgeCitation[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") continue;
    const link = String((ref as { link?: string }).link ?? (ref as { source?: string }).source ?? "");
    const domain = registrableDomain(link);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, is_target: isTargetDomain(domain, config) });
  }
  return out;
}

export function seedAioCitations(rawJson: unknown, config: AppConfig): JudgeCitation[] {
  const root = rawJson as { ai_overview?: { references?: unknown }; references?: unknown };
  const refs = root?.ai_overview?.references ?? root?.references ?? [];
  return citationsFromReferences(refs, config);
}

export async function fetchAioForPrompt(promptId: number): Promise<AioFetchResult> {
  const store = getStore();
  const config = store.getConfig();
  const prompt = store.getPrompt(promptId);
  if (!prompt) {
    return {
      prompt_id: promptId,
      ok: false,
      aio_shown: false,
      finding: "prompt not found",
      error: "Unknown prompt id",
      credits_charged: 0,
      cached_calls: 0,
      live_calls: 0,
      response_id: null,
      organic: null,
    };
  }

  let credits = 0;
  let cached_calls = 0;
  let live_calls = 0;

  const google = await serpCall(googleSearchParams(prompt.text), { prompt_id: promptId });
  credits += google.credits_charged;
  if (google.cached) cached_calls += 1;
  else live_calls += 1;
  if (!google.ok || !google.json) {
    return {
      prompt_id: promptId,
      ok: false,
      aio_shown: false,
      finding: "google search failed",
      error: google.error,
      credits_charged: credits,
      cached_calls,
      live_calls,
      response_id: null,
      organic: null,
    };
  }

  const organic = extractOrganic(google.json, config);
  store.upsertOrganic({
    prompt_id: promptId,
    target_ranked: organic.target_ranked ? 1 : 0,
    target_position: organic.target_position,
    competitor_domains: JSON.stringify(organic.competitor_domains),
    paa: JSON.stringify(organic.paa),
    related_searches: JSON.stringify(organic.related_searches),
    aio_shown: null,
    fetched_at: nowIso(),
  });

  let aio = (google.json.ai_overview ?? null) as Record<string, unknown> | null;
  let aioSource: Record<string, unknown> = google.json;

  if (aio && !aio.text_blocks && typeof aio.page_token === "string") {
    const token = aio.page_token;
    const aioCall = await serpCall(
      { engine: "google_ai_overview", page_token: token, no_cache: "false" },
      { prompt_id: promptId },
    );
    credits += aioCall.credits_charged;
    if (aioCall.cached) cached_calls += 1;
    else live_calls += 1;
    if (!aioCall.ok || !aioCall.json) {
      const existing = store.getOrganic(promptId);
      if (existing) {
        store.upsertOrganic({
          prompt_id: existing.prompt_id,
          target_ranked: existing.target_ranked,
          target_position: existing.target_position,
          competitor_domains: existing.competitor_domains,
          paa: existing.paa,
          related_searches: existing.related_searches,
          aio_shown: 0,
          fetched_at: nowIso(),
        });
      }
      return {
        prompt_id: promptId,
        ok: false,
        aio_shown: false,
        finding: "AI Overview page_token fetch failed",
        error: aioCall.error,
        credits_charged: credits,
        cached_calls,
        live_calls,
        response_id: null,
        organic,
      };
    }
    aio = (aioCall.json.ai_overview ?? aioCall.json) as Record<string, unknown>;
    aioSource = aioCall.json;
    const merged = { ...google.json, ai_overview: aio };
    store.putSerpCache({
      engine: "google",
      params_hash: google.params_hash,
      params_json: JSON.stringify(googleSearchParams(prompt.text)),
      raw_json: JSON.stringify(merged),
      credits_charged: google.credits_charged,
    });
  }

  if (!aio) {
    store.upsertOrganic({
      prompt_id: promptId,
      target_ranked: organic.target_ranked ? 1 : 0,
      target_position: organic.target_position,
      competitor_domains: JSON.stringify(organic.competitor_domains),
      paa: JSON.stringify(organic.paa),
      related_searches: JSON.stringify(organic.related_searches),
      aio_shown: 0,
      fetched_at: nowIso(),
    });
    const rows = store.upsertResponses([
      {
        prompt_id: promptId,
        surface: "google_aio",
        run_number: 1,
        raw_text: "no AI Overview shown",
        source_type: "serpapi",
        location_note: AIO_LOCATION_NOTE,
      },
    ]);
    return {
      prompt_id: promptId,
      ok: true,
      aio_shown: false,
      finding: "no AI Overview shown",
      error: null,
      credits_charged: credits,
      cached_calls,
      live_calls,
      response_id: rows[0]?.id ?? null,
      organic,
    };
  }

  const text = flattenTextBlocks(aio.text_blocks) || "no AI Overview shown";
  const shown = Boolean(aio.text_blocks) && text !== "no AI Overview shown";
  store.upsertOrganic({
    prompt_id: promptId,
    target_ranked: organic.target_ranked ? 1 : 0,
    target_position: organic.target_position,
    competitor_domains: JSON.stringify(organic.competitor_domains),
    paa: JSON.stringify(organic.paa),
    related_searches: JSON.stringify(organic.related_searches),
    aio_shown: shown ? 1 : 0,
    fetched_at: nowIso(),
  });

  const rows = store.upsertResponses([
    {
      prompt_id: promptId,
      surface: "google_aio",
      run_number: 1,
      raw_text: shown ? text : "no AI Overview shown",
      source_type: "serpapi",
      location_note: AIO_LOCATION_NOTE,
    },
  ]);

  void aioSource;

  return {
    prompt_id: promptId,
    ok: true,
    aio_shown: shown,
    finding: shown ? "AI Overview captured" : "no AI Overview shown",
    error: null,
    credits_charged: credits,
    cached_calls,
    live_calls,
    response_id: rows[0]?.id ?? null,
    organic,
  };
}

export async function fetchAioBatch(promptIds: number[]): Promise<{
  estimate: CreditEstimate;
  results: AioFetchResult[];
  refused: boolean;
}> {
  const estimate = estimateAioBatch(promptIds);
  if (!estimate.allowed) {
    return { estimate, results: [], refused: true };
  }
  const results: AioFetchResult[] = [];
  for (const id of promptIds) {
    try {
      results.push(await fetchAioForPrompt(id));
    } catch (err) {
      results.push({
        prompt_id: id,
        ok: false,
        aio_shown: false,
        finding: "uncaught error",
        error: err instanceof Error ? err.message : String(err),
        credits_charged: 0,
        cached_calls: 0,
        live_calls: 0,
        response_id: null,
        organic: null,
      });
    }
  }
  return { estimate, results, refused: false };
}

function extractOrganic(json: Record<string, unknown>, config: AppConfig) {
  const organic = Array.isArray(json.organic_results) ? json.organic_results : [];
  let target_ranked = false;
  let target_position: number | null = null;
  const competitor_domains: string[] = [];
  organic.slice(0, 10).forEach((item, idx) => {
    const rec = item as { position?: number; link?: string; displayed_link?: string };
    const domain = registrableDomain(rec.link || rec.displayed_link || "");
    const position = typeof rec.position === "number" ? rec.position : idx + 1;
    if (isTargetDomain(domain, config) || domain === TARGET_REGISTRABLE_DOMAIN) {
      if (!target_ranked) {
        target_ranked = true;
        target_position = position;
      }
    }
    const competitor = competitorForDomain(domain, config);
    if (competitor && domain && !competitor_domains.includes(domain)) competitor_domains.push(domain);
  });
  const paa = Array.isArray(json.related_questions)
    ? json.related_questions.map((q) => {
        const rec = q as { question?: string; snippet?: string };
        return { question: rec.question ?? "", snippet: rec.snippet ?? "" };
      })
    : [];
  const related_searches = Array.isArray(json.related_searches)
    ? json.related_searches.map((q) => {
        const rec = q as { query?: string };
        return rec.query ?? "";
      })
    : [];
  return { target_ranked, target_position, competitor_domains, paa, related_searches };
}

export async function fetchTrends(terms: string[], dataType: string, geo?: string) {
  const q = terms.slice(0, dataType === "TIMESERIES" || dataType === "GEO_MAP" ? 5 : 1).join(",");
  const params: Record<string, unknown> = {
    engine: "google_trends",
    q,
    data_type: dataType,
    date: "today 12-m",
    no_cache: "false",
  };
  if (geo) params.geo = geo;
  const result = await serpCall(params);
  if (result.ok && result.json) {
    getStore().putTrend(`${q}::${geo || "WORLD"}`, dataType, JSON.stringify(result.json));
  }
  return result;
}

export async function fetchAutocomplete(term: string) {
  const result = await serpCall({ engine: "google_autocomplete", q: term, no_cache: "false" });
  if (result.ok && result.json) {
    getStore().putAutocomplete(term, JSON.stringify(result.json));
  }
  return result;
}

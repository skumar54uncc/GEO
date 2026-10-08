import { getStore, hashParams } from "./db";
import { fetchAutocomplete, fetchTrends, type CreditEstimate, type SerpCallResult } from "./serpapi";
import { AUTOCOMPLETE_SEEDS, FLAGSHIP_TERMS, TREND_GEOS, TREND_TERMS, TRENDS_DATE_RANGE } from "@/seed/demand";
import { CAMPAIGN, YEAR_SLATE, isCampaignPhrase, type CampaignPiece } from "@/seed/campaign";

export type DemandJob = {
  kind: "timeseries" | "timeseries_solo" | "geo_map_0" | "autocomplete";
  label: string;
  params: Record<string, unknown>;
  q?: string;
};

export type DemandTermView = {
  term: string;
  subtopic: string;
  averages: Record<string, number | null>;
  series: Record<string, Array<{ date: string; value: number }>>;
  rising: Array<{ query: string; value: string }>;
  top: Array<{ query: string; value: string }>;
};

export type DemandSnapshot = {
  terms: DemandTermView[];
  flagship: DemandTermView[];
  regional: Array<{ location: string; value: number }>;
  phrases: Array<{ seed: string; suggestions: string[] }>;
  google_questions: Array<{ prompt: string; questions: string[] }>;
  campaign: typeof CAMPAIGN;
  slate: CampaignPiece[];
  note: string;
  jobs: number;
  fetched: boolean;
};

function timeseriesParams(geo: string): Record<string, unknown> {
  return {
    engine: "google_trends",
    q: TREND_TERMS.map((t) => t.term).join(","),
    data_type: "TIMESERIES",
    date: TRENDS_DATE_RANGE,
    geo,
    no_cache: "false",
  };
}

export function listDemandJobs(): DemandJob[] {
  const jobs: DemandJob[] = [];
  for (const g of TREND_GEOS) {
    jobs.push({
      kind: "timeseries",
      label: `Compare 5 campaign topics · ${g.label}`,
      params: timeseriesParams(g.geo),
    });
  }
  for (const term of FLAGSHIP_TERMS) {
    for (const g of TREND_GEOS) {
      jobs.push({
        kind: "timeseries_solo",
        label: `${term} over time · ${g.label}`,
        q: term,
        params: {
          engine: "google_trends",
          q: term,
          data_type: "TIMESERIES",
          date: TRENDS_DATE_RANGE,
          geo: g.geo,
          no_cache: "false",
        },
      });
    }
  }
  jobs.push({
    kind: "geo_map_0",
    label: "Interest by US state · electric grid",
    params: {
      engine: "google_trends",
      q: "electric grid",
      data_type: "GEO_MAP_0",
      date: TRENDS_DATE_RANGE,
      geo: "US",
      no_cache: "false",
    },
  });
  for (const seed of AUTOCOMPLETE_SEEDS) {
    jobs.push({
      kind: "autocomplete",
      label: `Autocomplete · ${seed}`,
      params: { engine: "google_autocomplete", q: seed, no_cache: "false" },
    });
  }
  return jobs;
}

export function estimateDemandPack(): CreditEstimate {
  const store = getStore();
  const cfg = store.getConfig();
  const jobs = listDemandJobs();
  let uncached = 0;
  for (const job of jobs) {
    if (!store.getSerpCache(hashParams(job.params))) uncached += 1;
  }
  const estimated_calls = jobs.length;
  const allowedByCap = estimated_calls <= cfg.serpapi_per_run_cap;
  const allowedByBalance = uncached <= cfg.serpapi_credits_remaining;
  let refusal_reason: string | null = null;
  if (!allowedByCap) {
    refusal_reason = `Demand pack is ${estimated_calls} calls; per-run cap is ${cfg.serpapi_per_run_cap}.`;
  } else if (!allowedByBalance) {
    refusal_reason = `Up to ${uncached} uncached credits exceeds remaining balance of ${cfg.serpapi_credits_remaining}.`;
  }
  return {
    prompt_count: jobs.length,
    calls_per_prompt: 1,
    estimated_calls,
    estimated_uncached_calls: uncached,
    credits_remaining: cfg.serpapi_credits_remaining,
    per_run_cap: cfg.serpapi_per_run_cap,
    allowed: allowedByCap && allowedByBalance,
    refusal_reason,
    breakdown: jobs.map((job, i) => ({
      prompt_id: i + 1,
      google_cached: Boolean(store.getSerpCache(hashParams(job.params))),
      aio_unknown: false,
    })),
  };
}

export async function fetchDemandPack(): Promise<{
  estimate: CreditEstimate;
  refused: boolean;
  results: Array<{ label: string; ok: boolean; cached: boolean; error: string | null; credits_charged: number }>;
}> {
  const estimate = estimateDemandPack();
  if (!estimate.allowed) {
    return { estimate, refused: true, results: [] };
  }
  const results: Array<{ label: string; ok: boolean; cached: boolean; error: string | null; credits_charged: number }> = [];
  for (const job of listDemandJobs()) {
    let result: SerpCallResult;
    try {
      if (job.kind === "autocomplete") {
        result = await fetchAutocomplete(String(job.params.q));
      } else if (job.kind === "timeseries") {
        result = await fetchTrends(TREND_TERMS.map((t) => t.term), "TIMESERIES", String(job.params.geo));
      } else if (job.kind === "timeseries_solo") {
        result = await fetchTrends([String(job.params.q)], "TIMESERIES", String(job.params.geo));
      } else {
        result = await fetchTrends(["electric grid"], "GEO_MAP_0", "US");
      }
      results.push({
        label: job.label,
        ok: result.ok,
        cached: result.cached,
        error: result.error,
        credits_charged: result.credits_charged,
      });
    } catch (err) {
      results.push({
        label: job.label,
        ok: false,
        cached: false,
        error: err instanceof Error ? err.message : String(err),
        credits_charged: 0,
      });
    }
  }
  return { estimate: estimateDemandPack(), refused: false, results };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "<1") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return 0;
}

function emptyView(term: string, subtopic: string): DemandTermView {
  return { term, subtopic, averages: {}, series: {}, rising: [], top: [] };
}

function ingestTimeseries(json: Record<string, unknown>, geo: string, byTerm: Map<string, DemandTermView>) {
  const iot = json.interest_over_time as
    | {
        averages?: Array<{ query?: string; value?: number }>;
        timeline_data?: Array<{ date?: string; values?: Array<{ query?: string; extracted_value?: number; value?: string }> }>;
      }
    | undefined;
  for (const avg of iot?.averages ?? []) {
    const view = byTerm.get(avg.query || "");
    if (view) view.averages[geo] = typeof avg.value === "number" ? avg.value : num(avg.value);
  }
  for (const point of iot?.timeline_data ?? []) {
    for (const v of point.values ?? []) {
      const view = byTerm.get(v.query || "");
      if (!view) continue;
      if (!view.series[geo]) view.series[geo] = [];
      view.series[geo].push({ date: point.date || "", value: v.extracted_value ?? num(v.value) ?? 0 });
    }
  }
}

export function loadDemandSnapshot(): DemandSnapshot {
  const store = getStore();
  const trends = store.listTrends();
  const autos = store.listAutocomplete();
  const terms: DemandTermView[] = TREND_TERMS.map((t) => emptyView(t.term, t.subtopic));
  const flagship: DemandTermView[] = FLAGSHIP_TERMS.map((t) => emptyView(t, "grid_technology"));
  const byTerm = new Map([...terms, ...flagship].map((t) => [t.term, t]));

  for (const row of trends) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(row.raw_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    const geo = row.term_key.split("::")[1] || "WORLD";
    if (row.data_type === "TIMESERIES") ingestTimeseries(json, geo, byTerm);
    if (row.data_type === "RELATED_QUERIES") {
      const q = row.term_key.split("::")[0];
      const view = byTerm.get(q);
      const rq = json.related_queries as {
        rising?: Array<{ query?: string; value?: string }>;
        top?: Array<{ query?: string; value?: string }>;
      };
      if (view) {
        view.rising = (rq?.rising ?? [])
          .map((r) => ({ query: r.query || "", value: String(r.value ?? "") }))
          .filter((r) => isCampaignPhrase(r.query));
        view.top = (rq?.top ?? [])
          .map((r) => ({ query: r.query || "", value: String(r.value ?? "") }))
          .filter((r) => isCampaignPhrase(r.query));
      }
    }
  }

  const regional: Array<{ location: string; value: number }> = [];
  for (const row of trends) {
    if (row.data_type !== "GEO_MAP_0") continue;
    try {
      const json = JSON.parse(row.raw_json) as {
        interest_by_region?: Array<{ location?: string; extracted_value?: number; value?: string }>;
      };
      for (const r of json.interest_by_region ?? []) {
        regional.push({ location: r.location || "", value: r.extracted_value ?? num(r.value) ?? 0 });
      }
    } catch {
      continue;
    }
  }

  const phrases = autos.map((a) => {
    let suggestions: string[] = [];
    try {
      const json = JSON.parse(a.raw_json) as { suggestions?: Array<{ value?: string }> };
      suggestions = (json.suggestions ?? []).map((s) => s.value || "").filter((s) => isCampaignPhrase(s));
    } catch {
      suggestions = [];
    }
    return { seed: a.term, suggestions };
  });

  const google_questions: Array<{ prompt: string; questions: string[] }> = [];
  for (const org of store.listOrganic()) {
    const prompt = store.getPrompt(org.prompt_id);
    const questions: string[] = [];
    try {
      const paa = JSON.parse(org.paa) as Array<{ question?: string }>;
      for (const p of paa) if (p.question && isCampaignPhrase(p.question)) questions.push(p.question);
    } catch {
      /* ignore */
    }
    try {
      const related = JSON.parse(org.related_searches) as string[];
      for (const q of related) if (q && isCampaignPhrase(q)) questions.push(q);
    } catch {
      /* ignore */
    }
    if (prompt && questions.length) google_questions.push({ prompt: prompt.text, questions: questions.slice(0, 8) });
  }

  return {
    terms,
    flagship,
    regional: regional.sort((a, b) => b.value - a.value).slice(0, 12),
    phrases,
    google_questions,
    campaign: CAMPAIGN,
    slate: YEAR_SLATE,
    note: "The five-topic chart is relative among those five topics only — a low number does not mean nobody searches it. Flagship charts (electric grid, data center electricity) are each scaled 0–100 against themselves. Related queries like “walmart near me” are discarded; they appear when Google Trends volume is too thin. Southeast is NC + SC because Trends has no Southeast region.",
    jobs: listDemandJobs().length,
    fetched: trends.length > 0 || autos.length > 0,
  };
}

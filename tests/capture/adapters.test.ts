import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createAnthropicAdapter, parseAnthropic } from "@/lib/capture/adapters/anthropic";
import { createBrightDataAdapter, parseBrightDataRecords } from "@/lib/capture/adapters/brightdata";
import { createDataForSeoAdapter, parseDataForSeo } from "@/lib/capture/adapters/dataforseo";
import { createGeminiAdapter, parseGemini } from "@/lib/capture/adapters/gemini";
import { parityStatus } from "@/lib/capture/adapters/localSerp";
import { createOpenAiAdapter, parseOpenAi } from "@/lib/capture/adapters/openai";
import { createPerplexityAdapter, parsePerplexity } from "@/lib/capture/adapters/perplexity";
import { createSerpApiAdapter, measurementParams } from "@/lib/capture/adapters/serpapi";
import { createAdapter, PROVIDER_IDS, allRoutes } from "@/lib/capture/registry";
import { regionHonored } from "@/lib/capture/regions";
import type { CaptureRequest, Engine, Region, Runner } from "@/lib/capture/types";

const FIX = path.join(__dirname, "../fixtures/capture");
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));

const CLT: Region = {
  id: "r1",
  label: "Charlotte, North Carolina, United States",
  country: "US",
  state: "North Carolina",
  city: "Charlotte",
  language: "en",
  serpLocation: "Charlotte,North Carolina,United States",
  latitude: 35.2271,
  longitude: -80.8431,
  timezone: "America/New_York",
};

function req(engine: Engine, runner: Runner, drawIndex = 1): CaptureRequest {
  return { drawId: "d1", engine, runner, prompt: "best engineering schools in North Carolina", region: CLT, drawIndex };
}

const ENV = {
  DATAFORSEO_LOGIN: "l",
  DATAFORSEO_PASSWORD: "p",
  DATAFORSEO_PARAMETRIC_MODEL_CHATGPT: "gpt-4.1-mini",
  DATAFORSEO_PERPLEXITY_MODEL: "sonar",
  BRIGHTDATA_API_KEY: "k",
  OPENAI_API_KEY: "k",
  OPENAI_SEARCH_MODEL: "gpt-6-sol",
  ANTHROPIC_API_KEY: "k",
  ANTHROPIC_MODEL: "claude-sonnet-5-5",
  PERPLEXITY_API_KEY: "k",
  PERPLEXITY_MODEL: "perplexity/sonar",
  GEMINI_API_KEY: "k",
  GEMINI_MODEL: "gemini-3.8-flash",
  SERPAPI_API_KEY: "k",
  SERPAPI_BASE_URL: "http://127.0.0.1:9",
};

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  return async () => new Response(body, { status, headers });
}

describe("DataForSEO parsing (documented samples)", () => {
  it("ChatGPT LLM Scraper: markdown answer, sources, fan out, model, cost", () => {
    const r = parseDataForSeo(req("chatgpt", "ui_provider"), fixture("dataforseo_chatgpt_llm_scraper_live_advanced.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.answerText.length).toBeGreaterThan(50);
    expect(r.citations.length).toBe(3);
    expect(r.citations[0].url).toContain("wikipedia.org");
    expect(r.fanoutQueries).toEqual(["Albert Einstein biography"]);
    expect(r.modelBuild).toBe("gpt-4o");
    expect(r.costUsd).toBe(0.004);
    // Only the country is sent to the LLM Scraper, so a city region is not honored.
    expect(r.regionHonored).toBe("no");
  });

  it("Gemini LLM Scraper", () => {
    const r = parseDataForSeo(req("gemini", "ui_provider"), fixture("dataforseo_gemini_llm_scraper_live_advanced.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.citations.length).toBe(2);
    expect(r.modelBuild).toBe("Fast");
  });

  it("AI Mode: overview markdown and references, native location honored", () => {
    const r = parseDataForSeo(req("google_ai_mode", "serp_provider"), fixture("dataforseo_google_ai_mode_live_advanced.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.citations.length).toBe(13);
    expect(r.modelBuild).toBe("unknown");
    expect(r.regionHonored).toBe("yes");
  });

  it("Organic with AI Overview: overview plus organic rows", () => {
    const r = parseDataForSeo(req("google_aio", "serp_provider"), fixture("dataforseo_google_organic_live_advanced.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.citations.length).toBe(2);
    expect(r.organic?.length).toBeGreaterThan(0);
  });

  it("Organic without an AI Overview item is 'empty' (not shown), not an error", () => {
    const body = fixture("dataforseo_google_organic_live_advanced.json").response;
    const copy = JSON.parse(JSON.stringify(body));
    copy.tasks[0].result[0].items = copy.tasks[0].result[0].items.filter((i: { type: string }) => i.type !== "ai_overview");
    const r = parseDataForSeo(req("google_aio", "serp_provider"), copy, 10);
    expect(r.status).toBe("empty");
    expect(r.error).toBeUndefined();
  });

  it("LLM Responses (parametric): text, model, actual cost, no region", () => {
    const r = parseDataForSeo(req("chatgpt", "api_parametric"), fixture("dataforseo_chatgpt_llm_responses_live.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.modelBuild).toBe("gpt-4.1-mini-2025-04-14");
    expect(r.costUsd).toBeCloseTo(0.029631, 6);
    expect(r.regionHonored).toBe("no");
    expect(r.citations).toEqual([]);
  });

  it("Perplexity LLM Responses as api_search: citations and fan out, medium fidelity shape, city region not honored", () => {
    // Same documented response shape as ChatGPT LLM Responses; Perplexity uses the same fields.
    const r = parseDataForSeo(req("perplexity", "api_search"), fixture("dataforseo_chatgpt_llm_responses_live.json").response, 10);
    expect(r.status).toBe("ok");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].url).toContain("latribune.fr");
    expect(r.fanoutQueries.length).toBeGreaterThan(0);
    expect(r.regionHonored).toBe("no");
  });

  it("Perplexity api_search refuses without DATAFORSEO_PERPLEXITY_MODEL", async () => {
    let called = false;
    const a = createDataForSeoAdapter({
      env: { DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" },
      fetch: async () => ((called = true), new Response("{}")),
    });
    const r = await a.capture(req("perplexity", "api_search"));
    expect(r.status).toBe("blocked");
    expect(r.error).toContain("DATAFORSEO_PERPLEXITY_MODEL");
    expect(called).toBe(false);
  });

  it("task level error codes become error or blocked draws", () => {
    const err = parseDataForSeo(req("chatgpt", "ui_provider"), { tasks: [{ status_code: 40501, status_message: "Invalid Field" }] }, 1);
    expect(err.status).toBe("error");
    const blocked = parseDataForSeo(req("chatgpt", "ui_provider"), { tasks: [{ status_code: 40200, status_message: "Payment Required" }] }, 1);
    expect(blocked.status).toBe("blocked");
  });
});

describe("Bright Data, OpenAI, Anthropic, Perplexity, Gemini parsing (documented samples)", () => {
  it("Bright Data Perplexity record", () => {
    const records = fixture("brightdata_perplexity_records.json").response;
    const r = parseBrightDataRecords(req("perplexity", "ui_provider"), records.slice(0, 1), 10, records.slice(0, 1));
    expect(r.status).toBe("ok");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.costUsd).toBe(0.0015);
    expect(r.modelBuild).toBe("unknown");
  });

  it("OpenAI web search: text, url_citation spans, search queries", () => {
    const body = { model: "gpt-6-sol", output: fixture("openai_web_search_output.json").output, usage: { input_tokens: 1000, output_tokens: 100 } };
    const r = parseOpenAi(req("chatgpt", "api_search"), body, 10, "gpt-6-sol");
    expect(r.status).toBe("ok");
    expect(r.fanoutQueries).toEqual(["latest news about AI"]);
    expect(r.citations[0]).toMatchObject({ spanStart: 2606, spanEnd: 2758 });
    expect(r.regionHonored).toBe("unknown");
    // 1000 * $2 + 100 * $10 per MTok + 1 search at $0.01
    expect(r.costUsd).toBeCloseTo(0.003 + 0.01, 6);
  });

  it("OpenAI without usage has unknown cost", () => {
    const r = parseOpenAi(req("chatgpt", "api_search"), { output: fixture("openai_web_search_output.json").output }, 10, "gpt-6-sol");
    expect(r.costUsd).toBeNull();
    expect(r.modelBuild).toBe("requested:gpt-6-sol");
  });

  it("Anthropic web search: text, citation spans, search count, tool error handling", () => {
    const r = parseAnthropic(req("claude", "api_search"), fixture("anthropic_web_search_response.json").response, 10, "claude-sonnet-5-5");
    expect(r.status).toBe("ok");
    expect(r.fanoutQueries).toEqual(["claude shannon birth date"]);
    expect(r.citations).toHaveLength(1);
    const c = r.citations[0];
    expect(r.answerText.slice(c.spanStart!, c.spanEnd!)).toContain("April 30, 1916");
    expect(r.costUsd).toBeCloseTo((6039 * 2 + 931 * 10) / 1e6 + 0.01, 6);

    const errOnly = { content: [fixture("anthropic_web_search_error_block.json").block], usage: { input_tokens: 10, output_tokens: 0 } };
    const e = parseAnthropic(req("claude", "api_search"), errOnly, 10, "claude-sonnet-5-5");
    expect(e.status).toBe("error");
    expect(e.error).toContain("max_uses_exceeded");

    const paused = parseAnthropic(req("claude", "api_search"), { ...fixture("anthropic_web_search_response.json").response, stop_reason: "pause_turn" }, 10, "claude-sonnet-5-5");
    expect(paused.status).toBe("error");
  });

  it("Perplexity Agent API: search results, queries, text", () => {
    const r = parsePerplexity(req("perplexity", "api_search"), fixture("perplexity_agent_web_search_response.json").response, 10, "perplexity/sonar");
    expect(r.status).toBe("ok");
    expect(r.fanoutQueries).toEqual(["AI infrastructure announcements"]);
    expect(r.citations[0].url).toBe("https://example.com/news");
    expect(r.costUnits).toBe(1);
    expect(r.costUsd).toBeCloseTo((1200 * 0.25 + 300 * 2.5) / 1e6 + 0.0025, 6);
  });

  it("Gemini grounding: chunks become citations, supports give spans", () => {
    const r = parseGemini(req("gemini", "api_search"), fixture("gemini_grounding_response.json").response, 10, "gemini-3.8-flash");
    expect(r.status).toBe("ok");
    expect(r.fanoutQueries).toEqual(["weather in Chicago this weekend"]);
    expect(r.citations).toHaveLength(2);
    expect(r.citations[0]).toMatchObject({ linked: true, spanStart: 85, spanEnd: 214, domain: "google.com" });
    expect(r.modelBuild).toBe("gemini-2.0-flash");
    expect(r.regionHonored).toBe("unknown");
  });
});

describe("SerpAPI measurement draws", () => {
  it("sends no_cache=true and native location", () => {
    const p = measurementParams(req("google_aio", "serp_provider"));
    expect(p.no_cache).toBe("true");
    expect(p.location).toBe("Charlotte,North Carolina,United States");
    expect(p.gl).toBe("us");
  });

  it("recorded response with inline AI Overview: shown, one search, organic rows", async () => {
    const recorded = fixture("serpapi_google_recorded.json").response;
    const calls: string[] = [];
    const a = createSerpApiAdapter({ env: ENV, fetch: async (u) => (calls.push(u), new Response(JSON.stringify(recorded), { status: 200 })) });
    const r = await a.capture(req("google_aio", "serp_provider"));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("no_cache=true");
    expect(r.status).toBe("ok");
    expect(r.aioState).toBe("shown");
    expect(r.answerText).toContain("NC State");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.organic?.[0].domain).toBe("ncsu.edu");
    expect(r.costUnits).toBe(1);
  });

  it("page_token answer: second search, two units", async () => {
    const first = { search_parameters: {}, ai_overview: { page_token: "tok" }, organic_results: [] };
    const second = fixture("serpapi_ai_overview_recorded.json").response;
    const calls: string[] = [];
    const a = createSerpApiAdapter({
      env: ENV,
      fetch: async (u) => {
        calls.push(u);
        return new Response(JSON.stringify(calls.length === 1 ? first : second), { status: 200 });
      },
    });
    const r = await a.capture(req("google_aio", "serp_provider"));
    expect(calls[1]).toContain("engine=google_ai_overview");
    expect(calls[1]).toContain("page_token=tok");
    expect(r.status).toBe("ok");
    expect(r.costUnits).toBe(2);
  });

  it("no overview is not_shown; an out of searches error is blocked", async () => {
    const none = createSerpApiAdapter({ env: ENV, fetch: respond(200, JSON.stringify({ search_parameters: {}, organic_results: [] })) });
    expect((await none.capture(req("google_aio", "serp_provider"))).aioState).toBe("not_shown");
    const out = createSerpApiAdapter({ env: ENV, fetch: respond(200, JSON.stringify({ error: "Your account has run out of searches." })) });
    const r = await out.capture(req("google_aio", "serp_provider"));
    expect(r.status).toBe("blocked");
    expect(r.aioState).toBe("blocked");
  });
});

describe("capture never throws", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["network error", async () => Promise.reject(new TypeError("fetch failed"))],
    ["401", respond(401, "Invalid credentials")],
    ["404", respond(404, "{}")],
    ["429", respond(429, '{"error":"rate"}')],
    ["500", respond(500, "Internal error")],
    ["malformed JSON", respond(200, "{not json")],
    ["empty body", respond(200, "")],
    ["unexpected shape", respond(200, '{"hello":"world"}')],
  ];
  const routes = allRoutes();

  for (const [label, fetchImpl] of cases) {
    it(`${label}: every route returns a draw result`, async () => {
      for (const route of routes) {
        const adapter = createAdapter(route.provider, { env: ENV, fetch: fetchImpl, ...(route.provider === "brightdata" ? { sleep: async () => {} } : {}) } as never);
        const r = await adapter.capture(req(route.engine, route.runner));
        expect(["error", "blocked", "empty"], `${route.provider} ${route.engine} ${label}`).toContain(r.status);
        if (label === "401" || label === "429") expect(r.status, `${route.provider} ${route.engine}`).toBe("blocked");
      }
    });
  }

  it("missing keys give a blocked draw without a network call", async () => {
    for (const id of PROVIDER_IDS) {
      // Bright Data stays as an optional UI adapter but is no longer an approved primary route.
      const route = allRoutes().find((r) => r.provider === id) ?? (id === "brightdata" ? { engine: "perplexity" as const, runner: "ui_provider" as const, provider: "brightdata" as const } : null);
      if (!route) continue;
      let called = false;
      const a = createAdapter(id, { env: {}, fetch: async () => ((called = true), new Response("{}")) });
      const r = await a.capture(req(route.engine, route.runner));
      expect(r.status, id).toBe("blocked");
      expect(called, id).toBe(false);
      expect(a.missingConfig().length, id).toBeGreaterThan(0);
    }
  });

  it("unsupported engine and runner pairs are refused, not called", async () => {
    let called = false;
    const a = createDataForSeoAdapter({ env: ENV, fetch: async () => ((called = true), new Response("{}")) });
    expect(a.supports("claude", "ui_provider")).toBe(false);
    expect((await a.capture(req("claude", "ui_provider"))).status).toBe("error");
    expect(called).toBe(false);
  });

  it("Bright Data 202 polls a snapshot and gives up as an error draw", async () => {
    let n = 0;
    let clock = 0;
    const realNow = Date.now;
    Date.now = () => clock;
    try {
      const a = createBrightDataAdapter({
        env: ENV,
        sleep: async (ms) => {
          clock += ms;
        },
        fetch: async (u) => {
          n++;
          if (u.includes("/scrape")) return new Response(JSON.stringify({ snapshot_id: "sd_1" }), { status: 202 });
          return new Response(JSON.stringify({ status: "running" }), { status: 200 });
        },
      });
      const r = await a.capture(req("perplexity", "ui_provider"));
      expect(r.status).toBe("error");
      expect(r.error).toContain("not ready");
      expect(r.costUsd).toBeNull();
      expect(n).toBeGreaterThan(2);
    } finally {
      Date.now = realNow;
    }
  });

  it("Bright Data 202 then ready downloads the snapshot", async () => {
    const records = fixture("brightdata_perplexity_records.json").response.slice(0, 1);
    const a = createBrightDataAdapter({
      env: ENV,
      sleep: async () => {},
      fetch: async (u) => {
        if (u.includes("/scrape")) return new Response(JSON.stringify({ snapshot_id: "sd_1" }), { status: 202 });
        if (u.includes("/progress/")) return new Response(JSON.stringify({ status: "ready" }), { status: 200 });
        return new Response(JSON.stringify(records), { status: 200 });
      },
    });
    const r = await a.capture(req("perplexity", "ui_provider"));
    expect(r.status).toBe("ok");
    expect((r.raw as { snapshot_id: string }).snapshot_id).toBe("sd_1");
  });
});

describe("request shapes sent to providers", () => {
  it("OpenAI, Anthropic, Perplexity, Gemini send approximate location; models come from env", async () => {
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    const f = async (u: string, i?: RequestInit) => (seen.push({ url: u, body: JSON.parse(String(i?.body)) }), new Response("{}", { status: 200 }));
    await createOpenAiAdapter({ env: ENV, fetch: f }).capture(req("chatgpt", "api_search"));
    await createAnthropicAdapter({ env: ENV, fetch: f }).capture(req("claude", "api_search"));
    await createPerplexityAdapter({ env: ENV, fetch: f }).capture(req("perplexity", "api_search"));
    await createGeminiAdapter({ env: ENV, fetch: f }).capture(req("gemini", "api_search"));
    const [o, an, p, g] = seen;
    expect(o.body.model).toBe("gpt-6-sol");
    expect((o.body.tools as Array<Record<string, unknown>>)[0].user_location).toMatchObject({ type: "approximate", city: "Charlotte", country: "US" });
    expect(an.body.model).toBe("claude-sonnet-5-5");
    expect((an.body.tools as Array<Record<string, unknown>>)[0]).toMatchObject({ type: "web_search_20250305", name: "web_search" });
    expect(p.url).toBe("https://api.perplexity.ai/v1/agent");
    expect((p.body.tools as Array<Record<string, unknown>>)[0].user_location).toMatchObject({ city: "Charlotte", latitude: 35.2271 });
    expect(g.url).toContain("gemini-3.8-flash:generateContent");
    expect(g.body.toolConfig).toEqual({ retrievalConfig: { latLng: { latitude: 35.2271, longitude: -80.8431 } } });
  });

  it("DataForSEO sends native location for SERP and country for the LLM Scraper", async () => {
    const seen: Array<{ url: string; body: Array<Record<string, unknown>> }> = [];
    const f = async (u: string, i?: RequestInit) => (seen.push({ url: u, body: JSON.parse(String(i?.body)) }), new Response("{}", { status: 200 }));
    const a = createDataForSeoAdapter({ env: ENV, fetch: f });
    await a.capture(req("google_aio", "serp_provider"));
    await a.capture(req("chatgpt", "ui_provider"));
    await a.capture(req("chatgpt", "api_parametric"));
    expect(seen[0].url).toContain("/serp/google/organic/live/advanced");
    expect(seen[0].body[0]).toMatchObject({ location_name: "Charlotte,North Carolina,United States", load_async_ai_overview: true });
    expect(seen[1].body[0]).toMatchObject({ location_name: "United States" });
    expect(seen[2].url).toContain("/chat_gpt/llm_responses/live");
    expect(seen[2].body[0]).toMatchObject({ model_name: "gpt-4.1-mini", web_search: false });
  });

  it("parametric without a configured model is a blocked draw, not a guess", async () => {
    let called = false;
    const a = createDataForSeoAdapter({ env: { DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }, fetch: async () => ((called = true), new Response("{}")) });
    const r = await a.capture(req("claude", "api_parametric"));
    expect(r.status).toBe("blocked");
    expect(r.error).toContain("DATAFORSEO_PARAMETRIC_MODEL_CLAUDE");
    expect(called).toBe(false);
  });

  it("unknown model price gives an unknown estimate", () => {
    const a = createOpenAiAdapter({ env: { ...ENV, OPENAI_SEARCH_MODEL: "some-new-model" } });
    expect(a.estimate(req("chatgpt", "api_search")).usd).toBeNull();
  });
});

describe("regions and parity", () => {
  it("region honored rules", () => {
    expect(regionHonored(CLT, "city", "native")).toBe("yes");
    expect(regionHonored(CLT, "country", "native")).toBe("no");
    expect(regionHonored(CLT, "city", "approximate")).toBe("unknown");
    expect(regionHonored(CLT, "none", "approximate")).toBe("no");
    expect(regionHonored({ ...CLT, city: null, state: null }, "country", "native")).toBe("yes");
  });

  it("parity report gate: missing, failed, stale, fresh", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const env = { LOCAL_SERP_PARITY_REPORT: "/x/parity-report.md" };
    expect(parityStatus(env, now, () => { throw new Error("ENOENT"); }).passed).toBe(false);
    expect(parityStatus(env, now, () => "Result: FAIL\nDate: 2026-11-01").reason).toContain("PASS");
    const stale = parityStatus(env, now, () => "Result: PASS\nDate: 2026-09-01");
    expect(stale.passed && !stale.fresh).toBe(true);
    const ok = parityStatus(env, now, () => "# Parity\nResult: PASS\nDate: 2026-10-20\n");
    expect(ok.passed && ok.fresh).toBe(true);
  });
});

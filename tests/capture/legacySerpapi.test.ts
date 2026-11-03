import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStore, hashParams } from "@/lib/db";
import { aioMeasurementParams, fetchAioForPrompt } from "@/lib/serpapi";
import { resetDatabase } from "../helpers";

const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/capture/serpapi_google_recorded.json"), "utf8")).response;

describe("legacy SerpAPI AI Overview: repeated draws are real captures", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.SERPAPI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SERPAPI_API_KEY;
  });

  it("the draw index is in the cache key but never sent to SerpAPI", () => {
    expect(hashParams(aioMeasurementParams("q", 1))).not.toBe(hashParams(aioMeasurementParams("q", 2)));
    expect(aioMeasurementParams("q", 1).no_cache).toBe("true");
  });

  it("two fetches of one prompt make two calls with no_cache=true and store draws 1 and 2", async () => {
    const store = getStore();
    await store.saveConfig({ serpapi_credits_remaining: 10, serpapi_per_run_cap: 10 });
    const prompt = await store.createPrompt({ text: "power systems engineering in North Carolina", audience: "undergrad", subtopics: [] });
    const urls: string[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      n++;
      const body = { ...recorded, ai_overview: { ...recorded.ai_overview, text_blocks: [{ type: "paragraph", snippet: `Answer ${n} mentions UNC Charlotte.` }] } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const a = await fetchAioForPrompt(prompt.id);
    const b = await fetchAioForPrompt(prompt.id);
    expect(a.ok && b.ok).toBe(true);
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).toContain("no_cache=true");
      expect(u).not.toContain("_draw_index");
    }
    const rows = await store.listResponses({ prompt_id: prompt.id, surface: "google_aio" });
    expect(rows.map((r) => r.run_number).sort()).toEqual([1, 2]);
    expect(new Set(rows.map((r) => r.raw_text)).size).toBe(2);
    expect((await store.getConfig()).serpapi_credits_remaining).toBe(8);
  });
});

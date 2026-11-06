import { describe, expect, it } from "vitest";
import { buildGapCohorts, lostPromptsForSeries } from "@/lib/gaps/cohort";
import type { MetricDraw } from "@/lib/metrics/load";
import { isPromptWon } from "@/lib/metrics/stats";

const BRAND = "brand-1";
let n = 0;

function draw(o: {
  prompt: string;
  brand?: boolean;
  engine?: MetricDraw["engine"];
  runner?: MetricDraw["runner"];
  branded?: boolean;
}): MetricDraw {
  return {
    drawId: `d${++n}`,
    promptId: o.prompt,
    engine: o.engine ?? "chatgpt",
    runner: o.runner ?? "api_search",
    provider: "fixture",
    regionId: "r1",
    regionHonored: "yes",
    personaId: null,
    branded: o.branded ?? false,
    mentions: o.brand
      ? [{ entityType: "brand", entityId: BRAND, spanStart: 0, listPosition: null }]
      : [],
    citations: [],
    claims: [],
  };
}

describe("gap lost cohort", () => {
  it("marks lost when brand mentions are below ceil(valid/2); n=3 needs fewer than 2", () => {
    // 1 of 3 mentions → lost; 2 of 3 → won
    const draws = [
      draw({ prompt: "lost-1", brand: true }),
      draw({ prompt: "lost-1", brand: false }),
      draw({ prompt: "lost-1", brand: false }),
      draw({ prompt: "won-1", brand: true }),
      draw({ prompt: "won-1", brand: true }),
      draw({ prompt: "won-1", brand: false }),
    ];
    expect(isPromptWon(1, 3)).toBe(false);
    expect(isPromptWon(2, 3)).toBe(true);

    const [series] = buildGapCohorts(draws);
    expect(series.key).toEqual({ engine: "chatgpt", runner: "api_search" });
    expect(series.lost.map((p) => p.promptId)).toEqual(["lost-1"]);
    expect(series.won.map((p) => p.promptId)).toEqual(["won-1"]);
    expect(series.lost[0]).toMatchObject({ mentions: 1, validDraws: 3, won: false });
    expect(series.lostDrawIds).toHaveLength(3);
  });

  it("excludes branded prompts from gap cohorts", () => {
    const draws = [
      draw({ prompt: "branded", brand: false, branded: true }),
      draw({ prompt: "branded", brand: false, branded: true }),
      draw({ prompt: "branded", brand: false, branded: true }),
      draw({ prompt: "cat", brand: false }),
      draw({ prompt: "cat", brand: false }),
      draw({ prompt: "cat", brand: false }),
    ];
    const cohorts = buildGapCohorts(draws);
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0].lost.map((p) => p.promptId)).toEqual(["cat"]);
    expect(cohorts[0].won).toEqual([]);
  });

  it("never pools runners or engines into one series", () => {
    const draws = [
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "api_search" }),
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "api_search" }),
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "api_search" }),
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "ui_provider" }),
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "ui_provider" }),
      draw({ prompt: "p", brand: false, engine: "chatgpt", runner: "ui_provider" }),
      draw({ prompt: "p", brand: false, engine: "gemini", runner: "api_search" }),
      draw({ prompt: "p", brand: false, engine: "gemini", runner: "api_search" }),
      draw({ prompt: "p", brand: false, engine: "gemini", runner: "api_search" }),
    ];
    const cohorts = buildGapCohorts(draws);
    expect(cohorts.map((c) => `${c.key.engine}|${c.key.runner}`).sort()).toEqual([
      "chatgpt|api_search",
      "chatgpt|ui_provider",
      "gemini|api_search",
    ]);
    for (const c of cohorts) {
      expect(c.lost).toHaveLength(1);
      expect(c.lost[0].validDraws).toBe(3);
    }
  });

  it("lostPromptsForSeries returns only that engine×runner", () => {
    const draws = [
      ...[0, 1, 2].map(() => draw({ prompt: "a", brand: false, runner: "api_search" })),
      ...[0, 1, 2].map(() => draw({ prompt: "b", brand: false, runner: "ui_provider" })),
    ];
    expect(lostPromptsForSeries(draws, "chatgpt", "api_search").map((p) => p.promptId)).toEqual(["a"]);
    expect(lostPromptsForSeries(draws, "chatgpt", "ui_provider").map((p) => p.promptId)).toEqual(["b"]);
    expect(lostPromptsForSeries(draws, "perplexity", "api_search")).toEqual([]);
  });
});

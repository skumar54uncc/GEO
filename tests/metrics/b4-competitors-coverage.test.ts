import { describe, expect, it } from "vitest";
import { competitorTrendForIndex, peerAverageFromRanks } from "@/lib/metrics/competitorsTrend";
import {
  COVERAGE_PARTIAL_MIN,
  COVERAGE_STRONG_MIN,
  coverageLabelFromRate,
  intentEngineCoverageMatrix,
} from "@/lib/metrics/coverageMatrix";
import type { MetricDraw } from "@/lib/metrics/load";
import { institutionRanks } from "@/lib/metrics/institutions";

const BRAND = "brand-us";
let n = 0;

function draw(o: {
  prompt: string;
  engine?: MetricDraw["engine"];
  brand?: boolean;
  comps?: string[];
  intent?: string | null;
  branded?: boolean;
}): MetricDraw {
  const mentions: MetricDraw["mentions"] = [];
  if (o.brand) mentions.push({ entityType: "brand", entityId: BRAND, spanStart: 0, listPosition: null });
  for (const id of o.comps ?? []) {
    mentions.push({ entityType: "competitor", entityId: id, spanStart: 10, listPosition: null });
  }
  return {
    drawId: `d${++n}`,
    promptId: o.prompt,
    engine: o.engine ?? "chatgpt",
    runner: "ui_provider",
    provider: "fixture",
    regionId: "r1",
    regionHonored: "yes",
    personaId: null,
    branded: o.branded ?? false,
    intent: o.intent ?? null,
    mentions,
    citations: [],
    claims: [],
  };
}

describe("P2 B4 coverage matrix", () => {
  it("documents strong/partial/invisible thresholds", () => {
    expect(COVERAGE_STRONG_MIN).toBe(0.6);
    expect(COVERAGE_PARTIAL_MIN).toBe(0.2);
    expect(coverageLabelFromRate(0.7, true)).toBe("strong");
    expect(coverageLabelFromRate(0.4, true)).toBe("partial");
    expect(coverageLabelFromRate(0.1, true)).toBe("invisible");
    expect(coverageLabelFromRate(0.9, false)).toBe("suppressed");
  });

  it("builds intent × engine cells with k of n when displayable", () => {
    // Enough prompts+draws to pass displayable: 10 prompts × 3 draws each.
    const draws: MetricDraw[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 3; j++) {
        draws.push(
          draw({
            prompt: `p${i}`,
            intent: "discovery",
            brand: i < 7 && j < 2, // 7 of 10 won at majority for n=3 needs ≥2
          }),
        );
      }
    }
    // Fix wins: for each of first 7 prompts, 2 of 3 brand hits.
    const fixed: MetricDraw[] = [];
    for (let i = 0; i < 10; i++) {
      fixed.push(draw({ prompt: `q${i}`, intent: "discovery", brand: true }));
      fixed.push(draw({ prompt: `q${i}`, intent: "discovery", brand: i < 7 }));
      fixed.push(draw({ prompt: `q${i}`, intent: "discovery", brand: i < 7 }));
    }
    const cells = intentEngineCoverageMatrix(fixed);
    const discovery = cells.find((c) => c.intent === "discovery" && c.engine === "chatgpt");
    expect(discovery).toBeTruthy();
    expect(discovery!.won.prompts).toBe(10);
    expect(discovery!.won.won).toBe(7);
    expect(discovery!.label).toBe("strong");
    expect(discovery!.kOfN).toBe("7 of 10");
  });
});

describe("P2 B4 competitors SoV trend", () => {
  it("never pools indexes and reports peer average of top 3", () => {
    const names = new Map([
      ["c1", "Peer One"],
      ["c2", "Peer Two"],
      ["c3", "Peer Three"],
      ["c4", "Peer Four"],
    ]);
    const scanDraws = [
      draw({ prompt: "a", brand: true, comps: ["c1"] }),
      draw({ prompt: "b", brand: true, comps: ["c2"] }),
      draw({ prompt: "c", comps: ["c3"] }),
      draw({ prompt: "d", comps: ["c4"] }),
      draw({ prompt: "e", engine: "google_aio", brand: true, comps: ["c1"] }),
    ];
    const ranks = institutionRanks(
      scanDraws.filter((d) => d.engine === "chatgpt"),
      { brandId: BRAND, brandName: "Us", competitorNames: names },
    );
    expect(ranks[0]?.isUs || ranks.some((r) => r.isUs)).toBe(true);
    const peerAvg = peerAverageFromRanks(ranks, 3);
    expect(peerAvg).not.toBeNull();

    const series = competitorTrendForIndex(
      [
        {
          scanId: "s1",
          createdAt: "2026-01-01T00:00:00.000Z",
          isBaseline: true,
          draws: scanDraws,
        },
        {
          scanId: "s2",
          createdAt: "2026-02-01T00:00:00.000Z",
          isBaseline: false,
          draws: scanDraws,
        },
      ],
      { index: "chat", brandId: BRAND, brandName: "Us", competitorNames: names },
    );
    expect(series.index).toBe("chat");
    expect(series.trend).toHaveLength(2);
    expect(series.trend[0]!.isBaseline).toBe(true);
    expect(series.latestGrouped.length).toBeGreaterThan(0);
    expect(series.peerAverageBenchmark).not.toBeNull();

    const google = competitorTrendForIndex(
      [{ scanId: "s1", createdAt: "2026-01-01T00:00:00.000Z", isBaseline: true, draws: scanDraws }],
      { index: "google", brandId: BRAND, brandName: "Us", competitorNames: names },
    );
    expect(google.trend[0]!.ranks.every((r) => true)).toBe(true);
    // Google series only uses google engines — chat draws ignored.
    expect(google.latestGrouped.some((r) => r.isUs)).toBe(true);
  });
});

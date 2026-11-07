import { describe, expect, it } from "vitest";
import { visibilityColumnsFromTrend } from "@/lib/metrics/visibilityChart";

describe("visibility chart columns", () => {
  it("marks suppressed columns and uses reduced height vs max shown rate", () => {
    const trend = [
      {
        scanId: "a",
        createdAt: "2026-01-01T00:00:00.000Z",
        series: [
          {
            engine: "chatgpt",
            runner: "api_search",
            promptsWon: {
              won: 5,
              prompts: 5,
              rate: 0.6,
              ciLow: 0.2,
              ciHigh: 0.9,
              draws: 20,
              tooFewDraws: true,
              tooFewPrompts: false,
            },
          },
        ],
      },
      {
        scanId: "b",
        createdAt: "2026-02-01T00:00:00.000Z",
        series: [
          {
            engine: "chatgpt",
            runner: "api_search",
            promptsWon: {
              won: 20,
              prompts: 20,
              rate: 0.5,
              ciLow: 0.3,
              ciHigh: 0.65,
              draws: 100,
              tooFewDraws: false,
              tooFewPrompts: false,
            },
          },
        ],
      },
    ];
    const cols = visibilityColumnsFromTrend(trend, "chatgpt", "api_search");
    expect(cols).toHaveLength(2);
    expect(cols[0].suppressed).toBe(true);
    expect(cols[0].suppressionMessage).toMatch(/^Too few prompts/);
    expect(cols[1].suppressed).toBe(false);
    expect(cols[1].height).toBe(0.5);
    expect(cols[0].height).toBeLessThan(cols[1].height);
    expect(cols[0].height).toBeCloseTo(0.4 * 0.5, 5);
  });
});

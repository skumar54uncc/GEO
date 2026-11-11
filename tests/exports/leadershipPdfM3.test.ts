import { describe, expect, it } from "vitest";
import { leadershipPdfBlocks, leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { extractPdfStrings } from "@/lib/exports/simplePdf";

const sample = {
  organization: { name: "Demo University", isDemo: true as const },
  campaign: { name: "Energy", topic: "Energy research" },
  headline: {
    engine: "chatgpt",
    runner: "ui_provider",
    won: 17,
    prompts: 30,
    rate: 0.57,
    ciLow: 0.39,
    ciHigh: 0.73,
    draws: 90,
  },
  trendLabel: "within noise",
  previousScanDate: "2026-01-01",
  engines: [
    {
      engine: "chatgpt",
      runner: "ui_provider",
      won: 17,
      prompts: 30,
      rate: 0.57,
      ciLow: 0.39,
      ciHigh: 0.73,
      draws: 90,
    },
    {
      engine: "claude",
      runner: "api_search",
      won: 12,
      prompts: 30,
      rate: 0.4,
      ciLow: 0.25,
      ciHigh: 0.55,
      draws: 90,
    },
  ],
  analystNote: {
    text: "Chat engines held steady this cycle for Energy. Citation coverage on owned domains remains the clearest gap. Leadership should treat the first frozen-set scan as Baseline when reading the trend.",
    authorName: "Editor",
    at: "2026-11-09T00:00:00.000Z",
    status: "published" as const,
  },
  baselineDate: "2026-01-15",
  target: { metric: "prompts_won" as const, engine: "chatgpt", value: 0.55, date: "2026-12-01" },
  latestScan: { createdAt: "2026-01-15T00:00:00.000Z", isBaseline: true },
};

describe("M3: leadership PDF layout and copy", () => {
  it("has no em dashes, keeps byline with note, units once under Engines, trend names prior date", () => {
    const blocks = leadershipPdfBlocks(sample);
    const note = blocks.find((b) => b.title === "Analyst note");
    expect(note?.keepTogether).toBe(true);
    expect(note?.lines.some((l) => l.includes("Editor"))).toBe(true);

    const enginesIdx = blocks.findIndex((b) => b.title === "Engines");
    expect(enginesIdx).toBeGreaterThanOrEqual(0);
    expect(blocks[enginesIdx]!.lines[0]).toBe("30 prompts, 3 answers each");

    const text = extractPdfStrings(leadershipPdfBytes(sample));
    const flat = text.replace(/\n/g, " ");
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/ - /);
    expect(flat).toContain("These are never averaged together.");
    expect(flat).toContain("Target: 55% of prompts won on ChatGPT by 2026-12-01.");
    expect(flat).toContain(
      "Demo University won 17 of 30 prompts on ChatGPT (captured from the consumer app), 57%. Likely range: 39% to 73%.",
    );
    // Standalone fidelity line under Headline is gone (only appears in the headline sentence / engine rows).
    const afterHeadline = text.split("Headline\n")[1] ?? "";
    const headlineBlock = afterHeadline.split("\nEngines")[0] ?? "";
    expect(headlineBlock.split("\n").some((l) => l.trim() === "Captured from the consumer app")).toBe(false);
    expect(flat).toContain("Trend compared with 2026-01-01: within noise");
    expect(text).toContain("Scout");
    // Units phrase once (Engines intro), not repeated on every engine line / headline
    const unitHits = text.split("30 prompts, 3 answers each").length - 1;
    expect(unitHits).toBe(1);
  });
});

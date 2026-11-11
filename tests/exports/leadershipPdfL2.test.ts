import { describe, expect, it } from "vitest";
import { WON_DEFINITION, assertAnalystNoteFitsTrend, analystNoteAllowedForPdf } from "@/lib/exports/leadershipLabels";
import { leadershipPdfBytes, leadershipPdfBlocks } from "@/lib/exports/leadershipPdf";
import { extractPdfStrings } from "@/lib/exports/simplePdf";

const base = {
  organization: { name: "Demo University", isDemo: true as const },
  campaign: { name: "Energy", topic: "Energy research" },
  headline: {
    engine: "chatgpt",
    runner: "ui_provider" as const,
    won: 17,
    prompts: 30,
    rate: 0.57,
    ciLow: 0.39,
    ciHigh: 0.73,
    draws: 90,
  },
  trendLabel: "within noise" as string | null,
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
  includeAccuracy: false,
};

describe("L2: leadership PDF readability", () => {
  it("headline names won count, likely range, and METRICS won definition", () => {
    const text = extractPdfStrings(leadershipPdfBytes(base));
    expect(text).toContain("won 17 of 30 prompts on ChatGPT (57%)");
    expect(text).toContain("Likely range: 39% to 73%");
    // Definition may wrap across PDF lines; compare flattened text.
    expect(text.replace(/\n/g, " ")).toContain(WON_DEFINITION);
    expect(text).toContain("30 prompts, 3 answers each");
  });

  it("engine rows show x of N prompts, range, fidelity, and omit n=90 as prompt count", () => {
    const text = extractPdfStrings(leadershipPdfBytes(base));
    expect(text).toContain("17 of 30 prompts");
    expect(text).toContain("12 of 30 prompts");
    expect(text).toContain("API with web search (medium fidelity)");
    expect(text).not.toMatch(/\bn=90\b/);
  });

  it("rejects direction words when trend is within noise; draft notes stay out of the PDF", () => {
    expect(() =>
      assertAnalystNoteFitsTrend("Share of voice improved slightly on ChatGPT.", "within noise"),
    ).toThrow(/within noise/);
    expect(analystNoteAllowedForPdf("Share of voice improved slightly on ChatGPT.", "within noise", "published")).toBe(
      false,
    );
    expect(analystNoteAllowedForPdf("Held steady. Gap remains. Treat Baseline carefully.", "within noise", "draft")).toBe(
      false,
    );

    const withBadNote = leadershipPdfBytes({
      ...base,
      analystNote: {
        text: "Share of voice improved slightly on ChatGPT. Gap remains. Treat Baseline carefully.",
        authorName: "Editor",
        at: "2026-11-09T00:00:00.000Z",
        status: "published",
      },
    });
    expect(extractPdfStrings(withBadNote)).not.toContain("improved");

    const withDraft = leadershipPdfBytes({
      ...base,
      analystNote: {
        text: "Held steady. Gap remains. Treat Baseline carefully.",
        authorName: "Writer",
        at: "2026-11-09T00:00:00.000Z",
        status: "draft",
      },
    });
    expect(extractPdfStrings(withDraft)).not.toContain("Held steady");
  });

  it("leaves accuracy out until hand check; methodology box is present", () => {
    const text = extractPdfStrings(leadershipPdfBytes({ ...base, includeAccuracy: false, accuracyLine: "Accuracy 92%" }));
    expect(text).not.toContain("Accuracy 92%");
    expect(text).not.toMatch(/\bAccuracy\b/);
    expect(text).toContain("How we measure");
    expect(text).toContain("3 answers per prompt");
    expect(text).toContain("true rate is probably in this range");
  });

  it("too few prompts and empty UNC Charlotte show displayable messages", () => {
    const few = extractPdfStrings(
      leadershipPdfBytes({
        ...base,
        organization: { name: "UNC Charlotte", isDemo: false },
        headline: { ...base.headline, won: 2, prompts: 5, draws: 15 },
        engines: [{ ...base.engines[0]!, won: 2, prompts: 5, draws: 15 }],
      }),
    );
    expect(few).toContain("Too few prompts");

    const empty = extractPdfStrings(
      leadershipPdfBytes({
        ...base,
        organization: { name: "UNC Charlotte", isDemo: false },
        noMeasurementsYet: true,
        headline: null,
        engines: [],
        analystNote: null,
      }),
    );
    expect(empty).toContain("No measurements yet");
    expect(empty).not.toContain("Demo University");
  });

  it("every number in the PDF matches the dashboard-shaped input for the same scan", () => {
    const blocks = leadershipPdfBlocks(base);
    const text = extractPdfStrings(leadershipPdfBytes(base));
    // Headline / engines mirror dashboard cell fields
    expect(base.headline.won).toBe(17);
    expect(base.headline.prompts).toBe(30);
    expect(Math.round(base.headline.rate! * 100)).toBe(57);
    expect(Math.round(base.headline.ciLow! * 100)).toBe(39);
    expect(Math.round(base.headline.ciHigh! * 100)).toBe(73);
    expect(text).toContain("17");
    expect(text).toContain("30");
    expect(text).toContain("57%");
    expect(text).toContain("39% to 73%");
    expect(text).toContain("12");
    expect(text).toContain("40%");
    expect(text).toContain("25% to 55%");
    // Block bar rates equal input (dashboard API values)
    const bars = blocks.filter((b) => b.bar);
    expect(bars[0]?.bar?.rate).toBe(base.headline.rate);
    expect(bars[0]?.bar?.ciLow).toBe(base.headline.ciLow);
    expect(bars[0]?.bar?.ciHigh).toBe(base.headline.ciHigh);
    expect(bars[1]?.bar?.rate).toBe(base.engines[0]!.rate);
    expect(bars[2]?.bar?.rate).toBe(base.engines[1]!.rate);
  });

  it("brands Scout, Charlotte Green headings path, footer date and pages", () => {
    const text = extractPdfStrings(leadershipPdfBytes(base));
    expect(text).toContain("Scout");
    expect(text).toMatch(/Page 1 of \d+/);
    expect(text).toMatch(/Scout · \d{4}-\d{2}-\d{2}/);
  });
});

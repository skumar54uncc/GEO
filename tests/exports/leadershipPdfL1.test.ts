import { describe, expect, it } from "vitest";
import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import { DEMO_PDF_BANNER } from "@/lib/exports/leadershipLabels";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { extractPdfStrings } from "@/lib/exports/simplePdf";

describe("L1: leadership PDF encoding and labels", () => {
  it("extracted text has no mojibake, uses to for CI, embeds no localhost, uses plain labels", () => {
    const bytes = leadershipPdfBytes({
      organization: { name: "Demo University", isDemo: true },
      campaign: { name: "Energy", topic: "Energy research" },
      headline: {
        engine: "chatgpt",
        runner: "api_search",
        won: 17,
        prompts: 30,
        rate: 0.57,
        ciLow: 0.39,
        ciHigh: 0.73,
        draws: 90,
      },
      trendLabel: "within noise",
      engines: [
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
        status: "published",
      },
      baselineDate: "2026-01-15",
      target: { metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" },
      latestScan: { createdAt: "2026-01-15T00:00:00.000Z", isBaseline: true },
    });

    const text = extractPdfStrings(bytes);
    expect(text).not.toMatch(/[´Ã�]/);
    expect(text).toContain("39% to 73%");
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("localhost");
    expect(text).toContain(DEMO_DATA_BANNER);
    expect(text).toContain(DEMO_PDF_BANNER);
    expect(DEMO_DATA_BANNER.length).toBeGreaterThan(10);
    expect(text).toContain("ChatGPT");
    expect(text).toContain("API with web search (medium fidelity)");
    expect(text).toContain("Claude");
    expect(text).not.toContain("api_search");
    expect(text).not.toContain("prompts_won");
    expect(text).not.toContain("P1d PDF");
    expect(text).toContain("2026-01-15");
    expect(text).toContain("How we measure");
    // No raw UUID-shaped scan ids
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

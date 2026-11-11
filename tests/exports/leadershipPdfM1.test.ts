import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/capture/registry";
import type { Engine } from "@/lib/capture/types";
import { fidelityLabel } from "@/lib/exports/leadershipLabels";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import {
  filterPrimaryEngineCells,
  leadershipPdfInputFromCells,
} from "@/lib/exports/leadershipPdfInput";
import { extractPdfStrings } from "@/lib/exports/simplePdf";

describe("M1: leadership PDF fidelity follows ROUTES primary", () => {
  it("PDF fidelity label equals ROUTES[engine].primary.runner for every engine; calibration/parametric never listed", () => {
    const cells = (Object.keys(ROUTES) as Engine[]).flatMap((engine) => {
      const primary = ROUTES[engine].primary;
      const extras = [
        ROUTES[engine].fallback,
        ROUTES[engine].parametric,
      ].filter(Boolean) as Array<{ engine: Engine; runner: string }>;
      return [
        {
          engine,
          runner: primary.runner,
          won: 10,
          prompts: 30,
          rate: 0.33,
          ciLow: 0.2,
          ciHigh: 0.5,
          draws: 90,
        },
        ...extras.map((r) => ({
          engine: r.engine,
          runner: r.runner,
          won: 1,
          prompts: 30,
          rate: 0.03,
          ciLow: 0.01,
          ciHigh: 0.1,
          draws: 90,
        })),
      ];
    });

    const primaryOnly = filterPrimaryEngineCells(cells);
    expect(primaryOnly.every((c) => c.runner === ROUTES[c.engine as Engine].primary.runner)).toBe(true);
    expect(primaryOnly.some((c) => c.runner === "api_parametric")).toBe(false);
    // chatgpt/gemini primary is ui_provider, not api_search
    expect(primaryOnly.find((c) => c.engine === "chatgpt")?.runner).toBe("ui_provider");
    expect(primaryOnly.find((c) => c.engine === "gemini")?.runner).toBe("ui_provider");

    const input = leadershipPdfInputFromCells({
      organization: { name: "Demo University", isDemo: true },
      campaign: { name: "Energy", topic: "Energy research" },
      cells,
      target: { metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" },
      trendLabel: "within noise",
      previousScanDate: "2026-01-01",
      analystNote: null,
      baselineDate: "2026-01-15",
      latestScan: { createdAt: "2026-01-15T00:00:00.000Z", isBaseline: true },
    });

    expect(input.engines.every((e) => e.runner === ROUTES[e.engine as Engine].primary.runner)).toBe(true);
    const text = extractPdfStrings(leadershipPdfBytes(input));
    for (const e of input.engines) {
      expect(text).toContain(fidelityLabel(ROUTES[e.engine as Engine].primary.runner));
    }
    // ChatGPT / Gemini primary lines must show consumer-app fidelity, not API search
    expect(text).toContain("Captured from the consumer app");
    const chatgptLine = text.split("\n").find((l) => l.startsWith("ChatGPT:")) ?? "";
    const geminiLine = text.split("\n").find((l) => l.startsWith("Gemini:")) ?? "";
    expect(chatgptLine).toContain("Captured from the consumer app");
    expect(chatgptLine).not.toContain("API with web search");
    expect(geminiLine).toContain("Captured from the consumer app");
    expect(geminiLine).not.toContain("API with web search");
  });
});


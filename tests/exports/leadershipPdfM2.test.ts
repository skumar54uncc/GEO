import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/capture/registry";
import { pickHeadlineCell, leadershipPdfInputFromCells } from "@/lib/exports/leadershipPdfInput";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { extractPdfStrings } from "@/lib/exports/simplePdf";

describe("M2: headline is target engine primary series", () => {
  it("picks target.engine + ROUTES primary runner, not cells[0]", () => {
    const cells = [
      {
        engine: "claude",
        runner: ROUTES.claude.primary.runner,
        won: 20,
        prompts: 30,
        rate: 0.67,
        ciLow: 0.5,
        ciHigh: 0.8,
        draws: 90,
      },
      {
        engine: "chatgpt",
        runner: ROUTES.chatgpt.primary.runner,
        won: 17,
        prompts: 30,
        rate: 0.57,
        ciLow: 0.39,
        ciHigh: 0.73,
        draws: 90,
      },
      {
        engine: "chatgpt",
        runner: "api_parametric",
        won: 5,
        prompts: 30,
        rate: 0.17,
        ciLow: 0.1,
        ciHigh: 0.3,
        draws: 90,
      },
    ];
    const target = { metric: "prompts_won" as const, engine: "chatgpt", value: 0.55, date: "2026-12-01" };
    const headline = pickHeadlineCell(cells, target);
    expect(headline?.engine).toBe("chatgpt");
    expect(headline?.runner).toBe(ROUTES.chatgpt.primary.runner);
    expect(headline?.won).toBe(17);
    expect(headline).not.toEqual(cells[0]);

    const input = leadershipPdfInputFromCells({
      organization: { name: "Demo University", isDemo: true },
      campaign: { name: "Energy", topic: "Energy" },
      cells,
      target,
      trendLabel: "within noise",
      previousScanDate: "2026-01-01",
      analystNote: null,
      baselineDate: "2026-01-15",
      latestScan: { createdAt: "2026-01-15T00:00:00.000Z", isBaseline: true },
    });
    expect(input.headline?.engine).toBe("chatgpt");
    expect(input.headline?.runner).toBe("ui_provider");
    const text = extractPdfStrings(leadershipPdfBytes(input));
    expect(text).toContain("won 17 of 30 prompts on ChatGPT (captured from the consumer app), 57%");
    expect(text).not.toContain("won 20 of 30 prompts on Claude");
  });
});

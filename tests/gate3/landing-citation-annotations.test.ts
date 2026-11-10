import { describe, expect, it } from "vitest";
import { defaultLandingPath } from "@/lib/auth/landing";
import { annotationKindLabel, ANNOTATION_KINDS } from "@/lib/annotations";
import { noAuditBannerMessage } from "@/lib/site/auditStatus";
import { visibilityColumnsFromTrend } from "@/lib/metrics/visibilityChart";
import { headlineCitationRates } from "@/lib/metrics/rollup";
import type { MetricDraw } from "@/lib/metrics/load";

describe("Gate 3 landing + audit banner", () => {
  it("routes viewers to Overview and editors to Visibility", () => {
    expect(defaultLandingPath("viewer")).toBe("/");
    expect(defaultLandingPath("editor", { campaignId: "c1" })).toBe("/campaigns/c1/dashboard");
    expect(defaultLandingPath("admin", { adminHome: "overview" })).toBe("/");
    expect(defaultLandingPath("admin", { adminHome: "visibility", campaignId: "c1" })).toBe(
      "/campaigns/c1/dashboard",
    );
  });

  it("exposes soft no-audit banner copy with audit link intent", () => {
    expect(noAuditBannerMessage()).toMatch(/no site audit/i);
  });
});

describe("Gate 3 citation-rate trend", () => {
  it("builds citation rate series and applies displayable rule", () => {
    const draws: MetricDraw[] = [
      {
        drawId: "d1",
        promptId: "p1",
        engine: "chatgpt",
        runner: "ui_provider",
        provider: "dataforseo",
        regionId: "r1",
        regionHonored: "yes",
        personaId: null,
        branded: false,
        intent: "discovery",
        mentions: [],
        citations: [{ domain: "charlotte.edu", sourceClass: "owned" }],
        claims: [],
      },
      {
        drawId: "d2",
        promptId: "p1",
        engine: "chatgpt",
        runner: "ui_provider",
        provider: "dataforseo",
        regionId: "r1",
        regionHonored: "yes",
        personaId: null,
        branded: false,
        intent: "discovery",
        mentions: [],
        citations: [{ domain: "other.edu", sourceClass: "editorial" }],
        claims: [],
      },
    ];
    const rates = headlineCitationRates(draws, ["charlotte.edu"]);
    expect(rates).toHaveLength(1);
    expect(rates[0]!.citationRate.numerator).toBe(1);
    expect(rates[0]!.citationRate.n).toBe(2);

    const cols = visibilityColumnsFromTrend(
      [
        {
          scanId: "s1",
          createdAt: "2026-11-01T00:00:00.000Z",
          series: [
            {
              engine: "chatgpt",
              runner: "ui_provider",
              promptsWon: {
                won: 0,
                prompts: 1,
                rate: 0,
                ciLow: 0,
                ciHigh: 1,
                draws: 2,
                tooFewDraws: true,
                tooFewPrompts: true,
              },
              citationRate: rates[0]!.citationRate,
            },
          ],
        },
      ],
      "chatgpt",
      "ui_provider",
      "citation_rate",
    );
    expect(cols).toHaveLength(1);
    expect(cols[0]!.suppressed).toBe(true);
  });
});

describe("Gate 3 annotation kinds", () => {
  it("covers press release, campaign launch, content launch", () => {
    expect(ANNOTATION_KINDS).toEqual(["press_release", "campaign_launch", "content_launch"]);
    expect(annotationKindLabel.press_release).toMatch(/Press/i);
  });
});

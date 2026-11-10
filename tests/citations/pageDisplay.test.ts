import { describe, expect, it } from "vitest";
import {
  citedPageFreshnessLabel,
  FEATURES_DETECTED_LABEL,
  FEATURES_DETECTED_TOOLTIP,
  featureFlagsSummary,
} from "@/lib/citations/pageDisplay";

describe("cited page freshness and features", () => {
  it("uses published/modified dates and never fetched_at; no date → unknown", () => {
    expect(
      citedPageFreshnessLabel({
        publishedAt: null,
        updatedAt: null,
        fetchedAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toEqual({ label: "unknown", source: "unknown" });

    expect(
      citedPageFreshnessLabel({
        publishedAt: "2025-09-01T00:00:00Z",
        updatedAt: null,
        fetchedAt: "2026-11-01T00:00:00Z",
      }),
    ).toEqual({ label: "2025-09-01", source: "published" });

    expect(
      citedPageFreshnessLabel({
        publishedAt: "2025-09-01T00:00:00Z",
        updatedAt: "2026-01-15T00:00:00Z",
        fetchedAt: "2026-11-01T00:00:00Z",
      }),
    ).toEqual({ label: "2026-01-15", source: "updated" });
  });

  it("labels features as detected automatically with a how tooltip", () => {
    expect(FEATURES_DETECTED_LABEL).toBe("detected automatically");
    expect(FEATURES_DETECTED_TOOLTIP.toLowerCase()).toMatch(/html/);
    expect(
      featureFlagsSummary({
        listicle: true,
        answerCapsule: true,
        statisticsCount: 2,
        namedQuotes: 1,
      }),
    ).toEqual(["listicle", "answer capsule", "statistics×2", "named quotes×1"]);
  });
});

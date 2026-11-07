import { describe, expect, it } from "vitest";
import { accuracyKpiBadge, kpiStatusFromComparison } from "@/lib/ui/kpiStatus";

describe("kpiStatusFromComparison", () => {
  it("does not apply positive delta styling for within-noise", () => {
    const s = kpiStatusFromComparison("within noise");
    expect(s.tone).toBe("noise");
    expect(s.showPositiveDelta).toBe(false);
    expect(s.label).toContain("within noise");
  });

  it("allows gain tone only for significant improvement", () => {
    const s = kpiStatusFromComparison("significant improvement");
    expect(s.tone).toBe("gain");
    expect(s.label).toBe("significant");
    expect(s.showPositiveDelta).toBe(true);
  });

  it("maps significant decline to significant without Needs review", () => {
    const s = kpiStatusFromComparison("significant decline");
    expect(s.tone).toBe("decline");
    expect(s.label).toBe("significant");
    expect(s.label).not.toMatch(/Needs review/i);
  });

  it("uses No previous scan when label missing", () => {
    expect(kpiStatusFromComparison(null).label).toBe("No previous scan");
    expect(kpiStatusFromComparison(undefined).tone).toBe("none");
  });
});

describe("accuracyKpiBadge", () => {
  it("Needs review is only for accuracy issues", () => {
    expect(accuracyKpiBadge(3).label).toBe("Needs review");
    expect(accuracyKpiBadge(0).label).toBe("None open");
    expect(kpiStatusFromComparison("significant decline").label).not.toBe("Needs review");
  });
});

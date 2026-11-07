import { describe, expect, it } from "vitest";
import { gapTitleFromPayload, leverTypeToLabel } from "@/lib/gaps/display";

describe("lib/gaps/display", () => {
  it("maps lever types to plain labels", () => {
    expect(leverTypeToLabel("on_page")).toBe("On-page content");
    expect(leverTypeToLabel("truth_layer")).toBe("Facts and verification");
    expect(leverTypeToLabel(null)).toBeNull();
  });

  it("derives titles from suggested action and headline terms", () => {
    expect(
      gapTitleFromPayload({ suggestedAction: "update the AI program page", format: "program_page" }, "gap"),
    ).toBe("Update the AI program page");
    expect(
      gapTitleFromPayload({ headlineTerms: ["Demo University", "Energy"], format: "program_page" }, "gap"),
    ).toContain("program page");
  });
});

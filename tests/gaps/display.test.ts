import { describe, expect, it } from "vitest";
import { CORRELATION_LABEL } from "@/lib/contracts/gaps";
import { citedPagesShareFromPayload, gapTitleFromPayload, leverTypeToLabel } from "@/lib/gaps/display";

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

  it("parses citedPagesShare table with n and correlation label", () => {
    const table = citedPagesShareFromPayload({
      citedPagesShare: {
        label: CORRELATION_LABEL,
        n: 12,
        headlineTerms: [{ term: "Energy", n: 9, headlines: ["Energy guide"] }],
        contentTypes: [{ label: "ranking list", n: 7 }],
        faqs: [{ label: "What programs exist?", n: 5 }],
        freshness: { summary: "Mostly recent", n: 10 },
        peers: [{ label: "Harbor College", n: 4 }],
      },
    });
    expect(table).toMatchObject({
      label: CORRELATION_LABEL,
      n: 12,
      headlineTerms: [{ term: "Energy", n: 9 }],
      contentTypes: [{ label: "ranking list", n: 7 }],
      faqs: [{ label: "What programs exist?", n: 5 }],
      freshness: { summary: "Mostly recent", n: 10 },
      peers: [{ label: "Harbor College", n: 4 }],
    });
    expect(citedPagesShareFromPayload({})).toBeNull();
    expect(citedPagesShareFromPayload({ citedPagesShare: { n: 0 } })).toBeNull();
  });
});

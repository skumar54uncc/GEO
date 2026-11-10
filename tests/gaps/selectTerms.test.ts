import { describe, expect, it } from "vitest";
import {
  brandExclusionSet,
  filterGapTermsForHighlight,
  isExcludedBrandTerm,
  isGapStopword,
  selectGapTermsFromPages,
} from "@/lib/gaps/selectTerms";
import type { PageTermSource } from "@/lib/gaps/types";

const brand = "Demo University";
const aliases = ["Demo U", "Demo"] as const;

function page(id: string, title: string, h1?: string, h2s: string[] = []): PageTermSource {
  return { id, title, h1: h1 ?? title, h2s };
}

describe("gap term selection", () => {
  it("excludes the brand name and every alias (and their tokens)", () => {
    const excluded = brandExclusionSet(brand, aliases);
    expect(isExcludedBrandTerm("Demo University", excluded)).toBe(true);
    expect(isExcludedBrandTerm("demo", excluded)).toBe(true);
    expect(isExcludedBrandTerm("Demo U", excluded)).toBe(true);
    expect(isExcludedBrandTerm("curriculum", excluded)).toBe(false);

    const rows = selectGapTermsFromPages({
      pages: [
        page("1", "Demo University energy curriculum"),
        page("2", "Demo U energy curriculum guide"),
      ],
      brandName: brand,
      aliases,
    });
    expect(rows.map((r) => r.term)).not.toContain("demo");
    expect(rows.map((r) => r.term)).not.toContain("university");
    expect(rows.map((r) => r.term)).toContain("energy");
    expect(rows.map((r) => r.term)).toContain("curriculum");
  });

  it("removes stopwords", () => {
    expect(isGapStopword("the")).toBe(true);
    expect(isGapStopword("with")).toBe(true);
    expect(isGapStopword("curriculum")).toBe(false);

    const rows = selectGapTermsFromPages({
      pages: [page("1", "The best programs with outcomes"), page("2", "The best programs with outcomes")],
      brandName: brand,
      aliases,
    });
    expect(rows.map((r) => r.term)).not.toContain("the");
    expect(rows.map((r) => r.term)).not.toContain("with");
    expect(rows.map((r) => r.term)).not.toContain("best");
    expect(rows.map((r) => r.term)).toContain("outcomes");
  });

  it("requires >= 2 distinct cited pages before a term shows", () => {
    const rows = selectGapTermsFromPages({
      pages: [
        page("1", "Internship outcomes checklist"),
        page("2", "Internship guide for applicants"),
        page("3", "Something else entirely"),
      ],
      brandName: brand,
      aliases,
    });
    expect(rows.find((r) => r.term === "internship")?.n).toBe(2);
    expect(rows.find((r) => r.term === "outcomes")).toBeUndefined();
    expect(rows.find((r) => r.term === "checklist")).toBeUndefined();
  });

  it("filterGapTermsForHighlight drops brand, stopwords, and low-n terms", () => {
    const counts = new Map([
      ["energy", 3],
      ["demo", 5],
      ["the", 9],
      ["rare", 1],
    ]);
    expect(
      filterGapTermsForHighlight(["Energy", "Demo", "the", "rare", "outcomes"], brand, aliases, {
        pageCounts: counts,
      }),
    ).toEqual(["Energy"]);
  });

  it("does not treat tokens of long unit aliases as brand exclusions", () => {
    const excluded = brandExclusionSet("UNC Charlotte", [
      "UNC Charlotte",
      "Energy Production and Infrastructure Center",
      "EPIC",
    ]);
    expect(isExcludedBrandTerm("UNC Charlotte", excluded)).toBe(true);
    expect(isExcludedBrandTerm("EPIC", excluded)).toBe(true);
    expect(isExcludedBrandTerm("Energy", excluded)).toBe(false);
    expect(
      filterGapTermsForHighlight(
        ["Energy", "UNC Charlotte", "EPIC"],
        "UNC Charlotte",
        ["UNC Charlotte", "Energy Production and Infrastructure Center", "EPIC"],
      ),
    ).toEqual(["Energy"]);
  });
});

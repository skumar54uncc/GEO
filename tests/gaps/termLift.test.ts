import { describe, expect, it } from "vitest";
import {
  computeTermLifts,
  extractHeadlineTerms,
  logOddsLift,
  smoothedRate,
} from "@/lib/gaps/termLift";
import {
  CORRELATION_LABEL,
  DIRICHLET_ALPHA,
  MIN_CITED_PAGES_PER_COHORT,
  NOT_ENOUGH_PAGES_MESSAGE,
} from "@/lib/gaps/types";

function pages(n: number, title: string, h2s: string[] = []) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${title}-${i}`,
    title,
    h1: title,
    h2s,
  }));
}

describe("headline term extraction", () => {
  it("keeps content words from title H1 H2 and drops stopwords", () => {
    const terms = extractHeadlineTerms({
      id: "1",
      title: "Best Energy Engineering Programs in the Southeast",
      h1: "Energy Engineering",
      h2s: ["Why research matters", "The of a"],
    });
    expect(terms.has("energy")).toBe(true);
    expect(terms.has("engineering")).toBe(true);
    expect(terms.has("southeast")).toBe(true);
    expect(terms.has("research")).toBe(true);
    expect(terms.has("best")).toBe(false);
    expect(terms.has("the")).toBe(false);
    expect(terms.has("why")).toBe(false);
  });
});

describe("Dirichlet-smoothed log odds lift", () => {
  it("uses Jeffreys alpha 0.5 and shrinks rare terms versus raw rates", () => {
    expect(DIRICHLET_ALPHA).toBe(0.5);
    // 1/10 vs 0/10 raw odds are extreme; smoothed lift is finite and modest.
    const rare = logOddsLift(1, 10, 0, 10);
    const common = logOddsLift(8, 10, 2, 10);
    expect(Number.isFinite(rare)).toBe(true);
    expect(Math.abs(rare)).toBeLessThan(Math.abs(common));
    expect(smoothedRate(0, 10)).toBeCloseTo(0.5 / 11, 12);
  });

  it("positive lift means the term is enriched in the lost cohort", () => {
    expect(logOddsLift(9, 10, 1, 10)).toBeGreaterThan(0);
    expect(logOddsLift(1, 10, 9, 10)).toBeLessThan(0);
  });
});

describe("computeTermLifts", () => {
  it("refuses to show any term when a cohort has fewer than 10 pages", () => {
    const result = computeTermLifts({
      wonPages: pages(MIN_CITED_PAGES_PER_COHORT, "Campus life housing"),
      lostPages: pages(MIN_CITED_PAGES_PER_COHORT - 1, "Energy engineering rankings"),
    });
    expect(result).toEqual({
      status: "insufficient",
      message: NOT_ENOUGH_PAGES_MESSAGE,
      wonN: 10,
      lostN: 9,
      terms: [],
    });
  });

  it("labels every term with correlation-not-cause and includes n for both cohorts", () => {
    const wonPages = [
      ...pages(7, "Campus housing guide"),
      ...pages(3, "Student life checklist"),
    ];
    const lostPages = [
      ...pages(8, "Energy engineering rankings southeast"),
      ...pages(2, "Best engineering programs"),
    ];
    expect(wonPages).toHaveLength(10);
    expect(lostPages).toHaveLength(10);

    const result = computeTermLifts({ wonPages, lostPages });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.label).toBe(CORRELATION_LABEL);
    expect(result.terms.length).toBeGreaterThan(0);
    for (const row of result.terms) {
      expect(row.label).toBe(CORRELATION_LABEL);
      expect(row.won.n).toBe(10);
      expect(row.lost.n).toBe(10);
      expect(row.won.matches).toBeLessThanOrEqual(row.won.n);
      expect(row.lost.matches).toBeLessThanOrEqual(row.lost.n);
    }

    const energy = result.terms.find((t) => t.term === "energy");
    expect(energy).toBeDefined();
    expect(energy!.lost.matches).toBe(8);
    expect(energy!.won.matches).toBe(0);
    expect(energy!.logOddsLift).toBeGreaterThan(0);
    expect(energy!.logOddsLift).toBeCloseTo(logOddsLift(8, 10, 0, 10), 12);
  });
});

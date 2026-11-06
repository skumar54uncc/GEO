import { describe, expect, it } from "vitest";
import { findTruthConflicts, normalizeFactValue } from "@/lib/gaps/truth";

describe("truth layer", () => {
  it("normalizes numeric formatting for comparison", () => {
    expect(normalizeFactValue("15,000")).toBe("15000");
    expect(normalizeFactValue("$15,000")).toBe("15000");
    expect(normalizeFactValue("  R1  Status ")).toBe("r1 status");
  });

  it("reports our fact, conflicting cited value, and source URL without correcting", () => {
    const facts = [
      {
        id: "fact-enrollment",
        text: "UNC Charlotte enrollment is 30,000 students.",
        key: "enrollment",
        value: "30,000",
      },
      {
        id: "fact-r1",
        text: "UNC Charlotte received Carnegie R1 status in 2025.",
        key: "carnegie",
        value: "R1",
      },
    ];
    const cited = [
      {
        key: "enrollment",
        value: "25,000",
        sourceUrl: "https://wikipedia.org/wiki/UNC_Charlotte",
        excerpt: "enrollment of about 25,000 students",
      },
      {
        key: "carnegie",
        value: "R1",
        sourceUrl: "https://example.org/ok",
      },
      {
        key: "enrollment",
        value: "30000",
        sourceUrl: "https://niche.com/colleges/unc-charlotte/",
      },
    ];

    const conflicts = findTruthConflicts(facts, cited);
    expect(conflicts).toEqual([
      {
        factId: "fact-enrollment",
        ourFact: "UNC Charlotte enrollment is 30,000 students.",
        conflictingValue: "enrollment of about 25,000 students",
        sourceUrl: "https://wikipedia.org/wiki/UNC_Charlotte",
      },
    ]);
    // Never mutates inputs / never invents a corrected value field.
    expect(conflicts[0]).not.toHaveProperty("correctedValue");
    expect(facts[0].value).toBe("30,000");
  });

  it("ignores cited rows without a matching key or source URL", () => {
    expect(
      findTruthConflicts(
        [{ id: "1", text: "A", key: "tuition", value: "10000" }],
        [
          { key: "enrollment", value: "1", sourceUrl: "https://x.example" },
          { key: "tuition", value: "9999", sourceUrl: "  " },
        ],
      ),
    ).toEqual([]);
  });
});

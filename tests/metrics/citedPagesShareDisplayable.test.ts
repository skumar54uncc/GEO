import { describe, expect, it } from "vitest";
import {
  displayableCitedPagesShare,
  MIN_CITED_PAGES_FOR_SHARE_TABLE,
} from "@/lib/metrics/displayable";

describe("displayableCitedPagesShare", () => {
  it("suppresses for viewers when n < 3 with Too few cited pages message", () => {
    expect(MIN_CITED_PAGES_FOR_SHARE_TABLE).toBe(3);
    for (const n of [0, 1, 2]) {
      const d = displayableCitedPagesShare(n);
      expect(d.kind).toBe("too_few_answers");
      if (d.kind === "too_few_answers") {
        expect(d.message).toBe(`Too few cited pages (n=${n})`);
        expect(d.n).toBe(n);
      }
    }
  });

  it("shows when n >= 3", () => {
    expect(displayableCitedPagesShare(3).kind).toBe("show");
    expect(displayableCitedPagesShare(12).kind).toBe("show");
  });
});

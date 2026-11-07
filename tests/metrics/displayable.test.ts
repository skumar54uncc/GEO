import { describe, expect, it } from "vitest";
import { displayable, displayableFromPromptsWon, displayableFromRate } from "@/lib/metrics/displayable";

describe("displayable — one suppression rule", () => {
  it("prefers too few prompts over too few answers", () => {
    const d = displayable({ n: 5, prompts: 3, tooFewPrompts: true, tooFewDraws: true });
    expect(d).toEqual({ kind: "too_few_prompts", k: 3, message: "Too few prompts (k=3)" });
  });

  it("suppresses by answer count when prompts are enough", () => {
    const d = displayable({ n: 12, prompts: 12, tooFewDraws: true });
    expect(d.kind).toBe("too_few_answers");
    if (d.kind === "too_few_answers") expect(d.message).toBe("Too few answers (n=12)");
  });

  it("shows when n and k clear thresholds", () => {
    expect(displayable({ n: 90, prompts: 30 }).kind).toBe("show");
  });

  it("same cell metric yields the same decision for Overview and Visibility shapes", () => {
    const won = { prompts: 3, draws: 9, tooFewPrompts: true, tooFewDraws: true };
    const rate = { n: 9, prompts: 3, tooFewPrompts: true, tooFewDraws: true };
    expect(displayableFromPromptsWon(won)).toEqual(displayableFromRate(rate));
  });
});

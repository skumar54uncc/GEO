import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ITERS,
  BOOTSTRAP_SEED,
  TOO_FEW_DRAWS,
  clusterBootstrap,
  clusterRate,
  isPromptWon,
  mcnemarExact,
  median,
  mulberry32,
  pairedRateDifference,
  promptsWon,
  wilsonInterval,
  wilsonRate,
  wonRuleLabel,
} from "@/lib/metrics/stats";
import { ENGINE_INDEX, IndexMixError, assertSameIndex, enginesInIndex } from "@/lib/metrics/indexes";

const rate = (clusters: boolean[][]) => clusters.flat().filter(Boolean).length / clusters.flat().length;

describe("wilson", () => {
  it("wilson known case 8 of 10", () => {
    const w = wilsonInterval(8, 10);
    expect(w.rate).toBeCloseTo(0.8, 12);
    expect(w.ci_low).toBeCloseTo(0.4902, 3);
    expect(w.ci_high).toBeCloseTo(0.9433, 3);
  });

  it("wilson empty denominator is null", () => {
    expect(wilsonInterval(0, 0)).toEqual({ rate: null, ci_low: null, ci_high: null });
  });

  it("wilson rate carries n and flags small cells", () => {
    const r = wilsonRate(8, 10);
    expect(r).toMatchObject({ numerator: 8, n: 10, method: "wilson", tooFewDraws: true });
    expect(wilsonRate(30, 60, 60).tooFewDraws).toBe(false);
  });
});

describe("prng and bootstrap", () => {
  it("mulberry32 is deterministic and in [0, 1)", () => {
    const a = mulberry32(BOOTSTRAP_SEED);
    const b = mulberry32(BOOTSTRAP_SEED);
    const seq = Array.from({ length: 50 }, () => a());
    expect(seq).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seq.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("bootstrap reproducible with same seed", () => {
    const clusters = [[true, true, false], [true, false, false], [false, false, false], [true, true, true], [true, true, false]];
    const run = (seed: number) => clusterBootstrap({ clusters, statistic: rate, iterations: 500, seed });
    expect(run(7)).toEqual(run(7));
    const draws = (seed: number) => {
      const log: number[] = [];
      clusterBootstrap({ clusters, statistic: (s) => (log.push(rate(s)), rate(s)), iterations: 50, seed });
      return log;
    };
    expect(draws(7)).toEqual(draws(7));
    expect(draws(7)).not.toEqual(draws(8));
  });

  it("bootstrap defaults are 2000 iterations and the fixed seed", () => {
    expect(BOOTSTRAP_ITERS).toBe(2000);
    expect(BOOTSTRAP_SEED).toBe(20261103);
    const clusters = [[true, false], [true, true], [false, false]];
    expect(clusterBootstrap({ clusters, statistic: rate })).toEqual(
      clusterBootstrap({ clusters, statistic: rate, iterations: 2000, seed: 20261103 }),
    );
  });

  it("bootstrap two clusters 1 and 0 spans the full range", () => {
    const r = clusterBootstrap({ clusters: [[true, true], [false, false]], statistic: rate });
    expect(r.estimate).toBe(0.5);
    expect(r.ciLow).toBe(0);
    expect(r.ciHigh).toBe(1);
  });

  it("bootstrap identical clusters collapse to the estimate", () => {
    const r = clusterBootstrap({ clusters: [[true, false], [true, false], [true, false]], statistic: rate });
    expect(r).toEqual({ estimate: 0.5, ciLow: 0.5, ciHigh: 0.5 });
  });

  it("bootstrap resamples whole prompts, not draws", () => {
    const seen = new Set<number>();
    clusterBootstrap({
      clusters: [[1, 1, 1], [2, 2, 2]],
      statistic: (sample) => {
        for (const c of sample) seen.add(new Set(c).size);
        return sample.length;
      },
      iterations: 50,
    });
    expect([...seen]).toEqual([1]);
  });

  it("bootstrap with no clusters is NaN", () => {
    const r = clusterBootstrap<boolean>({ clusters: [], statistic: () => 0 });
    expect(Number.isNaN(r.estimate)).toBe(true);
  });

  it("cluster rate reports n, interval and the too few draws flag", () => {
    // k=2 is below MIN_PROMPTS_FOR_CLUSTER, so approximate Wilson (not cluster bootstrap).
    const r = clusterRate({ clusters: [[true, true, false], [false, false, false]] });
    expect(r).toMatchObject({ numerator: 2, n: 6, method: "wilson", tooFewDraws: true, tooFewPrompts: true, approximate: true });
    expect(r.rate).toBeCloseTo(1 / 3, 12);
    expect(r.ciLow).not.toBeNull();
    expect(r.ciLow!).toBeLessThan(r.ciHigh!);
    expect(clusterRate({ clusters: [] })).toMatchObject({ rate: null, n: 0, tooFewDraws: true });
    // Varied clusters so the bootstrap interval has width (identical clusters collapse → Wilson).
    const big = clusterRate({
      clusters: Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? [true, true, false] : [false, false, true])),
    });
    expect(big.n).toBe(TOO_FEW_DRAWS);
    expect(big.tooFewDraws).toBe(false);
    expect(big.method).toBe("cluster_bootstrap");
  });

  it("paired difference is exactly 1 when every prompt goes from absent to present", () => {
    const prompts = Array.from({ length: 6 }, () => ({ before: [false, false, false], after: [true, true, true] }));
    const d = pairedRateDifference({ prompts });
    expect(d.estimate).toBe(1);
    expect(d.prompts).toBe(6);
    expect(d.drawsBefore).toBe(18);
    expect(d.drawsAfter).toBe(18);
    // Degenerate bootstrap width is widened; never return a zero-width interval.
    expect(d.ciLow).toBeLessThan(d.ciHigh);
  });

  it("paired difference reproducible with same seed and never zero-width when nothing changes", () => {
    const same = [
      { before: [true, false, true], after: [true, false, true] },
      { before: [false, false, true], after: [false, false, true] },
      { before: [true, true, true], after: [true, true, true] },
    ];
    const d = pairedRateDifference({ prompts: same });
    expect(d.estimate).toBe(0);
    expect(d.ciLow).toBeLessThan(d.ciHigh);
    const mixed = [
      { before: [false, false, true], after: [true, true, true] },
      { before: [true, true, false], after: [false, false, false] },
      { before: [false, false, false], after: [true, false, true] },
    ];
    expect(pairedRateDifference({ prompts: mixed, seed: 3 })).toEqual(pairedRateDifference({ prompts: mixed, seed: 3 }));
  });
});

describe("mcnemar", () => {
  it("mcnemar b=1 c=9 is a significant improvement", () => {
    const r = mcnemarExact({ b: 1, c: 9 });
    expect(r.pValue).toBeCloseTo(22 / 1024, 12);
    expect(r.label).toBe("significant improvement");
    expect(r.direction).toBe("improvement");
    expect(r.discordant).toBe(10);
  });

  it("mcnemar b=9 c=1 is a significant decline", () => {
    const r = mcnemarExact({ b: 9, c: 1 });
    expect(r.pValue).toBeCloseTo(22 / 1024, 12);
    expect(r.label).toBe("significant decline");
    expect(r.direction).toBe("decline");
  });

  it("mcnemar b=5 c=5 is within noise", () => {
    const r = mcnemarExact({ b: 5, c: 5 });
    expect(r.pValue).toBe(1);
    expect(r.label).toBe("within noise");
    expect(r.direction).toBe("none");
  });

  it("mcnemar no discordant pairs is within noise", () => {
    expect(mcnemarExact({ b: 0, c: 0 })).toEqual({ pValue: 1, label: "within noise", direction: "none", discordant: 0 });
  });

  it("mcnemar alpha boundary: c=5 is p 2/32 noise, c=6 is p 2/64 significant", () => {
    const r = mcnemarExact({ b: 0, c: 5 });
    expect(r.pValue).toBeCloseTo(2 / 32, 12);
    expect(r.label).toBe("within noise");
    expect(mcnemarExact({ b: 0, c: 6 }).pValue).toBeCloseTo(2 / 64, 12);
    expect(mcnemarExact({ b: 0, c: 6 }).label).toBe("significant improvement");
  });

  it("mcnemar rejects bad counts", () => {
    expect(() => mcnemarExact({ b: -1, c: 2 })).toThrow(RangeError);
    expect(() => mcnemarExact({ b: 1.5, c: 2 })).toThrow(RangeError);
  });
});

describe("median", () => {
  it("median odd", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("median even", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("median empty is null and input is not mutated", () => {
    expect(median([])).toBeNull();
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("prompts won", () => {
  it("won rule is at least 2 of 3 when n=3", () => {
    expect(isPromptWon(2, 3)).toBe(true);
    expect(isPromptWon(1, 3)).toBe(false);
    expect(wonRuleLabel(3)).toBe("at least 2 of 3 draws");
  });

  it("won rule label for n=2 is at least 2 of 2 draws (not 2 of 3)", () => {
    expect(wonRuleLabel(2)).toBe("at least 2 of 2 draws");
    expect(wonRuleLabel(2)).not.toContain("of 3");
    expect(promptsWon([{ mentions: 2, validDraws: 2 }]).rule).toBe("at least 2 of 2 draws");
  });

  it("won rule uses strict majority floor(n/2)+1 and needs a valid draw", () => {
    expect(isPromptWon(1, 2)).toBe(false); // n=2 needs 2
    expect(isPromptWon(2, 2)).toBe(true);
    expect(isPromptWon(1, 1)).toBe(true);
    expect(isPromptWon(2, 4)).toBe(false); // n=4 needs 3
    expect(isPromptWon(3, 4)).toBe(true);
    expect(isPromptWon(2, 5)).toBe(false);
    expect(isPromptWon(3, 5)).toBe(true);
    expect(isPromptWon(0, 0)).toBe(false);
  });

  it("prompts won uses Wilson on prompt counts and skips prompts with no valid draw", () => {
    const perPrompt = [
      ...Array.from({ length: 8 }, () => ({ mentions: 3, validDraws: 3 })),
      ...Array.from({ length: 2 }, () => ({ mentions: 1, validDraws: 3 })),
      { mentions: 0, validDraws: 0 },
    ];
    const r = promptsWon(perPrompt);
    expect(r).toMatchObject({ won: 8, prompts: 10, draws: 30, method: "wilson", rule: "at least 2 of 3 draws", tooFewDraws: false });
    expect(r.rate).toBeCloseTo(0.8, 12);
    expect(r.ciLow).toBeCloseTo(0.4902, 3);
    expect(r.ciHigh).toBeCloseTo(0.9433, 3);
  });

  it("prompts won flags cells under 30 draws and handles empty", () => {
    expect(promptsWon([{ mentions: 2, validDraws: 3 }]).tooFewDraws).toBe(true);
    expect(promptsWon([])).toMatchObject({ won: 0, prompts: 0, rate: null, ciLow: null, ciHigh: null });
  });

  it("0 of 4 and 4 of 4 never produce a zero-width Wilson interval", () => {
    const none = promptsWon(Array.from({ length: 4 }, () => ({ mentions: 0, validDraws: 1 })));
    expect(none).toMatchObject({ won: 0, prompts: 4, tooFewDraws: true, tooFewPrompts: true, approximate: true });
    expect(none.ciLow).not.toBeNull();
    expect(none.ciHigh).not.toBeNull();
    expect(none.ciLow!).toBeLessThan(none.ciHigh!);

    const all = promptsWon(Array.from({ length: 4 }, () => ({ mentions: 1, validDraws: 1 })));
    expect(all).toMatchObject({ won: 4, prompts: 4, tooFewDraws: true, tooFewPrompts: true, approximate: true });
    expect(all.ciLow).not.toBeNull();
    expect(all.ciHigh).not.toBeNull();
    expect(all.ciLow!).toBeLessThan(all.ciHigh!);
  });

  it("k=3 uses approximate Wilson, not cluster bootstrap", () => {
    const r = clusterRate({
      clusters: [[true, false], [true], [false, true]],
    });
    expect(r.method).toBe("wilson");
    expect(r.tooFewPrompts).toBe(true);
    expect(r.approximate).toBe(true);
    expect(r.prompts).toBe(3);
    expect(r.ciLow!).toBeLessThan(r.ciHigh!);
  });

  it("cluster rate falls back to Wilson when bootstrap width is zero", () => {
    const allHit = clusterRate({
      clusters: Array.from({ length: 12 }, () => [true, true, true]),
    });
    expect(allHit.rate).toBe(1);
    expect(allHit.approximate).toBe(true);
    expect(allHit.method).toBe("wilson");
    expect(allHit.ciLow!).toBeLessThan(allHit.ciHigh!);
  });

  it("identical paired scans never return a zero-width interval", () => {
    const pairs = Array.from({ length: 12 }, () => ({
      before: [true, true, false],
      after: [true, true, false],
    }));
    const d = pairedRateDifference({ prompts: pairs });
    expect(d.estimate).toBe(0);
    expect(d.ciLow).toBeLessThan(d.ciHigh);
  });
});

describe("indexes", () => {
  it("engine index map", () => {
    expect(enginesInIndex("chat")).toEqual(["chatgpt", "gemini", "claude", "perplexity"]);
    expect(enginesInIndex("google")).toEqual(["google_aio", "google_ai_mode"]);
    expect(ENGINE_INDEX.google_ai_mode).toBe("google");
  });

  it("index separation throws", () => {
    expect(() => assertSameIndex(["chatgpt", "google_aio"])).toThrow(IndexMixError);
    expect(() => assertSameIndex(["google_ai_mode", "gemini", "google_aio"])).toThrow(/never be pooled/);
  });

  it("same index passes and names the index", () => {
    expect(assertSameIndex(["chatgpt", "claude", "chatgpt"])).toBe("chat");
    expect(assertSameIndex(["google_aio", "google_ai_mode"])).toBe("google");
    expect(() => assertSameIndex([])).toThrow(RangeError);
  });
});

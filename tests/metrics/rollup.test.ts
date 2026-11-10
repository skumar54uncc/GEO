import { beforeEach, describe, expect, it } from "vitest";
import { compareOutcomes, compareScans, wonByPromptFromDraws } from "@/lib/metrics/compare";
import { IndexMixError } from "@/lib/metrics/indexes";
import type { MetricDraw } from "@/lib/metrics/load";
import { buildCells, cellKey, consistencyOf, domainIsOwned, firstMentionStatus, hasOwnedCitation, headlineCells, rollupCell } from "@/lib/metrics/rollup";
import { wilsonInterval } from "@/lib/metrics/stats";
import { IncomparableScansError, freezePromptSet } from "@/lib/promptSets";
import { prompts } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "./dbFixtures";

const OWNED = ["charlotte.edu"];
const BRAND = "brand-1";

type D = {
  prompt: string;
  brand?: boolean;
  brandSpan?: number | null;
  comps?: Array<{ id: string; span?: number | null }>;
  listPosition?: number | null;
  citations?: Array<{ domain: string; sourceClass?: string }>;
  claims?: Array<"supported" | "contradicted" | "unverifiable">;
  engine?: MetricDraw["engine"];
  runner?: MetricDraw["runner"];
  region?: string;
  honored?: MetricDraw["regionHonored"];
  persona?: string | null;
  branded?: boolean;
};

let n = 0;
function draw(o: D): MetricDraw {
  const mentions: MetricDraw["mentions"] = [];
  if (o.brand) mentions.push({ entityType: "brand", entityId: BRAND, spanStart: o.brandSpan === undefined ? 10 : o.brandSpan, listPosition: o.listPosition ?? null });
  for (const c of o.comps ?? []) mentions.push({ entityType: "competitor", entityId: c.id, spanStart: c.span === undefined ? 50 : c.span, listPosition: null });
  return {
    drawId: `d${++n}`,
    promptId: o.prompt,
    engine: o.engine ?? "chatgpt",
    runner: o.runner ?? "ui_provider",
    provider: "fixture",
    regionId: o.region ?? "r1",
    regionHonored: o.honored ?? "unknown",
    personaId: o.persona ?? null,
    branded: o.branded ?? false,
    intent: null,
    mentions,
    citations: (o.citations ?? []).map((c) => ({ domain: c.domain, sourceClass: c.sourceClass ?? "other" })),
    claims: (o.claims ?? []).map((verdict) => ({ verdict })),
  };
}
const key = () => cellKey("chatgpt", "ui_provider", null, null, false);
const roll = (draws: MetricDraw[]) => rollupCell({ key: key(), draws, ownedDomains: OWNED, iterations: 300 });

/** 3 prompts x 3 draws: p1 mentioned 3 of 3, p2 2 of 3, p3 1 of 3. */
function threePrompts(): MetricDraw[] {
  const out: MetricDraw[] = [];
  for (const [p, hits] of [["p1", 3], ["p2", 2], ["p3", 1]] as const) {
    for (let i = 0; i < 3; i++) out.push(draw({ prompt: p, brand: i < hits }));
  }
  return out;
}

describe("rollup: prompts won", () => {
  it("promptsWon is 2 of 3 with a Wilson interval on prompt counts", () => {
    const cell = roll(threePrompts());
    expect(cell.promptsWon).toMatchObject({ won: 2, prompts: 3, draws: 9, method: "wilson", rule: "at least 2 of 3 draws", tooFewDraws: true });
    const w = wilsonInterval(2, 3);
    expect(cell.promptsWon!.ciLow!).toBeCloseTo(w.ci_low!, 12);
    expect(cell.promptsWon!.ciHigh!).toBeCloseTo(w.ci_high!, 12);
    expect(cell.draws).toBe(9);
    expect(cell.tooFewDraws).toBe(true);
  });

  it("branded prompts are their own cells and never reach the headline", () => {
    const unbranded = threePrompts();
    const branded = [0, 1, 2].map((i) => draw({ prompt: "b1", brand: true, branded: true }));
    const cells = buildCells([...unbranded, ...branded], OWNED, { iterations: 100 });
    const brandedCell = cells.find((c) => c.key.branded)!;
    expect(brandedCell.promptsWon).toBeNull();
    expect(brandedCell.mentionRate.numerator).toBe(3);
    const headline = headlineCells(cells);
    expect(headline).toHaveLength(1);
    expect(headline[0].key.branded).toBe(false);
    expect(headline[0].promptsWon).toMatchObject({ won: 2, prompts: 3 });
    expect(headline[0].draws).toBe(9); // the 3 branded draws are not in it
  });

  it("a prompt with 2 valid draws needs strict majority (2 of 2), so 1 mention is a loss", () => {
    const loss = roll([draw({ prompt: "p1", brand: true }), draw({ prompt: "p1", brand: false })]);
    expect(loss.promptsWon).toMatchObject({ won: 0, prompts: 1, rule: "at least 2 of 2 draws" });
    const win = roll([draw({ prompt: "p1", brand: true }), draw({ prompt: "p1", brand: true })]);
    expect(win.promptsWon).toMatchObject({ won: 1, prompts: 1, rule: "at least 2 of 2 draws" });
  });
});

describe("rollup: draw level rates", () => {
  it("mention rate is a cluster bootstrap with n, numerator and a 95% interval", () => {
    const cell = roll(threePrompts());
    expect(cell.mentionRate).toMatchObject({
      numerator: 6,
      n: 9,
      method: "wilson",
      tooFewDraws: true,
      tooFewPrompts: true,
      approximate: true,
    });
    expect(cell.mentionRate.rate).toBeCloseTo(6 / 9, 12);
    expect(cell.mentionRate.ciLow).not.toBeNull();
    expect(cell.mentionRate.ciLow!).toBeLessThanOrEqual(cell.mentionRate.rate!);
    expect(cell.mentionRate.ciHigh!).toBeGreaterThanOrEqual(cell.mentionRate.rate!);
  });

  it("a cell of 30 draws is not flagged too few", () => {
    const draws = Array.from({ length: 30 }, (_, i) => draw({ prompt: `p${i % 10}`, brand: i % 2 === 0 }));
    const cell = roll(draws);
    expect(cell.tooFewDraws).toBe(false);
    expect(cell.mentionRate.tooFewDraws).toBe(false);
  });

  it("citation rate counts owned source_class or an owned domain, once per draw", () => {
    const draws = [
      draw({ prompt: "p1", citations: [{ domain: "example.org", sourceClass: "owned" }] }), // class owned
      draw({ prompt: "p1", citations: [{ domain: "admissions.charlotte.edu" }, { domain: "www.charlotte.edu" }] }), // two owned, one draw
      draw({ prompt: "p2", citations: [{ domain: "notcharlotte.edu" }, { domain: "ncsu.edu", sourceClass: "competitor" }] }), // not owned
      draw({ prompt: "p2" }), // no citations
    ];
    const cell = roll(draws);
    expect(cell.citationRate).toMatchObject({ numerator: 2, n: 4 });
    expect(cell.citationRate.rate).toBeCloseTo(0.5, 12);
    expect(domainIsOwned("WWW.Charlotte.edu", OWNED)).toBe(true);
    expect(domainIsOwned("notcharlotte.edu", OWNED)).toBe(false);
    expect(hasOwnedCitation(draws[2], OWNED)).toBe(false);
  });

  it("first mention rate: the brand must have the minimum span among tracked mentions", () => {
    const draws = [
      draw({ prompt: "p1", brand: true, brandSpan: 5, comps: [{ id: "c1", span: 40 }] }), // first
      draw({ prompt: "p1", brand: true, brandSpan: 60, comps: [{ id: "c1", span: 40 }] }), // competitor first
      draw({ prompt: "p2", brand: true, brandSpan: 7 }), // alone: first
      draw({ prompt: "p2", comps: [{ id: "c2", span: 3 }] }), // brand absent
      draw({ prompt: "p3" }), // nobody named: in the denominator only
    ];
    expect(draws.map((d) => firstMentionStatus(d))).toEqual(["first", "not_first", "first", "not_first", "none"]);
    const cell = roll(draws);
    expect(cell.firstMentionRate).toMatchObject({ numerator: 2, n: 5 });
    expect(cell.firstMentionUnknownSpan).toBe(0);
  });

  it("first mention with a missing span is unknown, kept in the denominator and reported", () => {
    const cell = roll([draw({ prompt: "p1", brand: true, brandSpan: null }), draw({ prompt: "p1", brand: true, brandSpan: 1 })]);
    expect(cell.firstMentionRate).toMatchObject({ numerator: 1, n: 2 });
    expect(cell.firstMentionUnknownSpan).toBe(1);
  });

  it("share of voice counts distinct entities per draw within one index", () => {
    const draws = [
      draw({ prompt: "p1", brand: true, comps: [{ id: "A" }, { id: "A", span: 80 }] }), // A twice counts once
      draw({ prompt: "p1", brand: true, comps: [{ id: "A" }, { id: "B" }] }),
      draw({ prompt: "p2", comps: [{ id: "A" }] }),
      draw({ prompt: "p2" }), // nobody: adds nothing
    ];
    // brand 2 draws; others: A in 3 draws + B in 1 = 4. 2 / (2 + 4)
    const cell = roll(draws);
    expect(cell.shareOfVoice).toMatchObject({ numerator: 2, n: 6, method: "cluster_bootstrap" });
    expect(cell.shareOfVoice.rate).toBeCloseTo(1 / 3, 12);
  });

  it("share of voice is null when no tracked entity is named, and mixed indexes throw", () => {
    const cell = roll([draw({ prompt: "p1" }), draw({ prompt: "p2" })]);
    expect(cell.shareOfVoice).toMatchObject({ rate: null, n: 0 });
    expect(() => rollupCell({ key: key(), draws: [draw({ prompt: "p1" }), draw({ prompt: "p1", engine: "google_aio" })], ownedDomains: OWNED })).toThrow(IndexMixError);
  });

  it("a cell refuses draws from another runner: runners are never averaged", () => {
    expect(() => roll([draw({ prompt: "p1" }), draw({ prompt: "p1", runner: "api_parametric" })])).toThrow(/runners are never averaged/);
  });
});

describe("rollup: position, consistency, accuracy", () => {
  it("position is the median over draws that have a list position and ignores the rest", () => {
    const cell = roll([
      draw({ prompt: "p1", brand: true, listPosition: 1 }),
      draw({ prompt: "p1", brand: true, listPosition: 4 }),
      draw({ prompt: "p2", brand: true, listPosition: 2 }),
      draw({ prompt: "p2", brand: true }), // mentioned, no list
      draw({ prompt: "p3" }),
    ]);
    expect(cell.position).toEqual({ median: 2, n: 3 });
    expect(roll([draw({ prompt: "p1", brand: true })]).position).toEqual({ median: null, n: 0 });
  });

  it("consistency averages majority agreement over prompts; a tie counts mentioned as the majority", () => {
    const cell = roll(threePrompts());
    // p1 3/3 = 1, p2 majority mentioned 2/3, p3 majority not mentioned 2/3
    expect(cell.consistency.prompts).toBe(3);
    expect(cell.consistency.value).toBeCloseTo((1 + 2 / 3 + 2 / 3) / 3, 12);
    expect(consistencyOf([{ mentions: 1, validDraws: 2 }]).value).toBeCloseTo(0.5, 12);
    expect(consistencyOf([{ mentions: 0, validDraws: 0 }])).toEqual({ value: null, prompts: 0 });
  });

  it("accuracy is null without claims and counts unverifiable in the denominator", () => {
    expect(roll([draw({ prompt: "p1", brand: true })]).accuracy).toMatchObject({ rate: null, claims: 0 });
    const cell = roll([
      draw({ prompt: "p1", brand: true, claims: ["supported", "supported"] }),
      draw({ prompt: "p1", brand: true, claims: ["contradicted", "unverifiable"] }),
    ]);
    expect(cell.accuracy).toMatchObject({ claims: 4, supported: 2, contradicted: 1, unverifiable: 1 });
    expect(cell.accuracy.rate!.rate).toBeCloseTo(0.75, 12); // 1 - 1/4
    // Few prompts → approximate Wilson fallback from clusterRate (claims clustered by prompt).
    expect(cell.accuracy.rate).toMatchObject({ numerator: 3, n: 4, method: "wilson" });
    expect(cell.accuracy.rate!.prompts).toBe(1);
    const w = wilsonInterval(3, 4);
    expect(cell.accuracy.rate!.ciLow!).toBeCloseTo(w.ci_low!, 12);
  });
});

describe("rollup: cells and determinism", () => {
  it("builds region and persona cells, leaves region_honored=no out of region cells and says so", () => {
    const draws = [
      draw({ prompt: "p1", brand: true, region: "r1", honored: "yes", persona: "u1" }),
      draw({ prompt: "p1", brand: false, region: "r1", honored: "no", persona: "u1" }),
      draw({ prompt: "p2", brand: true, region: "r1", honored: "unknown" }),
    ];
    const cells = buildCells(draws, OWNED, { iterations: 100 });
    const find = (region: string | null, persona: string | null) =>
      cells.find((c) => c.key.regionId === region && c.key.personaId === persona && c.key.personaGroup === null)!;
    expect(find(null, null).draws).toBe(3); // overall includes every valid draw
    expect(find("r1", null)).toMatchObject({ draws: 2, regionExcluded: 1 });
    expect(find(null, "u1").draws).toBe(2);
    expect(find("r1", "u1")).toMatchObject({ draws: 1, regionExcluded: 1 });
    expect(cells.every((c) => c.key.index === "chat")).toBe(true);
  });

  it("engines and runners get separate cells and the two indexes are never pooled", () => {
    const draws = [
      draw({ prompt: "p1", brand: true }),
      draw({ prompt: "p1", brand: true, runner: "api_parametric" }),
      draw({ prompt: "p1", brand: false, engine: "google_aio", runner: "serp_provider" }),
    ];
    const overall = buildCells(draws, OWNED, { iterations: 50 }).filter(
      (c) => c.key.regionId === null && c.key.personaId === null && c.key.personaGroup === null,
    );
    expect(overall.map((c) => `${c.key.engine}|${c.key.runner}|${c.key.index}`)).toEqual([
      "chatgpt|api_parametric|chat",
      "chatgpt|ui_provider|chat",
      "google_aio|serp_provider|google",
    ]);
  });

  it("rolling up twice gives identical numbers", () => {
    const draws = [...threePrompts(), ...threePrompts().map((d) => ({ ...d, drawId: `${d.drawId}b`, promptId: `${d.promptId}b`, engine: "gemini" as const }))];
    const a = JSON.stringify(buildCells(draws, OWNED));
    const b = JSON.stringify(buildCells([...draws].reverse(), OWNED));
    expect(a).toBe(b); // input order does not matter either
  });
});

describe("compare", () => {
  it("pairs prompts per series, labels with McNemar and reports a paired presence difference", () => {
    const before: MetricDraw[] = [];
    const after: MetricDraw[] = [];
    for (let p = 0; p < 10; p++) {
      for (let i = 0; i < 3; i++) {
        before.push(draw({ prompt: `p${p}`, brand: true }));
        after.push(draw({ prompt: `p${p}`, brand: false }));
      }
    }
    const [cmp] = compareOutcomes(wonByPromptFromDraws(before), wonByPromptFromDraws(after));
    expect(cmp).toMatchObject({ pairs: 10, wonBefore: 10, wonAfter: 0, b: 10, c: 0, label: "significant decline", direction: "decline" });
    expect(cmp.pValue).toBeLessThan(0.05);
    expect(cmp.presenceDifference).toMatchObject({ estimate: -1, prompts: 10, drawsBefore: 30, drawsAfter: 30 });
    expect(cmp.presenceDifference!.ciLow).not.toBeNull();
    expect(cmp.presenceDifference!.ciHigh).not.toBeNull();
    expect(cmp.presenceDifference!.ciLow as number).toBeLessThan(cmp.presenceDifference!.ciHigh as number);
  });

  it("a prompt is paired only when valid in both scans, and branded prompts are a separate series", () => {
    const before = [draw({ prompt: "p1", brand: true }), draw({ prompt: "p2", brand: true }), draw({ prompt: "b1", brand: true, branded: true })];
    const after = [draw({ prompt: "p1", brand: true }), draw({ prompt: "b1", brand: false, branded: true })];
    const cmps = compareOutcomes(wonByPromptFromDraws(before), wonByPromptFromDraws(after));
    expect(cmps).toHaveLength(2);
    const plain = cmps.find((c) => !c.series.branded)!;
    const brandedCmp = cmps.find((c) => c.series.branded)!;
    expect([plain.pairs, plain.wonBefore, plain.wonAfter]).toEqual([1, 1, 1]); // p2 has no draw in the later scan
    expect([brandedCmp.pairs, brandedCmp.wonBefore, brandedCmp.wonAfter]).toEqual([1, 1, 0]);
    expect(plain.label).toBe("within noise");
  });
});

describe("compare: frozen prompt sets", () => {
  beforeEach(resetDatabase);

  it("refuses scans on different prompt set versions and compares scans on the same one", async () => {
    const c = await seed(4);
    const a = await newScan(c);
    const b = await newScan(c);
    for (const p of c.promptIds) for (let i = 1; i <= 3; i++) {
      await addDraw(c, a, p, { drawIndex: i, brand: true });
      await addDraw(c, b, p, { drawIndex: i, brand: true });
    }
    expect(await compareScans(c.db, a, b, { orgId: c.orgId })).toHaveLength(1);

    await c.db.insert(prompts).values({ campaignId: c.campaignId, text: "a brand new prompt", provenance: "custom", status: "approved" });
    const { set: v2 } = await freezePromptSet(c.db, c.orgId, c.campaignId);
    const other = await newScan(c, v2.id);
    await expect(compareScans(c.db, a, other)).rejects.toBeInstanceOf(IncomparableScansError);
    await expect(compareScans(c.db, other, a)).rejects.toThrow(/different prompt set versions/);
  });
});

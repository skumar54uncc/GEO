/**
 * Per-region visibility comparison (P2 B3).
 * Cells count only region_honored yes/unknown. Never pool regions into one number.
 */
import type { Engine, RegionHonored, Runner } from "@/lib/capture/types";
import { REGION_NOT_SUPPORTED_LABEL, regionLocationSupport } from "@/lib/capture/regions";
import { displayable } from "@/lib/metrics/displayable";
import type { MetricDraw } from "@/lib/metrics/load";
import { promptsWon } from "@/lib/metrics/stats";
import type { PromptsWon } from "@/lib/metrics/types";

export type RegionHonoredMix = {
  yes: number;
  unknown: number;
  no: number;
  total: number;
};

export type RegionComparisonCell = {
  regionId: string;
  regionLabel: string;
  engine: Engine;
  runner: Runner;
  locationSupport: "supported" | "not_supported";
  honoredMix: RegionHonoredMix;
  promptsWon: PromptsWon | null;
  display: string;
  displayable: boolean;
};

function mixOf(draws: readonly MetricDraw[]): RegionHonoredMix {
  let yes = 0;
  let unknown = 0;
  let no = 0;
  for (const d of draws) {
    if (d.regionHonored === "yes") yes += 1;
    else if (d.regionHonored === "unknown") unknown += 1;
    else no += 1;
  }
  return { yes, unknown, no, total: yes + unknown + no };
}

/** Region cells use yes/unknown only — never count honored=no. */
export function eligibleRegionDraws(draws: readonly MetricDraw[]): MetricDraw[] {
  return draws.filter((d) => d.regionHonored === "yes" || d.regionHonored === "unknown");
}

function brandMentioned(d: MetricDraw): boolean {
  return d.mentions.some((m) => m.entityType === "brand");
}

function scoreKept(kept: MetricDraw[]): PromptsWon {
  const byPrompt = new Map<string, MetricDraw[]>();
  for (const d of kept) {
    const list = byPrompt.get(d.promptId) ?? [];
    list.push(d);
    byPrompt.set(d.promptId, list);
  }
  const per = [...byPrompt.values()].map((ds) => ({
    mentions: ds.filter(brandMentioned).length,
    validDraws: ds.length,
  }));
  return promptsWon(per);
}

/**
 * One row per region × engine × runner. Never averages across regions.
 */
export function regionComparisonCells(
  draws: readonly MetricDraw[],
  regions: Array<{ id: string; label: string }>,
): RegionComparisonCell[] {
  const out: RegionComparisonCell[] = [];
  for (const region of regions) {
    const inRegion = draws.filter((d) => d.regionId === region.id);
    const byKey = new Map<string, MetricDraw[]>();
    for (const d of inRegion) {
      const k = `${d.engine}|${d.runner}`;
      const list = byKey.get(k) ?? [];
      list.push(d);
      byKey.set(k, list);
    }
    for (const [key, list] of byKey) {
      const [engine, runner] = key.split("|") as [Engine, Runner];
      const support = regionLocationSupport(engine, runner);
      const honoredMix = mixOf(list);
      if (support === "not_supported") {
        out.push({
          regionId: region.id,
          regionLabel: region.label,
          engine,
          runner,
          locationSupport: "not_supported",
          honoredMix,
          promptsWon: null,
          display: REGION_NOT_SUPPORTED_LABEL,
          displayable: false,
        });
        continue;
      }
      const kept = eligibleRegionDraws(list);
      const won = scoreKept(kept);
      const disp = displayable({
        prompts: won.prompts,
        n: won.draws,
        tooFewPrompts: won.tooFewPrompts,
        tooFewDraws: won.tooFewDraws,
      });
      out.push({
        regionId: region.id,
        regionLabel: region.label,
        engine,
        runner,
        locationSupport: "supported",
        honoredMix,
        promptsWon: won,
        display: disp.kind === "show" ? `${won.won} of ${won.prompts}` : disp.message,
        displayable: disp.kind === "show",
      });
    }
  }
  return out;
}

export function formatHonoredMix(mix: RegionHonoredMix): string {
  return `honored ${mix.yes} / unknown ${mix.unknown} / no ${mix.no}`;
}

/** Guard: a draw with region_honored=no must never appear in eligible region scoring. */
export function assertNoHonoredNoInEligible(draws: readonly MetricDraw[]): void {
  for (const d of eligibleRegionDraws(draws)) {
    if ((d.regionHonored as RegionHonored) === "no") {
      throw new Error("region_honored=no must never enter region comparison scoring");
    }
  }
}

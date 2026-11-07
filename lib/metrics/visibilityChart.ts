import type { PromptsWon } from "@/lib/metrics/types";
import { displayableFromPromptsWon } from "@/lib/metrics/displayable";

export type TrendSeriesPoint = {
  engine: string;
  runner: string;
  promptsWon: Pick<PromptsWon, "rate" | "ciLow" | "ciHigh" | "won" | "prompts" | "draws" | "tooFewDraws" | "tooFewPrompts">;
};

export type TrendScanPoint = {
  scanId: string;
  createdAt: string;
  series: TrendSeriesPoint[];
};

export type VisibilityColumn = {
  scanId: string;
  createdAt: string;
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  won: number;
  prompts: number;
  /** Bar height on the chart’s 0–1 axis (fraction of full chart height). */
  height: number;
  suppressed: boolean;
  suppressionMessage: string | null;
  rawRate: number | null;
};

/** Pure: one column per trend scan for the selected engine×runner. */
export function visibilityColumnsFromTrend(
  trend: readonly TrendScanPoint[],
  engine: string,
  runner: string,
): VisibilityColumn[] {
  const base = trend.map((t) => {
    const s = t.series.find((x) => x.engine === engine && x.runner === runner);
    const pw = s?.promptsWon;
    const dec = pw ? displayableFromPromptsWon(pw) : null;
    const rate = pw?.rate ?? null;
    const suppressed = dec != null && dec.kind !== "show";
    const suppressionMessage = suppressed && dec ? dec.message : null;
    return {
      scanId: t.scanId,
      createdAt: t.createdAt,
      rate,
      ciLow: pw?.ciLow ?? null,
      ciHigh: pw?.ciHigh ?? null,
      won: pw?.won ?? 0,
      prompts: pw?.prompts ?? 0,
      suppressed,
      suppressionMessage,
      rawRate: rate,
    };
  });

  const maxShownRate = Math.max(
    0.01,
    ...base.filter((c) => !c.suppressed && c.rate != null).map((c) => c.rate as number),
  );

  return base.map((c) => {
    const height = c.suppressed
      ? 0.4 * maxShownRate
      : c.rate == null
        ? 0
        : Math.min(1, Math.max(0, c.rate));
    return { ...c, height };
  });
}

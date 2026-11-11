import { ROUTES } from "@/lib/capture/registry";
import type { Engine, Runner } from "@/lib/capture/types";
import type { LeadershipPdfInput } from "@/lib/exports/leadershipPdf";
import type { CampaignTarget } from "@/lib/metrics/rollup";

export type PdfCell = {
  engine: string;
  runner: string;
  won: number | null;
  prompts: number | null;
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  draws: number;
};

/** True when this cell is the approved primary measurement series for its engine. */
export function isPrimaryRunnerCell(engine: string, runner: string): boolean {
  const route = ROUTES[engine as Engine];
  if (!route) return false;
  return route.primary.runner === (runner as Runner);
}

/** Drop calibration / fallback / parametric series from the leadership engine list. */
export function filterPrimaryEngineCells<T extends { engine: string; runner: string }>(cells: T[]): T[] {
  return cells.filter((c) => isPrimaryRunnerCell(c.engine, c.runner));
}

/**
 * Headline series = campaign target engine + that engine's ROUTES primary runner.
 * Falls back to the first primary cell when no target is set.
 */
export function pickHeadlineCell(cells: PdfCell[], target: CampaignTarget | null): PdfCell | null {
  const primary = filterPrimaryEngineCells(cells);
  if (target?.engine) {
    const hit = primary.find((c) => c.engine === target.engine);
    if (hit) return hit;
    // Target engine with no cell yet: still prefer that engine's primary runner identity.
    const route = ROUTES[target.engine as Engine];
    if (route) {
      return {
        engine: target.engine,
        runner: route.primary.runner,
        won: null,
        prompts: null,
        rate: null,
        ciLow: null,
        ciHigh: null,
        draws: 0,
      };
    }
  }
  return primary[0] ?? null;
}

export type LeadershipPdfInputOpts = {
  organization: { name: string; isDemo: boolean };
  campaign: { name: string; topic: string };
  cells: PdfCell[];
  target: CampaignTarget | null;
  trendLabel: string | null;
  /** Prior comparable scan date (YYYY-MM-DD) for the McNemar trend line. */
  previousScanDate?: string | null;
  analystNote: LeadershipPdfInput["analystNote"];
  baselineDate: string | null;
  latestScan: LeadershipPdfInput["latestScan"];
  noMeasurementsYet?: boolean;
  includeAccuracy?: boolean;
  accuracyLine?: string | null;
};

/** Shared builder for the HTTP route and demo save script. */
export function leadershipPdfInputFromCells(opts: LeadershipPdfInputOpts): LeadershipPdfInput {
  const engines = filterPrimaryEngineCells(opts.cells);
  const headline = pickHeadlineCell(opts.cells, opts.target);
  return {
    organization: opts.organization,
    campaign: opts.campaign,
    headline,
    trendLabel: opts.trendLabel,
    previousScanDate: opts.previousScanDate ?? null,
    engines,
    analystNote: opts.analystNote,
    baselineDate: opts.baselineDate,
    target: opts.target,
    latestScan: opts.latestScan,
    includeAccuracy: opts.includeAccuracy ?? false,
    accuracyLine: opts.accuracyLine ?? null,
    noMeasurementsYet: opts.noMeasurementsYet ?? false,
  };
}

import type { Engine, Runner } from "@/lib/capture/types";
import type { SearchIndex } from "./indexes";

export type CellKey = {
  engine: Engine;
  runner: Runner;
  index: SearchIndex;
  regionId: string | null;
  personaId: string | null;
  /** Audience group key when this is a group-level cell. Null for overall or specific-persona cells. */
  personaGroup: string | null;
  branded: boolean;
};

export type IntervalMethod = "wilson" | "cluster_bootstrap" | "paired_bootstrap";

export type RateWithCi = {
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  numerator: number;
  n: number;
  method: IntervalMethod;
  tooFewDraws: boolean;
  /** True when the interval was replaced (e.g. zero-width bootstrap → Wilson). */
  approximate?: boolean;
};

export type PromptsWon = {
  won: number;
  prompts: number;
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  draws: number;
  method: "wilson";
  rule: string;
  tooFewDraws: boolean;
  /** True when n is under the too-few threshold; UI may label the Wilson interval approximate. */
  approximate?: boolean;
};

export type BootstrapResult = {
  estimate: number;
  ciLow: number;
  ciHigh: number;
};

export type ComparisonLabel = "significant improvement" | "significant decline" | "within noise";
export type ComparisonDirection = "improvement" | "decline" | "none";

export type McNemarInput = {
  b: number;
  c: number;
};

export type McNemarResult = {
  pValue: number;
  label: ComparisonLabel;
  direction: ComparisonDirection;
  discordant: number;
};

export type PromptDraws<T> = {
  promptId: string;
  draws: T[];
};

export type PairedPrompt = {
  before: boolean[];
  after: boolean[];
};

export type PairedDifference = BootstrapResult & {
  prompts: number;
  drawsBefore: number;
  drawsAfter: number;
};

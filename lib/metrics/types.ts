import type { Engine, Runner } from "@/lib/capture/types";
import type { SearchIndex } from "./indexes";

export type CellKey = {
  engine: Engine;
  runner: Runner;
  index: SearchIndex;
  regionId: string | null;
  personaId: string | null;
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

/**
 * KPI badge mapping for Overview / Visibility.
 * - Prompts won, Citation rate, Share of voice: significant | within noise | no previous scan
 * - "Needs review" is reserved for Accuracy issues only (handled by the Accuracy card).
 * Green / gain styling only for significant improvement.
 */
export type KpiStatusTone = "gain" | "noise" | "decline" | "none";

export type KpiStatus = {
  tone: KpiStatusTone;
  label: string;
  showPositiveDelta: boolean;
};

export type RateKpiKind = "prompts_won" | "citation_rate" | "share_of_voice";

export function kpiStatusFromComparison(
  label: string | null | undefined,
  opts?: { kind?: RateKpiKind },
): KpiStatus {
  void opts; // kind reserved for future per-metric copy; mapping is shared today
  if (label == null || label === "") {
    return { tone: "none", label: "No previous scan", showPositiveDelta: false };
  }
  if (label === "significant improvement") {
    return { tone: "gain", label: "significant", showPositiveDelta: true };
  }
  if (label === "significant decline") {
    return { tone: "decline", label: "significant", showPositiveDelta: false };
  }
  if (label === "within noise") {
    return { tone: "noise", label: "≈ within noise", showPositiveDelta: false };
  }
  return { tone: "noise", label: "≈ within noise", showPositiveDelta: false };
}

/** Accuracy issues only. Never use for prompts won / citation / SoV. */
export function accuracyKpiBadge(issues: number): { tone: "decline" | "noise"; label: string } {
  if (issues > 0) return { tone: "decline", label: "Needs review" };
  return { tone: "noise", label: "None open" };
}

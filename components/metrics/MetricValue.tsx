"use client";

import type { ReactNode } from "react";
import { displayableFromPromptsWon, displayableFromRate, type DisplayableDecision } from "@/lib/metrics/displayable";
import type { PromptsWon, RateWithCi } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";

/** Trend/API slice with enough fields for displayable + formatting. */
export type PromptsWonMetricSlice = Pick<
  PromptsWon,
  "won" | "prompts" | "draws" | "rate" | "ciLow" | "ciHigh" | "tooFewDraws" | "tooFewPrompts"
>;

export type MetricValueInput = RateWithCi | PromptsWon | PromptsWonMetricSlice;

function isPromptsWonShape(v: MetricValueInput): v is PromptsWon | PromptsWonMetricSlice {
  return "won" in v && "draws" in v && !("numerator" in v);
}

function pct(x: number | null | undefined, digits = 1): string {
  return x == null ? "unknown" : `${(x * 100).toFixed(digits)}%`;
}

/** One line for editors when showRaw — not asserted as reliable. */
export function formatMetricRaw(value: MetricValueInput): string {
  if (isPromptsWonShape(value)) {
    const w = value;
    return `${w.won} of ${w.prompts} prompts (${pct(w.rate)}), n=${w.draws} draws`;
  }
  const r = value;
  if (r.rate === null) return `unknown (n=${r.n})`;
  const ci =
    r.ciLow != null && r.ciHigh != null && r.ciLow !== r.ciHigh
      ? `; 95% CI ${pct(r.ciLow)} to ${pct(r.ciHigh)}`
      : "";
  return `${pct(r.rate)} of ${r.n}${ci}`;
}

export type MetricValueProps = {
  value: MetricValueInput;
  showRaw?: boolean;
  canShowRaw?: boolean;
  /** Muted styling (e.g. too-few draws cell). */
  grey?: boolean;
  className?: string;
  /** Extra content when kind === show (e.g. accuracy "no claims"). */
  children?: ReactNode;
};

function metricKind(dec: DisplayableDecision): string {
  if (dec.kind === "show") return "show";
  return dec.kind;
}

export function MetricValue({
  value,
  showRaw = false,
  canShowRaw = false,
  grey,
  className,
  children,
}: MetricValueProps) {
  const dec = isPromptsWonShape(value) ? displayableFromPromptsWon(value) : displayableFromRate(value);
  const muted = grey ? "text-uncc-ink/50" : "text-uncc-ink/70";

  if (dec.kind !== "show") {
    return (
      <span className={cn(className)} data-testid="metric-suppressed" data-metric-kind={metricKind(dec)}>
        {dec.message}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs text-uncc-ink/50">Raw (not reliable): {formatMetricRaw(value)}</span>
        ) : null}
      </span>
    );
  }

  if (isPromptsWonShape(value)) {
    const w = value;
    const zeroWidth = w.ciLow !== null && w.ciHigh !== null && w.ciLow === w.ciHigh;
    if (zeroWidth) {
      return (
        <span className={cn(className)} data-testid="metric-suppressed" data-metric-kind="too_few_answers">
          {`Too few answers (n=${w.draws})`}
          {canShowRaw && showRaw ? (
            <span className="mt-0.5 block text-xs text-uncc-ink/50">Raw (not reliable): {formatMetricRaw(value)}</span>
          ) : null}
        </span>
      );
    }
    return (
      <span className={cn(className, muted)} data-testid="metric-visible" data-metric-kind="show">
        {w.won} of {w.prompts} ({pct(w.rate)})
        {w.ciLow !== null && w.ciHigh !== null && w.ciLow !== w.ciHigh ? (
          <span className="text-xs text-uncc-ink/60"> (95% CI {pct(w.ciLow)} to {pct(w.ciHigh)})</span>
        ) : null}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs text-uncc-ink/50">Raw (not reliable): {formatMetricRaw(value)}</span>
        ) : null}
      </span>
    );
  }

  const r = value;
  if (r.rate === null) {
    return (
      <span className={cn(className, muted)} data-testid="metric-unknown-rate">
        unknown (n={r.n})
        {children}
      </span>
    );
  }
  const zeroWidth = r.ciLow !== null && r.ciHigh !== null && r.ciLow === r.ciHigh;
  if (zeroWidth) {
    return (
      <span className={cn(className)} data-testid="metric-suppressed" data-metric-kind="too_few_answers">
        {`Too few answers (n=${r.n})`}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs text-uncc-ink/50">Raw (not reliable): {formatMetricRaw(r)}</span>
        ) : null}
        {children}
      </span>
    );
  }

  const ci = r.ciLow !== null && r.ciHigh !== null ? `${pct(r.ciLow)} to ${pct(r.ciHigh)}` : "interval unknown";
  const approx = r.approximate ? " approximate" : "";
  return (
    <span className={cn(className, grey || r.tooFewDraws ? muted : "")} data-testid="metric-visible" data-metric-kind="show">
      {pct(r.rate)}{" "}
      <span className="text-xs text-uncc-ink/60">
        ({ci}
        {approx}, n={r.n})
      </span>
      {canShowRaw && showRaw ? (
        <span className="mt-0.5 block text-xs text-uncc-ink/50">Raw (not reliable): {formatMetricRaw(r)}</span>
      ) : null}
      {children}
    </span>
  );
}

/** Overview / Scout-styled rates (Tailwind scout tokens). */
export function MetricValueScout({
  value,
  showRaw = false,
  canShowRaw = false,
  grey,
  className,
  children,
}: MetricValueProps) {
  const dec = isPromptsWonShape(value) ? displayableFromPromptsWon(value) : displayableFromRate(value);
  const baseMuted = grey ? "text-scout-muted" : "";

  if (dec.kind !== "show") {
    return (
      <span className={cn(className, baseMuted)} data-testid="metric-suppressed" data-metric-kind={metricKind(dec)}>
        {dec.message}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs opacity-80">Raw (not reliable): {formatMetricRaw(value)}</span>
        ) : null}
      </span>
    );
  }

  if (isPromptsWonShape(value)) {
    const w = value;
    const zeroWidth = w.ciLow !== null && w.ciHigh !== null && w.ciLow === w.ciHigh;
    if (zeroWidth) {
      return (
        <span className={cn(className)} data-testid="metric-suppressed" data-metric-kind="too_few_answers">
          {`Too few answers (n=${w.draws})`}
          {canShowRaw && showRaw ? (
            <span className="mt-0.5 block text-xs opacity-80">Raw (not reliable): {formatMetricRaw(value)}</span>
          ) : null}
        </span>
      );
    }
    return (
      <span className={cn(className, "text-scout-text", baseMuted)} data-testid="metric-visible" data-metric-kind="show">
        {w.won} of {w.prompts} ({pct(w.rate)})
        {w.ciLow !== null && w.ciHigh !== null && w.ciLow !== w.ciHigh ? (
          <span className="text-xs text-scout-muted"> (95% CI {pct(w.ciLow)} to {pct(w.ciHigh)})</span>
        ) : null}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs text-scout-muted">Raw (not reliable): {formatMetricRaw(value)}</span>
        ) : null}
      </span>
    );
  }

  const r = value;
  if (r.rate === null) {
    return (
      <span className={cn(className, "text-scout-muted")} data-testid="metric-unknown-rate">
        unknown (n={r.n})
        {children}
      </span>
    );
  }
  const zeroWidth = r.ciLow !== null && r.ciHigh !== null && r.ciLow === r.ciHigh;
  if (zeroWidth) {
    return (
      <span className={cn(className)} data-testid="metric-suppressed" data-metric-kind="too_few_answers">
        {`Too few answers (n=${r.n})`}
        {canShowRaw && showRaw ? (
          <span className="mt-0.5 block text-xs text-scout-muted">Raw (not reliable): {formatMetricRaw(r)}</span>
        ) : null}
        {children}
      </span>
    );
  }

  const ci = r.ciLow !== null && r.ciHigh !== null ? `${pct(r.ciLow)} to ${pct(r.ciHigh)}` : "interval unknown";
  const approx = r.approximate ? " approximate" : "";
  return (
    <span
      className={cn(className, grey || r.tooFewDraws ? "text-scout-muted" : "text-scout-text")}
      data-testid="metric-visible"
      data-metric-kind="show"
    >
      {pct(r.rate)}{" "}
      <span className="text-xs text-scout-muted">
        ({ci}
        {approx}, n={r.n})
      </span>
      {canShowRaw && showRaw ? (
        <span className="mt-0.5 block text-xs text-scout-muted">Raw (not reliable): {formatMetricRaw(r)}</span>
      ) : null}
      {children}
    </span>
  );
}

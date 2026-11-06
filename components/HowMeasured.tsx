"use client";

import { useId, useState } from "react";
import { answersChecked, enginePlain, fidelityPlain, formatScanDate, runnerPlain, shortHash } from "@/lib/ui/labels";

export type MeasurementContext = {
  engine?: string;
  runner?: string;
  fidelity?: string;
  n?: number;
  scanDate?: string | null;
  promptSetHash?: string | null;
  brandedSeparate?: boolean;
  legacyMethod?: boolean;
  extra?: string;
};

/**
 * Plain-language “How this is measured” disclosure. Every leadership chart should include one.
 */
export function HowMeasured({ context, className = "" }: { context: MeasurementContext; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={`how-measured ${className}`}>
      <button
        type="button"
        className="text-sm font-semibold text-[#005035] underline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        How this is measured
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="How this is measured"
          className="mt-2 rounded border border-uncc-rule bg-uncc-mist/40 p-3 text-sm text-uncc-ink/80"
        >
          <ul className="list-disc space-y-1 pl-5">
            {context.engine ? <li>Engine: {enginePlain(context.engine)}</li> : null}
            {context.runner ? (
              <li>
                How answers were collected: {runnerPlain(context.runner)}
                <span className="text-uncc-ink/50"> (technical id: {context.runner})</span>
              </li>
            ) : null}
            {context.fidelity ? (
              <li>
                How close this is to what people see: {fidelityPlain(context.fidelity)}
                <span className="text-uncc-ink/50"> ({context.fidelity})</span>
              </li>
            ) : null}
            {typeof context.n === "number" ? <li>Sample size: {answersChecked(context.n)}</li> : null}
            {context.scanDate ? <li>Scan date: {formatScanDate(context.scanDate)}</li> : null}
            {context.promptSetHash ? (
              <li>Frozen question set: {shortHash(context.promptSetHash)}…</li>
            ) : null}
            {context.brandedSeparate !== false ? (
              <li>Questions that name UNC Charlotte are kept in a separate series and never mixed into this headline.</li>
            ) : null}
            {context.legacyMethod ? (
              <li>
                <strong>Legacy method.</strong> This scan used an earlier capture path. Treat it as historical, not as
                the current measurement standard.
              </li>
            ) : null}
            {context.extra ? <li>{context.extra}</li> : null}
            <li>Chat engines and Google AI surfaces are never averaged together.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Caption line under every chart: n, runner, fidelity, scan date, short prompt-set hash. */
export function ChartCaption({ context }: { context: MeasurementContext }) {
  const parts = [
    typeof context.n === "number" ? answersChecked(context.n) : null,
    context.runner ? runnerPlain(context.runner) : null,
    context.fidelity ? fidelityPlain(context.fidelity) : null,
    context.scanDate ? formatScanDate(context.scanDate) : null,
    context.promptSetHash ? `set ${shortHash(context.promptSetHash)}` : null,
    context.legacyMethod ? "legacy method" : null,
  ].filter(Boolean);
  return (
    <p className="mt-1 text-xs text-uncc-ink/60" data-testid="chart-caption">
      {parts.join(" · ") || "Measurement details unavailable"}
    </p>
  );
}

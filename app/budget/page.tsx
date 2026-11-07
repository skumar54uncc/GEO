"use client";

import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";
import { Badge } from "@/components/ui/card";

type Funding = {
  organization: { id: string; name: string; isDemo: boolean };
  pricesVerifiedOn: string;
  upperEstimateLabel: string;
  dataforseoMinTopUpUsd: number;
  stopLoss: {
    firstDrawWindow: number;
    errorOrBlockedRateThreshold: number;
    estimateCostOverrunThreshold: number;
  };
  vendorComparison: Array<{ vendor: string; price: string; scope: string; sourceUrl: string; sourceDate: string }>;
  pilot: {
    campaign: string | null;
    prompts: number;
    draftPrompts: number;
    basedOnDrafts: boolean;
    engines: number;
    drawsPerPrompt: number;
    totalDraws: number;
    usdUpper: number | null;
    note: string;
  };
  steadyState: {
    coreBiweeklyDraws: number;
    coreUsdPerMonth: number | null;
    personaQuarterlyDraws: number;
    personaQuarterlyUsd: number | null;
    personaUsdPerMonth: number | null;
    totalUsdPerMonth: number | null;
    totalUsdPerYear: number | null;
    note: string;
    basedOnDrafts: boolean;
  };
  platformSummary: { monthlyUsd: number | null; yearlyUsd: number | null };
  providers: Array<{
    provider: string;
    displayName: string;
    role: string;
    roleLabel: string;
    monthlyBudgetUsd: number | null;
    perScanCapUsd: number | null;
    creditsRemaining: number | null;
    spentThisMonthUsd: number;
    pilotShareUsd: number | null;
    monthlyShareUsd: number | null;
    estimateExceedsCap: boolean;
    capWarning: string | null;
  }>;
  capWarnings: string[];
  spendToDateUsd: number;
};

const money = (n: number | null) => (n === null ? "unknown" : `$${n.toFixed(2)}`);

export default function BudgetPage() {
  const [data, setData] = useState<Funding | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/budget", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Budget · Scout";
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading budget estimates…" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle
            title="Budget & Funding"
            subtitle="Pilot and steady-state estimates from the estimator (unknown stays unknown)."
          />
          <p className="mt-1 text-sm italic text-scout-muted">{data.upperEstimateLabel}</p>
        </div>
        <a
          className="inline-flex h-9 items-center rounded border border-scout-border bg-scout-card px-3 text-sm font-semibold text-scout-text shadow-scout"
          href="/api/budget/pdf"
          target="_blank"
          rel="noreferrer"
          data-testid="budget-pdf-export"
        >
          Export one-page PDF
        </a>
      </header>

      <HowMeasured
        context={{
          extra:
            "Upper-bound adapter estimates for Charlotte on primary routes only. Fallback, calibration, and parity providers are $0 unless scheduled. Not approvals and not spent.",
          n: data.pilot.totalDraws,
        }}
      />

      {data.capWarnings.length ? (
        <div className="rounded border border-amber-700/40 bg-amber-50 p-4 text-sm" role="status" data-testid="budget-cap-warnings">
          <p className="font-semibold text-amber-950">Estimate exceeds a provider cap</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950">
            {data.capWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ScoutCard>
        <h2 id="pilot-title" className="text-scout-card text-scout-text">
          Pilot estimate (Energy core)
        </h2>
        {data.pilot.prompts === 0 ? (
          <EmptyState title="No Energy core prompts to estimate">
            <p>{data.pilot.note}</p>
          </EmptyState>
        ) : (
          <>
            <p className="mt-2 text-sm">
              Campaign: <strong>{data.pilot.campaign}</strong> · {data.pilot.prompts} prompts · {data.pilot.engines}{" "}
              engines · {data.pilot.drawsPerPrompt} answers each · {data.pilot.totalDraws} AI answers checked
            </p>
            {data.pilot.basedOnDrafts ? (
              <p className="mt-2 text-sm font-medium text-amber-950" data-testid="pilot-draft-label">
                based on {data.pilot.draftPrompts} draft prompts, pending approval
              </p>
            ) : null}
            <p className="mt-2 font-serif text-2xl">
              {money(data.pilot.usdUpper)}{" "}
              <span className="text-sm font-sans italic text-uncc-ink/70">({data.upperEstimateLabel})</span>
            </p>
            <p className="mt-1 text-xs text-uncc-ink/60">{data.pilot.note}</p>
          </>
        )}
      </ScoutCard>

      <ScoutCard>
        <h2 id="steady-title" className="text-scout-card text-scout-text">
          Steady state (all 3 campaigns)
        </h2>
        {data.steadyState.basedOnDrafts ? (
          <p className="mt-2 text-sm font-medium text-amber-950">
            Includes draft prompts pending approval where a series has no approved prompts.
          </p>
        ) : null}
        <ul className="mt-3 space-y-1 text-sm" data-testid="steady-state-lines">
          <li>
            Core $/mo: <strong>{money(data.steadyState.coreUsdPerMonth)}</strong>
          </li>
          <li>
            Persona $/mo (quarterly run ÷ 3): <strong>{money(data.steadyState.personaUsdPerMonth)}</strong>{" "}
            <span className="text-uncc-ink/60">(full quarterly run {money(data.steadyState.personaQuarterlyUsd)})</span>
          </li>
          <li>
            Total $/mo: <strong>{money(data.steadyState.totalUsdPerMonth)}</strong>
          </li>
          <li>
            Total $/yr: <strong>{money(data.steadyState.totalUsdPerYear)}</strong>
          </li>
        </ul>
        <p className="mt-2 text-xs italic text-uncc-ink/60">
          {data.upperEstimateLabel}. {data.steadyState.note}
        </p>
      </ScoutCard>

      <ScoutCard>
        <h2 id="spend-title" className="text-scout-card text-scout-text">
          Spend, caps, and DataForSEO top-up
        </h2>
        <p className="mt-2 text-sm">
          Spend recorded to date: <strong>{money(data.spendToDateUsd)}</strong>. DataForSEO minimum top-up:{" "}
          <strong>${data.dataforseoMinTopUpUsd}</strong> ({data.upperEstimateLabel.split(",")[0]} context; verify on
          account).
        </p>
        <table className="mt-3 w-full text-left text-sm" data-testid="budget-providers">
          <caption className="sr-only">Provider spend and caps</caption>
          <thead className="bg-scout-page text-xs uppercase text-scout-muted">
            <tr>
              <th className="py-1">Provider</th>
              <th>Role</th>
              <th>Pilot share</th>
              <th>Monthly share</th>
              <th>Spent this month</th>
              <th>Monthly cap</th>
              <th>Per-scan cap</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.map((p) => (
              <tr key={p.provider} className={`border-t border-uncc-rule/60 ${p.estimateExceedsCap ? "bg-amber-50" : ""}`}>
                <td className="py-1.5 font-medium">{p.displayName}</td>
                <td>
                  <Badge tone={p.role === "blocked" ? "gold" : p.role === "active" ? "green" : "muted"}>{p.roleLabel}</Badge>
                </td>
                <td>{money(p.pilotShareUsd)}</td>
                <td>{money(p.monthlyShareUsd)}</td>
                <td>{money(p.spentThisMonthUsd)}</td>
                <td>{money(p.monthlyBudgetUsd)}</td>
                <td>{money(p.perScanCapUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScoutCard>

      <ScoutCard>
        <h2 id="stoploss-title" className="text-scout-card text-scout-text">
          Stop-loss
        </h2>
        <p className="mt-2 text-sm">
          A paid scan pauses automatically if more than {data.stopLoss.errorOrBlockedRateThreshold * 100}% of the first{" "}
          {data.stopLoss.firstDrawWindow} AI answers come back as errors or blocked, or if actual cost runs more than{" "}
          {data.stopLoss.estimateCostOverrunThreshold * 100}% over the estimate.
        </p>
      </ScoutCard>

      <ScoutCard>
        <h2 id="vendor-title" className="text-scout-card text-scout-text">
          Vendor comparison
        </h2>
        <p className="mt-1 text-xs text-uncc-ink/60">
          Vendor figures below are checked against each vendor&apos;s public pricing pages. Last verification pass:{" "}
          {data.pricesVerifiedOn} (see source links in the table).
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Vendor price anchors</caption>
          <thead className="bg-scout-page text-xs uppercase text-scout-muted">
            <tr>
              <th className="py-1">Vendor</th>
              <th>Price</th>
              <th>Scope</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-uncc-rule/60 bg-uncc-mist/40 font-medium" data-testid="platform-summary-row">
              <td className="py-1.5">This platform, upper estimate</td>
              <td>
                {money(data.platformSummary.monthlyUsd)}/mo, {money(data.platformSummary.yearlyUsd)}/yr
              </td>
              <td className="text-uncc-ink/80">Primary routes only</td>
              <td className="text-xs text-uncc-ink/60">{data.upperEstimateLabel}</td>
            </tr>
            {data.vendorComparison.map((v) => (
              <tr key={v.vendor} className="border-t border-uncc-rule/60 align-top">
                <td className="py-1.5">{v.vendor}</td>
                <td>{v.price}</td>
                <td className="max-w-xs text-uncc-ink/80">{v.scope}</td>
                <td>
                  <a className="underline" href={v.sourceUrl} target="_blank" rel="noreferrer">
                    source
                  </a>{" "}
                  <span className="text-xs text-uncc-ink/60">({v.sourceDate})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScoutCard>
    </div>
  );
}

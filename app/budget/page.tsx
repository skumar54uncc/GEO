"use client";

import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";

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
    engines: number;
    drawsPerPrompt: number;
    totalDraws: number;
    usdUpper: number | null;
    note: string;
  };
  steadyState: {
    coreBiweeklyDraws: number;
    coreBiweeklyUsdUpper: number | null;
    personaQuarterlyDraws: number;
    personaQuarterlyUsdUpper: number | null;
    monthlyUsdUpper: number | null;
    note: string;
  };
  providers: Array<{
    provider: string;
    monthlyBudgetUsd: number | null;
    perScanCapUsd: number | null;
    creditsRemaining: number | null;
    spentThisMonthUsd: number;
  }>;
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

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading budget estimates…" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Budget</p>
          <h1 className="font-serif text-3xl font-semibold">Budget &amp; Funding</h1>
          <p className="mt-2 max-w-2xl text-uncc-ink/75">
            Pilot and steady-state costs come from the estimator. Unknown prices stay unknown — never treated as zero.
          </p>
          <p className="mt-1 text-sm italic text-uncc-ink/70">{data.upperEstimateLabel}</p>
        </div>
        <a
          className="inline-flex h-9 items-center rounded border border-uncc-rule bg-white px-3 text-sm font-semibold"
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
            "These are upper-bound adapter estimates for Charlotte, primary routes only. They are not approvals and have not been spent.",
          n: data.pilot.totalDraws,
        }}
      />

      <section className="rounded border border-uncc-rule bg-white p-5" aria-labelledby="pilot-title">
        <h2 id="pilot-title" className="font-serif text-xl font-semibold">
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
            <p className="mt-2 font-serif text-2xl">
              {money(data.pilot.usdUpper)}{" "}
              <span className="text-sm font-sans italic text-uncc-ink/70">({data.upperEstimateLabel})</span>
            </p>
            <p className="mt-1 text-xs text-uncc-ink/60">{data.pilot.note}</p>
          </>
        )}
      </section>

      <section className="rounded border border-uncc-rule bg-white p-5" aria-labelledby="steady-title">
        <h2 id="steady-title" className="font-serif text-xl font-semibold">
          Steady state (all 3 campaigns)
        </h2>
        <p className="mt-2 text-sm">
          Core biweekly: {data.steadyState.coreBiweeklyDraws} AI answers / month →{" "}
          <strong>{money(data.steadyState.coreBiweeklyUsdUpper)}</strong>
        </p>
        <p className="text-sm">
          Persona quarterly (monthly share): full run {money(data.steadyState.personaQuarterlyUsdUpper)} → monthly{" "}
          <strong>{money(data.steadyState.monthlyUsdUpper)}</strong>
        </p>
        <p className="mt-1 text-xs italic text-uncc-ink/60">
          {data.upperEstimateLabel}. {data.steadyState.note}
        </p>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-5" aria-labelledby="spend-title">
        <h2 id="spend-title" className="font-serif text-xl font-semibold">
          Spend, caps, and DataForSEO top-up
        </h2>
        <p className="mt-2 text-sm">
          Spend recorded to date: <strong>{money(data.spendToDateUsd)}</strong>. DataForSEO minimum top-up:{" "}
          <strong>${data.dataforseoMinTopUpUsd}</strong> ({data.upperEstimateLabel.split(",")[0]} context; verify on
          account).
        </p>
        {data.providers.length === 0 ? (
          <p className="mt-3 text-sm text-uncc-ink/70">No provider accounts configured yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Provider spend and caps</caption>
            <thead className="text-xs uppercase text-uncc-ink/60">
              <tr>
                <th className="py-1">Provider</th>
                <th>Spent this month</th>
                <th>Monthly cap</th>
                <th>Per-scan cap</th>
                <th>Credits left</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((p) => (
                <tr key={p.provider} className="border-t border-uncc-rule/60">
                  <td className="py-1.5">{p.provider}</td>
                  <td>{money(p.spentThisMonthUsd)}</td>
                  <td>{money(p.monthlyBudgetUsd)}</td>
                  <td>{money(p.perScanCapUsd)}</td>
                  <td>{p.creditsRemaining ?? "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded border border-uncc-rule bg-white p-5" aria-labelledby="stoploss-title">
        <h2 id="stoploss-title" className="font-serif text-xl font-semibold">
          Stop-loss
        </h2>
        <p className="mt-2 text-sm">
          A paid scan pauses automatically if more than {data.stopLoss.errorOrBlockedRateThreshold * 100}% of the first{" "}
          {data.stopLoss.firstDrawWindow} AI answers come back as errors or blocked, or if actual cost runs more than{" "}
          {data.stopLoss.estimateCostOverrunThreshold * 100}% over the estimate.
        </p>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-5" aria-labelledby="vendor-title">
        <h2 id="vendor-title" className="font-serif text-xl font-semibold">
          Vendor comparison
        </h2>
        <p className="mt-1 text-xs text-uncc-ink/60">
          From COMPETITOR_MATRIX §5. Source material captured 2026-10-14. Prices verified on provider pages as of{" "}
          {data.pricesVerifiedOn} where noted in PROVIDERS.md.
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Vendor price anchors</caption>
          <thead className="text-xs uppercase text-uncc-ink/60">
            <tr>
              <th className="py-1">Vendor</th>
              <th>Price</th>
              <th>Scope</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {data.vendorComparison.map((v) => (
              <tr key={v.vendor} className="border-t border-uncc-rule/60">
                <td className="py-1.5">{v.vendor}</td>
                <td>{v.price}</td>
                <td>{v.scope}</td>
                <td>
                  <a className="text-uncc-green underline" href={v.sourceUrl} target="_blank" rel="noreferrer">
                    source
                  </a>{" "}
                  ({v.sourceDate})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

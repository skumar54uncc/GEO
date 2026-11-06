"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState, PartialDataNotice } from "@/components/PageStates";
import { fidelityFor } from "@/lib/capture/types";
import { ENGINE_INDEX } from "@/lib/metrics/indexes";
import { enginePlain, runnerPlain } from "@/lib/ui/labels";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity", "google_aio", "google_ai_mode"] as const;
const RUNNERS = ["ui_provider", "serp_provider", "api_search", "api_parametric", "manual_paste"] as const;

type Aggregates = {
  topDomains: Array<{ domain: string; citations: number; n: number; rate: number | null; ciLow: number | null; ciHigh: number | null }>;
  sourceClassMix: Array<{ sourceClass: string; citations: number; n: number; rate: number | null }>;
  ownedPages?: Array<{ url: string; n: number }>;
  draws: number;
  scanId?: string | null;
};

export default function CitationsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [engine, setEngine] = useState<(typeof ENGINES)[number]>("chatgpt");
  const [runner, setRunner] = useState<(typeof RUNNERS)[number]>("ui_provider");
  const [data, setData] = useState<Aggregates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fidelity = fidelityFor(runner);
  const index = ENGINE_INDEX[engine];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        campaign_id: campaignId,
        engine,
        runner,
        fidelity,
        index,
      });
      const res = await fetch(`/api/citations/aggregates?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId, engine, runner, fidelity, index]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
          <Link href={`/campaigns/${campaignId}/dashboard`} className="underline">
            Campaign
          </Link>{" "}
          · Citations &amp; Off-site
        </p>
        <h1 className="font-serif text-3xl font-semibold">Citations &amp; Off-site</h1>
        <p className="mt-2 max-w-2xl text-sm text-uncc-ink/75">
          Top cited domains and source types for one engine and collection method at a time. Chat engines and Google
          surfaces are never mixed.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <label>
          Engine{" "}
          <select className="ml-1 h-9 rounded border border-uncc-rule px-2" value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)}>
            {ENGINES.map((e) => (
              <option key={e} value={e}>
                {enginePlain(e)}
              </option>
            ))}
          </select>
        </label>
        <label>
          How collected{" "}
          <select className="ml-1 h-9 rounded border border-uncc-rule px-2" value={runner} onChange={(e) => setRunner(e.target.value as typeof runner)}>
            {RUNNERS.map((r) => (
              <option key={r} value={r}>
                {runnerPlain(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && data && data.draws === 0 ? (
        <EmptyState title="No citations in this selection">
          <p>Try another engine or collection method, or wait until a scan has judged answers.</p>
        </EmptyState>
      ) : null}

      {!loading && !error && data && data.draws > 0 ? (
        <>
          <PartialDataNotice>
            Showing {enginePlain(engine)} only, {runnerPlain(runner)}. Index: {index}.
          </PartialDataNotice>
          <ChartCaption context={{ engine, runner, fidelity, n: data.draws }} />
          <HowMeasured context={{ engine, runner, fidelity, n: data.draws }} />

          <section className="rounded border border-uncc-rule bg-white p-4">
            <h2 className="font-serif text-lg font-semibold">Top cited domains</h2>
            <table className="mt-2 w-full text-left text-sm">
              <caption className="sr-only">Top cited domains with counts</caption>
              <thead className="text-xs uppercase text-uncc-ink/60">
                <tr>
                  <th className="py-1">Domain</th>
                  <th>Citations</th>
                  <th>n</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {(data.topDomains ?? []).map((d) => (
                  <tr key={d.domain} className="border-t border-uncc-rule/60">
                    <td className="py-1.5">{d.domain}</td>
                    <td>{d.citations}</td>
                    <td>{d.n}</td>
                    <td>{d.rate === null ? "unknown" : `${(d.rate * 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded border border-uncc-rule bg-white p-4">
            <h2 className="font-serif text-lg font-semibold">Source types</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(data.sourceClassMix ?? []).map((s) => (
                <li key={s.sourceClass}>
                  <span className="font-mono text-xs">{s.sourceClass}</span>: {s.citations} citations (n={s.n})
                  {s.rate !== null ? ` · ${(s.rate * 100).toFixed(1)}%` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

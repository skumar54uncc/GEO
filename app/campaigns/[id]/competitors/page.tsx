"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { MetricValue } from "@/components/metrics/MetricValue";
import { ShowRawToggle } from "@/components/metrics/ShowRawToggle";
import { useMetricShowRaw } from "@/components/metrics/ShowRawContext";
import { useSessionRole } from "@/components/SessionRoleContext";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";
import { fidelityFor } from "@/lib/capture/types";
import type { CellRollup } from "@/lib/metrics/rollup";
import { enginePlain, formatScanDate, runnerPlain } from "@/lib/ui/labels";

type Dashboard = {
  campaign: { id: string; name: string; topic: string };
  promptSets: Array<{
    version: number;
    sha256: string | null;
    latestScan: { createdAt: string };
    rollup: { cells: CellRollup[] };
  }>;
};

export default function CompetitorsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/dashboard`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as Dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Competitors · Scout";
  }, []);

  const { showRaw } = useMetricShowRaw();
  const role = useSessionRole();
  const canShowRaw = role === "editor" || role === "admin";

  const view = data?.promptSets[0];
  const rows = useMemo(() => {
    if (!view) return [];
    return view.rollup.cells.filter(
      (c) =>
        !c.key.branded &&
        c.key.regionId == null &&
        c.key.personaId == null &&
        c.key.personaGroup == null,
    );
  }, [view]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading competitors…" />;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-scout-muted">
          <Link href={`/campaigns/${campaignId}/dashboard`} className="underline">
            Campaign
          </Link>{" "}
          · Competitors
        </p>
        <PageTitle
          title="Competitors"
          subtitle={
            view
              ? `${data.campaign.name} · prompt set v${view.version} · latest scan ${formatScanDate(view.latestScan.createdAt)}`
              : data.campaign.name
          }
        />
        <p className="max-w-2xl text-sm text-scout-muted">
          Share of voice from the latest rollup: brand mentions versus distinct competitor entities named in the same AI
          answers. See{" "}
          <Link href={`/campaigns/${campaignId}/citations`} className="font-medium text-scout-brand underline">
            Citations
          </Link>{" "}
          for domains and source types.
        </p>
      </header>

      {!view ? (
        <EmptyState title="No finished scans yet">
          <p>Freeze a question set and run a measured scan. We never invent placeholder scores.</p>
        </EmptyState>
      ) : (
        <>
          {rows[0] ? (
            <div className="flex flex-wrap items-center gap-3">
              <HowMeasured
                context={{
                  engine: rows[0].key.engine,
                  runner: rows[0].key.runner,
                  fidelity: fidelityFor(rows[0].key.runner),
                  n: rows[0].shareOfVoice.n,
                  scanDate: view.latestScan.createdAt,
                  promptSetHash: view.sha256,
                  extra:
                    "Share of voice uses cluster bootstrap over prompts; n counts brand and competitor mention events in the cell. Same disclosure applies to every row in the table.",
                }}
              />
              <ShowRawToggle />
            </div>
          ) : null}
          <ScoutCard>
            <div className="w-full overflow-x-auto rounded-[12px] border border-scout-border">
              <table className="w-full min-w-[640px] text-left text-sm" data-testid="competitors-sov-table">
                <caption className="sr-only">
                  Share of voice by engine and collection method, location-neutral prompts only
                </caption>
                <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
                  <tr className="border-b border-scout-border">
                    <th className="px-3 py-2.5">Engine · how collected</th>
                    <th className="px-3 py-2.5">Share of voice</th>
                    <th className="px-3 py-2.5">
                      <span className="text-scout-brand">That&apos;s us</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-scout-muted">
                        No overall cells in this rollup yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((c) => {
                      const fidelity = fidelityFor(c.key.runner);
                      return (
                        <tr
                          key={`${c.key.engine}|${c.key.runner}`}
                          className={`border-b border-scout-border align-top ${c.tooFewDraws ? "text-scout-muted/80" : ""}`}
                        >
                          <td className="px-3 py-2">
                            {enginePlain(c.key.engine)} · {runnerPlain(c.key.runner)}
                            <div className="text-xs text-scout-muted">{c.key.index} index</div>
                            <ChartCaption
                              context={{
                                engine: c.key.engine,
                                runner: c.key.runner,
                                fidelity,
                                n: c.shareOfVoice.n,
                                scanDate: view.latestScan.createdAt,
                                promptSetHash: view.sha256,
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <MetricValue value={c.shareOfVoice} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                          </td>
                          <td className="px-3 py-2 text-scout-brand">That&apos;s us</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </ScoutCard>
        </>
      )}
    </div>
  );
}

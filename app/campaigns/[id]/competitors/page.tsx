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
import { PageTitle, ScoutCard, Segmented } from "@/components/scout/primitives";
import { fidelityFor } from "@/lib/capture/types";
import type { CompetitorIndexSeries } from "@/lib/metrics/competitorsTrend";
import type { CellRollup } from "@/lib/metrics/rollup";
import { safeHref } from "@/lib/url/safeHref";
import { enginePlain, formatScanDate, runnerPlain } from "@/lib/ui/labels";

type Dashboard = {
  campaign: { id: string; name: string; topic: string };
  peerAverageBenchmark?: { chat: number | null; google: number | null };
  competitorsByIndex?: CompetitorIndexSeries[];
  promptSets: Array<{
    version: number;
    sha256: string | null;
    latestScan: { createdAt: string };
    rollup: { cells: CellRollup[] };
    trend: Array<{ scanId: string; createdAt: string; isBaseline?: boolean }>;
  }>;
};

const pct = (x: number | null | undefined) => (x == null ? "unknown" : `${(x * 100).toFixed(0)}%`);

export default function CompetitorsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState<"chat" | "google">("chat");

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
  const series = useMemo(
    () => data?.competitorsByIndex?.find((s) => s.index === index) ?? null,
    [data, index],
  );

  const rows = useMemo(() => {
    if (!view) return [];
    return view.rollup.cells.filter(
      (c) =>
        !c.key.branded &&
        c.key.regionId == null &&
        c.key.personaId == null &&
        c.key.personaGroup == null &&
        (index === "chat"
          ? ["chatgpt", "gemini", "claude", "perplexity"].includes(c.key.engine)
          : ["google_aio", "google_ai_mode"].includes(c.key.engine)),
    );
  }, [view, index]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading competitors…" />;

  const peerAvg = data.peerAverageBenchmark?.[index] ?? series?.peerAverageBenchmark ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-scout-muted">
          <Link href={safeHref(`/campaigns/${campaignId}/dashboard`) ?? "/campaigns"} className="underline">
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
          Share of voice: us versus the top 3 peers named in the same AI answers, within one index (chat and Google are
          never pooled). Trend lines use each scan in this prompt set; the latest scan is a grouped comparison.
        </p>
      </header>

      {!view ? (
        <EmptyState title="No finished scans yet">
          <p>Freeze a question set and run a measured scan. We never invent placeholder scores.</p>
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={index}
              onChange={setIndex}
              options={[
                { value: "chat", label: "Chat index" },
                { value: "google", label: "Google index" },
              ]}
            />
            {rows[0] ? (
              <HowMeasured
                context={{
                  engine: rows[0].key.engine,
                  runner: rows[0].key.runner,
                  fidelity: fidelityFor(rows[0].key.runner),
                  n: rows[0].shareOfVoice.n,
                  scanDate: view.latestScan.createdAt,
                  promptSetHash: view.sha256,
                  extra:
                    "Share of voice uses distinct-entity draws within one index. Peer average is the mean of the top 3 competitor rates on the latest scan.",
                }}
              />
            ) : null}
            <ShowRawToggle />
          </div>

          {peerAvg != null ? (
            <p className="text-sm text-scout-muted" data-testid="peer-average-benchmark">
              Peer average (top 3): <span className="font-semibold text-scout-text">{pct(peerAvg)}</span>
            </p>
          ) : null}

          <ScoutCard>
            <h2 className="mb-2 text-base font-semibold text-scout-text">SoV trend (us vs top peers)</h2>
            {series && series.trend.length ? (
              <svg
                viewBox={`0 0 640 ${40 + series.trend.length * 48}`}
                width="100%"
                role="img"
                aria-label={`${index} share of voice trend`}
                data-testid="competitors-sov-trend"
              >
                {series.trend.map((t, i) => {
                  const y = 28 + i * 48;
                  const usW = Math.max(0, (t.usRate ?? 0) * 400);
                  const peerW = Math.max(0, (t.peerAverageRate ?? 0) * 400);
                  return (
                    <g key={t.scanId}>
                      <text x={8} y={y - 8} fontSize="11" fill="var(--text-muted)">
                        {formatScanDate(t.createdAt)}
                        {t.isBaseline ? " · Baseline" : ""}
                      </text>
                      <rect x={120} y={y - 4} width={usW} height={12} fill="var(--chart)" data-testid="sov-us-bar" />
                      <rect
                        x={120}
                        y={y + 12}
                        width={peerW}
                        height={12}
                        fill="var(--text-muted)"
                        opacity={0.45}
                        data-testid="sov-peer-bar"
                      />
                      <text x={530} y={y + 6} fontSize="11" fill="var(--text)">
                        us {pct(t.usRate)}
                      </text>
                      <text x={530} y={y + 22} fontSize="11" fill="var(--text-muted)">
                        peers {pct(t.peerAverageRate)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              <p className="text-sm text-scout-muted">No SoV trend points for this index yet.</p>
            )}
          </ScoutCard>

          <ScoutCard>
            <h2 className="mb-2 text-base font-semibold text-scout-text">Latest scan · grouped comparison</h2>
            <div className="w-full overflow-x-auto rounded-[12px] border border-scout-border">
              <table className="w-full min-w-[520px] text-left text-sm" data-testid="competitors-grouped-bars">
                <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
                  <tr className="border-b border-scout-border">
                    <th className="px-3 py-2.5">Institution</th>
                    <th className="px-3 py-2.5">Share</th>
                    <th className="px-3 py-2.5">Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {(series?.latestGrouped ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-scout-muted">
                        No institutions named in this index on the latest scan.
                      </td>
                    </tr>
                  ) : (
                    (series?.latestGrouped ?? []).map((r) => (
                      <tr key={r.entityId} className="border-b border-scout-border">
                        <td className="px-3 py-2">
                          {r.name}
                          {r.isUs ? <span className="ml-2 text-xs font-semibold text-scout-brand">That&apos;s us</span> : null}
                        </td>
                        <td className="px-3 py-2">{pct(r.rate)}</td>
                        <td className="px-3 py-2">
                          <div className="h-3 w-full max-w-[240px] rounded bg-scout-page">
                            <div
                              className="h-3 rounded"
                              style={{
                                width: `${Math.min(100, r.rate * 100)}%`,
                                background: r.isUs ? "var(--chart)" : "var(--text-muted)",
                                opacity: r.isUs ? 1 : 0.55,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ScoutCard>

          <ScoutCard>
            <h2 className="mb-2 text-base font-semibold text-scout-text">Engine × runner SoV (latest)</h2>
            <div className="w-full overflow-x-auto rounded-[12px] border border-scout-border">
              <table className="w-full min-w-[640px] text-left text-sm" data-testid="competitors-sov-table">
                <caption className="sr-only">
                  Share of voice by engine and collection method within the selected index
                </caption>
                <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
                  <tr className="border-b border-scout-border">
                    <th className="px-3 py-2.5">Engine · how collected</th>
                    <th className="px-3 py-2.5">Share of voice</th>
                    <th className="px-3 py-2.5">Peer average</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-scout-muted">
                        No overall cells in this index yet.
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
                          <td className="px-3 py-2 text-scout-muted">{pct(peerAvg)}</td>
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

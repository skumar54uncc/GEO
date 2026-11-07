"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle } from "@/components/scout/primitives";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { leverTypeToLabel } from "@/lib/gaps/display";

type ReportListItem = { id: string; topic: string; createdAt: string };
type StrategyItem = {
  id: string;
  promptCluster: string;
  persona: string;
  leverType: string;
  owner: string;
  publishBy: string;
  score: number | null;
  scoreStatus: string;
  evidenceGrade: string;
  factors: {
    demand: { value: number | null; source: string; n: number };
    gapSize: { value: number | null; source: string; n: number };
    effort: { value: number | null; source: string; n: number };
  };
};
type Report = {
  id: string;
  topic: string;
  output: {
    scoredItems: StrategyItem[];
    unscoredItems: StrategyItem[];
    offsite: Array<{ domain: string; peerCitationCount: number; ourCitationCount: number; n: number }>;
  };
};

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

function Factor({ label, f }: { label: string; f: { value: number | null; source: string; n: number } }) {
  return (
    <span className="text-xs text-uncc-ink/70">
      {label}: {f.value === null ? "demand unknown" : f.value.toFixed(2)} ({f.source}, n={f.n})
    </span>
  );
}

export default function StrategyPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [reports, setReports] = useState<ReportListItem[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await api<{ reports: ReportListItem[] }>(`/api/campaigns/${campaignId}/strategy`);
      setReports(list.reports);
      if (list.reports[0]) {
        const detail = await api<{ report: Report }>(
          `/api/campaigns/${campaignId}/strategy?reportId=${list.reports[0].id}`,
        );
        setReport(detail.report);
      } else {
        setReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Strategy · Scout";
  }, []);

  if (error && !reports) return <ErrorState message={error} />;
  if (!reports) return <LoadingState label="Loading strategy reports…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-scout-muted">
            <Link href="/campaigns" className="font-medium text-scout-brand underline">
              Campaigns
            </Link>{" "}
            · Strategy
          </p>
          <PageTitle
            title="Content strategy"
            subtitle="Demand → landscape → supply → gaps → plan. Scored items use demand × gap × effort. Missing Trends, Search Console, or keywords never score as zero; they stay in the unscored list."
          />
        </div>
        {report ? (
          <a
            className="inline-flex h-9 items-center rounded border border-scout-border bg-scout-card px-3 text-sm text-scout-text shadow-scout"
            href={`/api/campaigns/${campaignId}/strategy/export?reportId=${report.id}`}
            data-testid="strategy-export-csv"
          >
            Export CSV
          </a>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}

      <HowMeasured
        context={{
          extra:
            "The recommendation writer is a different model from the visibility judge. Unavailable demand sources stay unknown and unscored, never treated as zero.",
        }}
      />

      {reports.length === 0 ? (
        <EmptyState title="No strategy reports yet">
          <p>An Operator runs the strategy pipeline for a topic. Unsupported ideas are blocked rather than invented.</p>
        </EmptyState>
      ) : null}

      {report ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{report.topic}</CardTitle>
              <CardDescription>
                Publish-by dates come from the higher-ed calendar (FAFSA, early action, regular decision, decision
                day, fall start). Calendar rows are seed data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <h3 className="font-serif text-lg">Scored plan</h3>
              {report.output.scoredItems.length === 0 ? (
                <p className="text-sm text-uncc-ink/60">No scored items.</p>
              ) : (
                <ul className="space-y-3">
                  {report.output.scoredItems.map((item) => (
                    <li key={item.id} className="rounded border border-uncc-rule bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-uncc-ink">{item.promptCluster}</p>
                        <Badge tone="muted">{leverTypeToLabel(item.leverType) ?? item.leverType}</Badge>
                        <Badge tone="muted">grade {item.evidenceGrade}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-uncc-ink/70">
                        {item.persona} · {item.owner} · publish by {item.publishBy} · score{" "}
                        {item.score === null ? "n/a" : item.score.toFixed(3)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3">
                        <Factor label="demand" f={item.factors.demand} />
                        <Factor label="gap" f={item.factors.gapSize} />
                        <Factor label="effort" f={item.factors.effort} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="font-serif text-lg">Unscored (demand unknown)</h3>
              {report.output.unscoredItems.length === 0 ? (
                <p className="text-sm text-uncc-ink/60">None.</p>
              ) : (
                <ul className="space-y-2">
                  {report.output.unscoredItems.map((item) => (
                    <li key={item.id} className="rounded border border-dashed border-uncc-rule p-3 text-sm">
                      {item.promptCluster} · {leverTypeToLabel(item.leverType) ?? item.leverType} · demand unknown
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Off-site opportunities</CardTitle>
              <CardDescription>Third-party domains that cite peers but not us (from citation data).</CardDescription>
            </CardHeader>
            <CardContent>
              {report.output.offsite.length === 0 ? (
                <p className="text-sm text-uncc-ink/60">No off-site gaps in this report.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-scout-page text-xs uppercase text-scout-muted">
                    <tr>
                      <th className="py-1">Domain</th>
                      <th>Peer cites</th>
                      <th>Our cites</th>
                      <th>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.output.offsite.map((row) => (
                      <tr key={row.domain} className="border-t border-uncc-rule/60">
                        <td className="py-1.5">{row.domain}</td>
                        <td>{row.peerCitationCount}</td>
                        <td>{row.ourCitationCount}</td>
                        <td>{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

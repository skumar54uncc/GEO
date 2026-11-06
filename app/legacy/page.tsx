"use client";

import { useEffect, useState } from "react";
import { CitedDomainsBar, ConsistencyStacked, ShareOfVoiceBar, VisibilityBySurface } from "@/components/Charts";
import { AUDIENCE_LABELS, SURFACE_LABELS, type Audience, type Surface } from "@/lib/types";
import type { Metrics } from "@/lib/metrics";

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded border border-uncc-rule bg-white p-5">
      <h2 className="font-serif text-lg font-semibold text-uncc-ink">{title}</h2>
      {note ? <p className="mt-1 text-xs text-uncc-ink/60">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="text-red-800">Failed to load metrics: {error}</p>;
  if (!data) return <p className="text-uncc-ink/60">Computing from stored judge JSON…</p>;

  const vis = data.overall.visibility;
  const audiences = Array.from(new Set(data.gapMatrix.cells.map((c) => c.audience))) as Audience[];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Rates use judged runs only. Empty paste boxes are excluded. Google AI Overview is pinned to the United States;
        manual surfaces use the location note captured on save. Store backend: <span className="font-mono">{data.backend}</span>.
        Next: <a className="text-uncc-green underline" href="/demand">Demand</a> for what is heating up, then{" "}
        <a className="text-uncc-green underline" href="/recommend">Recommend</a> for what to write.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded border border-uncc-green bg-white p-6 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.16em] text-uncc-green">Visibility rate</p>
          <p className="mt-2 font-serif text-6xl tabular text-uncc-green">
            {vis.rate === null ? "—" : `${(vis.rate * 100).toFixed(1)}%`}
          </p>
          <p className="mt-3 font-mono text-sm text-uncc-ink">{vis.label}</p>
          <p className="mt-2 text-xs text-uncc-ink/60">
            Wilson 95% interval. Denominator = {vis.n} judged runs ({data.overall.captured_runs} captured, {data.overall.judge_errors} judge errors excluded).
          </p>
        </section>
        <section className="rounded border border-uncc-rule bg-white p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-uncc-ink/60">Citation rate</p>
          <p className="mt-2 font-serif text-4xl tabular">{data.overall.citation.rate === null ? "—" : `${(data.overall.citation.rate * 100).toFixed(1)}%`}</p>
          <p className="mt-2 font-mono text-xs text-uncc-ink/80">{data.overall.citation.label}</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Share of voice" note="Target mentions over target plus all configured competitors actually present.">
          <ShareOfVoiceBar
            target={data.shareOfVoice.target_mentions}
            competitors={data.shareOfVoice.competitor_mentions}
            share={data.shareOfVoice.share}
            label={data.shareOfVoice.label}
          />
        </Card>
        <Card title="Visibility by surface" note="Each bar is a rate with its own denominator. Google AIO is US-pinned.">
          <VisibilityBySurface
            data={data.bySurface.map((s) => ({
              surface: s.surface as Surface,
              rate: s.visibility.rate,
              n: s.visibility.n,
              label: s.visibility.label,
            }))}
          />
          <ul className="mt-3 grid grid-cols-2 gap-x-4 text-xs text-uncc-ink/70">
            {data.bySurface.map((s) => (
              <li key={s.surface}>
                {SURFACE_LABELS[s.surface as Surface]}: {s.visibility.label}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Run consistency"
        note="Among prompt × surface cells with three judged runs, how many of the three mention UNC Charlotte. Partial cells (fewer than three runs) are shown separately. Consistency is always reported alongside visibility."
      >
        <ConsistencyStacked buckets={data.consistency.buckets} />
      </Card>

      <Card title="Gap matrix" note="Flagged cells: target absent and at least one configured competitor present. Each cell shows target mentions / competitor mentions (n = judged runs).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-uncc-rule">
                <th className="py-2 pr-3 font-medium">Audience</th>
                {data.gapMatrix.subtopics.map((s) => (
                  <th key={s.id} className="py-2 pr-3 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audiences.map((aud) => (
                <tr key={aud} className="border-b border-uncc-rule/60">
                  <td className="py-2 pr-3 font-medium">{AUDIENCE_LABELS[aud]}</td>
                  {data.gapMatrix.subtopics.map((s) => {
                    const cell = data.gapMatrix.cells.find((c) => c.audience === aud && c.subtopic === s.id)!;
                    return (
                      <td key={s.id} className={`py-2 pr-3 tabular ${cell.flagged ? "bg-amber-50 font-medium text-amber-950" : ""}`}>
                        {cell.n === 0 ? "—" : `${cell.target_mentions}/${cell.competitor_mentions} (n=${cell.n})`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top cited sources" note="Gold bar = charlotte.edu (and subdomains reduced to the registrable domain).">
          <CitedDomainsBar rows={data.citations.top_domains} />
        </Card>
        <Card title="Competitor leaderboard" note="Mention count across judged runs, with average rank when a ranked list exists.">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-uncc-rule text-xs uppercase tracking-wide text-uncc-ink/60">
                <th className="py-2">Competitor</th>
                <th className="py-2">Mentions</th>
                <th className="py-2">Avg rank</th>
              </tr>
            </thead>
            <tbody>
              {data.competitorLeaderboard.map((c) => (
                <tr key={c.name} className="border-b border-uncc-rule/50">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 tabular">
                    {c.mention_count} / {c.n_runs}
                  </td>
                  <td className="py-2 tabular">{c.average_rank === null ? "—" : c.average_rank.toFixed(1)} {c.rank_n ? `(n=${c.rank_n})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card
        title="Organic versus AI Overview"
        note="Cause-and-effect view for the content team. Organic top-10 ranking comes free with the AIO Google search. AIO mention comes from the same judge contract."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-uncc-rule">
                <th className="py-2 pr-3">Prompt</th>
                <th className="py-2 pr-3">Organic rank</th>
                <th className="py-2 pr-3">AIO shown</th>
                <th className="py-2 pr-3">AIO mention</th>
                <th className="py-2 pr-3">AIO cited</th>
                <th className="py-2 pr-3">Finding</th>
              </tr>
            </thead>
            <tbody>
              {data.organicVsAi.length === 0 ? (
                <tr>
                  <td className="py-3 text-uncc-ink/60" colSpan={6}>
                    No SerpAPI fetches yet. Run Google AIO on the SerpAPI screen.
                  </td>
                </tr>
              ) : (
                data.organicVsAi.map((row) => (
                  <tr key={row.prompt_id} className="border-b border-uncc-rule/50 align-top">
                    <td className="max-w-sm py-2 pr-3">{row.text}</td>
                    <td className="py-2 pr-3 tabular">
                      {row.target_ranked ? `#${row.target_position}` : row.has_organic ? "not in top 10" : "—"}
                    </td>
                    <td className="py-2 pr-3">{row.aio_shown === null ? "—" : row.aio_shown ? "yes" : "no"}</td>
                    <td className="py-2 pr-3">{row.aio_mentioned === null ? "—" : row.aio_mentioned ? "yes" : "no"}</td>
                    <td className="py-2 pr-3">{row.aio_cited === null ? "—" : row.aio_cited ? "yes" : "no"}</td>
                    <td className="py-2 pr-3">{row.finding}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ul className="list-disc pl-5 text-xs text-uncc-ink/60">
        {data.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

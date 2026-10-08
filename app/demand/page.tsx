"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendsInterestLine } from "@/components/Charts";
import type { DemandSnapshot } from "@/lib/demand";
import type { CreditEstimate } from "@/lib/serpapi";
import type { Metrics } from "@/lib/metrics";

export default function DemandPage() {
  const [snapshot, setSnapshot] = useState<DemandSnapshot | null>(null);
  const [estimate, setEstimate] = useState<CreditEstimate | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("electric grid");

  async function load() {
    const [demand, met] = await Promise.all([fetch("/api/demand").then((r) => r.json()), fetch("/api/metrics").then((r) => r.json())]);
    setSnapshot(demand.snapshot);
    setEstimate(demand.estimate);
    setMetrics(met);
    const firstWithData =
      [...(demand.snapshot?.flagship ?? []), ...(demand.snapshot?.terms ?? [])].find(
        (t: { series?: Record<string, unknown[]> }) => (t.series?.US?.length || 0) > 0,
      )?.term;
    if (firstWithData) setTerm(firstWithData);
  }

  useEffect(() => {
    load();
  }, []);

  async function fetchPack() {
    setBusy(true);
    setError(null);
    try {
      const est = await fetch("/api/demand").then((r) => r.json());
      setEstimate(est.estimate);
      if (!est.estimate?.allowed) {
        setError(est.estimate?.refusal_reason || "Credit guard refused");
        return;
      }
      const res = await fetch("/api/demand", { method: "POST" });
      const json = await res.json();
      if (res.status === 409) {
        setError(json.estimate?.refusal_reason || "Refused");
        setEstimate(json.estimate);
        return;
      }
      setSnapshot(json.snapshot);
      setEstimate(json.estimate);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const chartTerms = [...(snapshot?.flagship ?? []), ...(snapshot?.terms ?? [])];
  const selected = chartTerms.find((t) => t.term === term);
  const line = useMemo(() => {
    if (!selected) return [];
    const byDate = new Map<string, { date: string; us?: number; nc?: number; sc?: number }>();
    const geoToKey = { US: "us", "US-NC": "nc", "US-SC": "sc" } as const;
    (["US", "US-NC", "US-SC"] as const).forEach((geo) => {
      for (const p of selected.series[geo] ?? []) {
        const row = byDate.get(p.date) || { date: p.date };
        row[geoToKey[geo]] = p.value;
        byDate.set(p.date, row);
      }
    });
    return Array.from(byDate.values());
  }, [selected]);

  const avg = (geo: "US" | "US-NC" | "US-SC") => {
    if (!selected) return null;
    if (selected.averages[geo] != null) return selected.averages[geo];
    const pts = selected.series[geo] ?? [];
    if (!pts.length) return null;
    return Math.round(pts.reduce((s, p) => s + p.value, 0) / pts.length);
  };

  const vis = metrics?.overall.visibility;
  const losses = metrics?.organicVsAi.filter((r) => r.has_organic && !(r.target_ranked && r.aio_mentioned)) ?? [];
  const cleanRising = (snapshot?.terms ?? []).flatMap((t) => t.rising.concat(t.top)).filter((r, i, arr) => arr.findIndex((x) => x.query === r.query) === i);

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Energy campaign intelligence for the year: what AI currently says about UNC Charlotte, the NSF Grid Engine story
        you own, how people search, and the six pages to write. Trends junk (Walmart, iPhones) is filtered out.
      </p>

      <section className="rounded border border-uncc-green bg-white p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-uncc-green">The story we own</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold">{snapshot?.campaign.name}</h2>
        <p className="mt-3 text-sm leading-6">{snapshot?.campaign.one_sentence}</p>
        <p className="mt-2 text-sm leading-6 text-uncc-ink/80">{snapshot?.campaign.why_now}</p>
        <p className="mt-3 text-xs">
          Source:{" "}
          <a className="text-uncc-green underline" href={snapshot?.campaign.source_url} target="_blank" rel="noreferrer">
            {snapshot?.campaign.source_label}
          </a>
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-uncc-rule bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">Current visibility</p>
          <p className="mt-2 font-serif text-4xl tabular text-uncc-green">
            {vis?.rate == null ? "—" : `${(vis.rate * 100).toFixed(0)}%`}
          </p>
          <p className="mt-2 font-mono text-xs">{vis?.label ?? "Run Analyze first"}</p>
        </div>
        <div className="rounded border border-uncc-rule bg-white p-5 md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">What AI is getting wrong now</p>
          {losses.length === 0 ? (
            <p className="mt-2 text-sm text-uncc-ink/60">No organic/AIO losses stored yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {losses.map((r) => (
                <li key={r.prompt_id}>
                  <span className="font-medium">{r.finding}.</span> {r.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-uncc-rule bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">This fetch</p>
          <p className="mt-2 font-serif text-3xl tabular">{estimate?.estimated_uncached_calls ?? "—"}</p>
          <p className="mt-1 text-xs text-uncc-ink/60">
            uncached of {estimate?.estimated_calls ?? "—"} · remaining {estimate?.credits_remaining ?? "—"} · cap {estimate?.per_run_cap ?? "—"}
          </p>
        </div>
        <div className="rounded border border-uncc-rule bg-white p-5 md:col-span-2 flex items-center justify-between gap-4">
          <p className={`text-sm ${estimate?.allowed ? "text-uncc-green" : "text-red-800"}`}>
            {estimate ? (estimate.allowed ? "Credit guard: within cap. Cached calls are free." : estimate.refusal_reason) : "Loading…"}
          </p>
          <button type="button" disabled={busy || !estimate?.allowed} onClick={fetchPack} className="rounded bg-uncc-green px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Fetching…" : "Fetch smarter demand pack"}
          </button>
        </div>
      </section>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <p className="text-xs text-uncc-ink/60">{snapshot?.note}</p>

      <section className="rounded border border-uncc-rule bg-white p-5">
        <h2 className="font-serif text-lg font-semibold">Search interest (use flagship terms, not the crushed five-way chart)</h2>
        <p className="mt-1 text-xs text-uncc-ink/60">
          Click <span className="font-medium">electric grid</span> or <span className="font-medium">data center electricity</span> first. Those are
          scaled 0–100 against themselves. The five campaign topics below are only a comparison against each other.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {chartTerms.map((t) => (
            <button
              key={t.term}
              type="button"
              onClick={() => setTerm(t.term)}
              className={`rounded border px-3 py-1 text-xs ${term === t.term ? "border-uncc-green bg-uncc-mist text-uncc-green" : "border-uncc-rule"}`}
            >
              {t.term}
            </button>
          ))}
        </div>
        {selected ? (
          <p className="mt-3 font-mono text-xs">
            Average index — US {avg("US") ?? "—"} · NC {avg("US-NC") ?? "—"} · SC {avg("US-SC") ?? "—"}
            {line.length ? ` · ${line.length} weeks` : ""}
          </p>
        ) : null}
        <div className="mt-4">
          <TrendsInterestLine series={line} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-uncc-rule bg-white p-5">
          <h2 className="font-serif text-lg font-semibold">How people actually ask</h2>
          <p className="mt-1 text-xs text-uncc-ink/60">
            The lists under each prompt are <span className="font-medium">not</span> Autocomplete and{" "}
            <span className="font-medium">not</span> Trends. They are People Also Ask and related searches from the same
            Google search that fetched the AI Overview — no extra credit.
          </p>
          {snapshot?.google_questions?.length ? (
            <>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-uncc-ink/40">Google People Also Ask / related searches</p>
              {snapshot.google_questions.map((g) => (
                <div key={g.prompt} className="mt-3">
                  <p className="text-xs font-medium text-uncc-ink/50">{g.prompt}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {g.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : (
            <p className="mt-2 text-sm text-uncc-ink/60">Run Google AIO on SerpAPI first — those questions land here for free.</p>
          )}
          {snapshot?.phrases?.some((p) => p.suggestions.length) ? (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-uncc-ink/50">Autocomplete (energy-filtered)</p>
              {snapshot.phrases.map((p) =>
                p.suggestions.length ? (
                  <p key={p.seed} className="mt-2 text-sm leading-6">
                    <span className="font-medium">{p.seed}:</span> {p.suggestions.join(" · ")}
                  </p>
                ) : null,
              )}
            </div>
          ) : null}
          {cleanRising.length ? (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-uncc-ink/50">Energy-related Trends phrases only</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {cleanRising.slice(0, 12).map((r) => (
                  <li key={r.query}>
                    {r.query} {r.value ? <span className="text-uncc-ink/50">({r.value})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-uncc-ink/50">No usable Trends “rising” phrases. Thin topics produce Walmart/iPhone noise, so those are hidden.</p>
          )}
        </div>
        <div className="rounded border border-uncc-rule bg-white p-5">
          <h2 className="font-serif text-lg font-semibold">Year-ahead pages to write</h2>
          <p className="mt-1 text-xs text-uncc-ink/60">Six pieces from the NSF announcement, mapped to what AI is already getting wrong. Open Recommend for the full brief.</p>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
            {snapshot?.slate.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.title}.</span> {s.why}
              </li>
            ))}
          </ol>
          <a href="/recommend" className="mt-4 inline-block text-sm text-uncc-green underline">
            Open writing briefs →
          </a>
        </div>
      </section>
    </div>
  );
}

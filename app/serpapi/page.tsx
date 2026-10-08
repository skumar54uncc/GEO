"use client";

import { useEffect, useMemo, useState } from "react";
import { AUDIENCE_LABELS, type PromptRow } from "@/lib/types";

type Estimate = {
  prompt_count: number;
  calls_per_prompt: number;
  estimated_calls: number;
  estimated_uncached_calls: number;
  credits_remaining: number;
  per_run_cap: number;
  allowed: boolean;
  refusal_reason: string | null;
};

export default function SerpApiPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [credits, setCredits] = useState<{
    credits_remaining: number;
    starting_balance: number;
    per_run_cap: number;
    events: Array<{ id: number; created_at: string; engine: string | null; ok: number; cached: number; credits_charged: number; error: string | null }>;
  } | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [results, setResults] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshCredits() {
    const json = await fetch("/api/serpapi/credits").then((r) => r.json());
    setCredits(json);
  }

  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((j) => {
        setPrompts(j.prompts);
        setSelected(j.prompts.slice(0, 3).map((p: PromptRow) => p.id));
      });
    refreshCredits();
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function runEstimate() {
    setError(null);
    const json = await fetch("/api/serpapi/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt_ids: selected }),
    }).then((r) => r.json());
    setEstimate(json);
  }

  async function runBatch() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const est = await fetch("/api/serpapi/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_ids: selected }),
      }).then((r) => r.json());
      setEstimate(est);
      if (!est.allowed) {
        setError(est.refusal_reason);
        return;
      }
      const res = await fetch("/api/serpapi/aio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_ids: selected }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setError(json.estimate?.refusal_reason || "Refused by credit guard");
        setEstimate(json.estimate);
        return;
      }
      setResults(json);
      await refreshCredits();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Credit guard runs before any batch. Cached parameter sets are never billed twice. Failed calls are logged and not
        retried. Google AIO is a two-step fetch run back-to-back per prompt because the page token expires within one minute.
        Location is pinned to the United States. Organic top-10, People Also Ask, and related searches come from the first
        call at no extra credit.
      </p>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-uncc-rule bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">Credits remaining</p>
          <p className="mt-2 font-serif text-4xl tabular">{credits?.credits_remaining ?? "—"}</p>
          <p className="mt-1 text-xs text-uncc-ink/60">Starting balance {credits?.starting_balance ?? "—"}</p>
        </div>
        <div className="rounded border border-uncc-rule bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">Per-run cap</p>
          <p className="mt-2 font-serif text-4xl tabular">{credits?.per_run_cap ?? "—"}</p>
          <p className="mt-1 text-xs text-uncc-ink/60">Batch refuses if estimated calls exceed this.</p>
        </div>
        <div className="rounded border border-uncc-rule bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">Estimate</p>
          {estimate ? (
            <>
              <p className="mt-2 font-mono text-sm">
                {estimate.prompt_count} prompts × {estimate.calls_per_prompt} calls = {estimate.estimated_calls}
              </p>
              <p className="text-xs text-uncc-ink/70">Uncached ceiling: {estimate.estimated_uncached_calls}</p>
              <p className={`mt-2 text-sm ${estimate.allowed ? "text-uncc-green" : "text-red-800"}`}>
                {estimate.allowed ? "Within cap and balance" : estimate.refusal_reason}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-uncc-ink/60">Run an estimate before fetching.</p>
          )}
        </div>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="rounded border border-uncc-rule px-3 py-1 text-xs" onClick={() => setSelected(prompts.slice(0, 3).map((p) => p.id))}>
            First 3 (verify)
          </button>
          <button type="button" className="rounded border border-uncc-rule px-3 py-1 text-xs" onClick={() => setSelected(prompts.map((p) => p.id))}>
            All active
          </button>
          <button type="button" className="rounded border border-uncc-rule px-3 py-1 text-xs" onClick={() => setSelected([])}>
            None
          </button>
        </div>
        <div className="max-h-80 overflow-auto text-sm">
          {prompts.map((p) => (
            <label key={p.id} className="flex items-start gap-2 border-b border-uncc-rule/40 py-1.5">
              <input
                type="checkbox"
                checked={selectedSet.has(p.id)}
                onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
              />
              <span>
                <span className="text-xs text-uncc-ink/50">{AUDIENCE_LABELS[p.audience]}</span> {p.text}
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <button type="button" onClick={runEstimate} className="rounded border border-uncc-green px-4 py-2 text-sm text-uncc-green">
          Estimate credits
        </button>
        <button
          type="button"
          disabled={busy || !estimate?.allowed}
          onClick={runBatch}
          className="rounded bg-uncc-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Fetching sequentially…" : "Fetch Google AIO (two-step, per prompt)"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {!process.env.NEXT_PUBLIC_PLACEHOLDER ? (
        <p className="text-xs text-uncc-ink/50">Requires SERPAPI_API_KEY in .env.local. no_cache=false. No automatic retries.</p>
      ) : null}

      {results ? (
        <pre className="max-h-96 overflow-auto rounded border border-uncc-rule bg-white p-3 font-mono text-xs">
          {JSON.stringify(results, null, 2)}
        </pre>
      ) : null}

      <section className="rounded border border-uncc-rule bg-white p-5">
        <h2 className="font-serif text-lg font-semibold">Recent SerpAPI events</h2>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-uncc-rule">
              <th className="py-1">Time</th>
              <th>Engine</th>
              <th>Cached</th>
              <th>Credits</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {credits?.events.map((e) => (
              <tr key={e.id} className="border-b border-uncc-rule/40">
                <td className="py-1 tabular">{e.created_at}</td>
                <td>{e.engine}</td>
                <td>{e.cached ? "yes" : "no"}</td>
                <td className="tabular">{e.credits_charged}</td>
                <td>{e.ok ? "ok" : e.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

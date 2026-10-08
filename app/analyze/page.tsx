"use client";

import { useEffect, useState } from "react";
import { SURFACE_LABELS, type AnalysisRow, type PromptRow, type ResponseRow } from "@/lib/types";

type Row = { response: ResponseRow; analysis: AnalysisRow | null; prompt: PromptRow | null };

export default function AnalyzePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [overrideText, setOverrideText] = useState("");

  async function reload() {
    const json = await fetch("/api/analyze").then((r) => r.json());
    setRows(json.rows);
    if (!activeId && json.rows[0]) setActiveId(json.rows[0].response.id);
  }

  useEffect(() => {
    reload();
  }, []);

  const active = rows.find((r) => r.response.id === activeId);

  useEffect(() => {
    if (active?.analysis) setOverrideText(active.analysis.judge_json);
  }, [active?.analysis, active?.response.id]);

  async function runUnanalyzed() {
    setBusy(true);
    setStatus(null);
    try {
      const json = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_unanalyzed: true }),
      }).then((r) => r.json());
      setStatus(`Analyzed ${json.results.length} responses. Errors: ${json.results.filter((x: { error_flag: boolean }) => x.error_flag).length}.`);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function runOne() {
    if (!activeId) return;
    setBusy(true);
    try {
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_ids: [activeId] }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveOverride() {
    if (!activeId) return;
    try {
      JSON.parse(overrideText);
    } catch {
      setStatus("Override is not valid JSON.");
      return;
    }
    await fetch("/api/analyze", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_id: activeId, judge_json: JSON.parse(overrideText) }),
    });
    setStatus("Manual override saved. This row is flagged as hand-checked.");
    await reload();
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        The judge is noisy. Review parsed JSON beside the raw answer and override a sample. One parse-repair call is
        allowed; a second failure stores error_flag rather than crashing the batch.
      </p>
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={runUnanalyzed} className="rounded bg-uncc-green px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Judging…" : "Analyze all unanalyzed"}
        </button>
        <button type="button" disabled={busy || !activeId} onClick={runOne} className="rounded border border-uncc-green px-4 py-2 text-sm text-uncc-green">
          Re-analyze this row
        </button>
        {status ? <p className="self-center text-sm">{status}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="max-h-[70vh] overflow-auto rounded border border-uncc-rule bg-white">
          {rows.map((r) => (
            <button
              key={r.response.id}
              type="button"
              onClick={() => setActiveId(r.response.id)}
              className={`block w-full border-b border-uncc-rule/40 px-3 py-2 text-left text-xs ${activeId === r.response.id ? "bg-uncc-mist" : ""}`}
            >
              <span className="font-medium">{SURFACE_LABELS[r.response.surface]} r{r.response.run_number}</span>
              <span className="ml-2 text-uncc-ink/50">
                {r.analysis ? (r.analysis.error_flag ? "error" : r.analysis.manual_override ? "override" : "judged") : "pending"}
              </span>
              <div className="mt-1 line-clamp-2 text-uncc-ink/70">{r.prompt?.text}</div>
            </button>
          ))}
          {rows.length === 0 ? <p className="p-3 text-xs text-uncc-ink/60">No captured responses yet.</p> : null}
        </aside>
        {active ? (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded border border-uncc-rule bg-white p-4">
              <h2 className="font-serif text-base font-semibold">Raw answer</h2>
              <p className="mt-1 text-xs text-uncc-ink/60">
                {SURFACE_LABELS[active.response.surface]} · {active.response.source_type} · {active.response.location_note}
              </p>
              <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs">{active.response.raw_text}</pre>
            </section>
            <section className="rounded border border-uncc-rule bg-white p-4">
              <h2 className="font-serif text-base font-semibold">Judge JSON</h2>
              <p className="mt-1 text-xs text-uncc-ink/60">
                {active.analysis
                  ? `${active.analysis.judge_model} · ${active.analysis.analyzed_at}${active.analysis.manual_override ? " · manual override" : ""}`
                  : "not analyzed"}
              </p>
              <textarea
                className="mt-3 h-[50vh] w-full rounded border border-uncc-rule p-2 font-mono text-xs"
                value={overrideText}
                onChange={(e) => setOverrideText(e.target.value)}
              />
              <button type="button" onClick={saveOverride} className="mt-2 rounded border border-uncc-rule px-3 py-1 text-xs">
                Save as manual override
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

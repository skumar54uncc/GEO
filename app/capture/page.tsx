"use client";

import { useEffect, useMemo, useState } from "react";
import { AUDIENCE_LABELS, MANUAL_SURFACES, SURFACE_LABELS, type Audience, type ManualSurface, type PromptRow } from "@/lib/types";
import type { CoverageRow } from "@/lib/db/types";

type Runs = Record<ManualSurface, [string, string, string]>;

function emptyRuns(): Runs {
  return {
    chatgpt: ["", "", ""],
    gemini: ["", "", ""],
    claude: ["", "", ""],
    perplexity: ["", "", ""],
  };
}

export default function CapturePage() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [config, setConfig] = useState<{ last_location_note: string; subtopics: Array<{ id: string; label: string }> } | null>(null);
  const [promptId, setPromptId] = useState<number | "new">(0);
  const [newText, setNewText] = useState("");
  const [newAudience, setNewAudience] = useState<Audience>("undergrad");
  const [newSubtopics, setNewSubtopics] = useState<string[]>([]);
  const [locationNote, setLocationNote] = useState("Charlotte NC, incognito");
  const [runs, setRuns] = useState<Runs>(emptyRuns());
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/prompts").then((r) => r.json()), fetch("/api/coverage").then((r) => r.json()), fetch("/api/config").then((r) => r.json())]).then(
      ([p, c, cfg]) => {
        setPrompts(p.prompts);
        setCoverage(c.coverage);
        setConfig(cfg.config);
        setLocationNote(cfg.config.last_location_note || "Charlotte NC, incognito");
        if (p.prompts[0]) setPromptId(p.prompts[0].id);
      },
    );
  }, []);

  const selected = prompts.find((p) => p.id === promptId);
  const cov = coverage.find((c) => c.prompt.id === promptId);

  const filledCount = useMemo(() => {
    let n = 0;
    for (const s of MANUAL_SURFACES) {
      for (const t of runs[s]) if (t.trim()) n += 1;
    }
    return n;
  }, [runs]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      let id = typeof promptId === "number" ? promptId : 0;
      if (promptId === "new") {
        const created = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: newText, audience: newAudience, subtopics: newSubtopics }),
        }).then((r) => r.json());
        id = created.prompt.id;
        setPrompts((prev) => [...prev, created.prompt]);
        setPromptId(id);
      }
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_id: id, location_note: locationNote, runs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      setStatus(`Saved ${json.saved} filled runs. Empty boxes were skipped.`);
      setRuns(emptyRuns());
      const covJson = await fetch("/api/coverage").then((r) => r.json());
      setCoverage(covJson.coverage);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Paste ChatGPT, Gemini, Claude, and Perplexity answers here. Three runs each. Put the sources block at the bottom of
        each box. Empty boxes are allowed and not counted. Google AI Overview is fetched on the SerpAPI screen, not pasted.
      </p>

      <section className="rounded border border-uncc-rule bg-white p-5 space-y-4">
        <label className="block text-sm font-medium">Prompt</label>
        <select
          className="w-full rounded border border-uncc-rule bg-uncc-paper px-3 py-2 text-sm"
          value={promptId}
          onChange={(e) => setPromptId(e.target.value === "new" ? "new" : Number(e.target.value))}
        >
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              [{AUDIENCE_LABELS[p.audience]}] {p.text}
            </option>
          ))}
          <option value="new">Type a new prompt…</option>
        </select>
        {promptId === "new" ? (
          <div className="space-y-3">
            <textarea className="w-full rounded border border-uncc-rule p-2 text-sm" rows={3} value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="New prompt text" />
            <div className="flex flex-wrap gap-3">
              <select className="rounded border border-uncc-rule px-2 py-1 text-sm" value={newAudience} onChange={(e) => setNewAudience(e.target.value as Audience)}>
                {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2 text-xs">
                {config?.subtopics.map((s) => (
                  <label key={s.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={newSubtopics.includes(s.id)}
                      onChange={(e) =>
                        setNewSubtopics((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : selected ? (
          <p className="text-xs text-uncc-ink/70">
            Audience: {AUDIENCE_LABELS[selected.audience]} · Subtopics: {selected.subtopics.join(", ") || "none"}
          </p>
        ) : null}

        <label className="block text-sm font-medium">Location note (captured on every save)</label>
        <input
          className="w-full rounded border border-uncc-rule px-3 py-2 text-sm"
          value={locationNote}
          onChange={(e) => setLocationNote(e.target.value)}
        />

        {cov ? (
          <p className="text-xs tabular text-uncc-ink/70">
            Coverage for this prompt: {cov.filled} of {cov.total} cells filled
            {MANUAL_SURFACES.map((s) => ` · ${SURFACE_LABELS[s]} ${cov.cells[s]?.length ?? 0}/3`).join("")}
            {` · AIO ${cov.cells.google_aio?.length ?? 0}/1`}
          </p>
        ) : null}
      </section>

      {MANUAL_SURFACES.map((surface, sIdx) => (
        <section key={surface} className="rounded border border-uncc-rule bg-white p-5">
          <h2 className="font-serif text-lg font-semibold">{SURFACE_LABELS[surface]}</h2>
          <p className="mb-3 text-xs text-uncc-ink/60">Paste the full answer. Sources go inline at the bottom of the same box.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <label key={i} className="block text-xs font-medium">
                Run {i + 1}
                <textarea
                  tabIndex={sIdx * 3 + i + 1}
                  className="mt-1 h-48 w-full rounded border border-uncc-rule p-2 font-mono text-xs"
                  value={runs[surface][i]}
                  onChange={(e) => {
                    const next = { ...runs, [surface]: [...runs[surface]] as [string, string, string] };
                    next[surface][i] = e.target.value;
                    setRuns(next);
                  }}
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={saving || filledCount === 0}
          onClick={save}
          className="rounded bg-uncc-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${filledCount} filled run${filledCount === 1 ? "" : "s"}`}
        </button>
        {status ? <p className="text-sm text-uncc-ink/80">{status}</p> : null}
      </div>
    </div>
  );
}

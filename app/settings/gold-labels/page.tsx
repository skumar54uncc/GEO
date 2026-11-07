"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/PageStates";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";

type SampleRow = {
  drawId: string;
  engine: string;
  runner: string;
  provider: string;
  promptId: string;
  drawIndex: number;
  status: string;
  answerPreview: string;
};

export default function GoldLabelsPage() {
  const [scanId, setScanId] = useState("");
  const [rows, setRows] = useState<SampleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!scanId.trim()) {
      setError("Enter a scan ID from a completed pilot or rehearsal scan.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gold-labels/sample?scanId=${encodeURIComponent(scanId.trim())}&limit=50`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRows(body.draws as SampleRow[]);
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    document.title = "Gold labels · Scout";
  }, []);

  if (error && !rows && !loading) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/settings" className="text-scout-brand underline">
          Settings
        </Link>
      </p>
      <PageTitle
        title="Gold-label sample"
        subtitle="Pull 50 random answers from a scan for hand-labeling (docs/EVALS.md). Read-only list; labels are stored in gold_labels when you add labeling UI later."
      />

      <ScoutCard>
        <label className="block text-sm font-medium" htmlFor="scan-id">
          Scan ID
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="scan-id"
            className="min-w-[280px] flex-1 rounded border border-uncc-rule px-3 py-2 text-sm"
            value={scanId}
            onChange={(e) => setScanId(e.target.value)}
            placeholder="UUID from the pilot scan"
          />
          <button type="button" onClick={() => void load()} className="rounded bg-scout-brand px-4 py-2 text-sm font-medium text-white">
            Load 50 random
          </button>
        </div>
        <p className="mt-3 text-sm text-scout-muted">
          CLI:{" "}
          <code className="text-xs">npx tsx scripts/export-gold-label-sample.ts --scanId &lt;id&gt;</code>
        </p>
      </ScoutCard>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {rows ? (
        <ScoutCard>
          <p className="text-sm text-scout-muted">{rows.length} draws (open in Answer Explorer with draw ID when labeling).</p>
          <div className="mt-4 max-h-[480px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-uncc-rule/60 text-xs uppercase text-scout-muted">
                  <th className="py-2 pr-2">Draw</th>
                  <th className="py-2 pr-2">Engine</th>
                  <th className="py-2 pr-2">Runner</th>
                  <th className="py-2">Preview</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.drawId} className="border-b border-uncc-rule/40">
                    <td className="py-2 pr-2 font-mono text-xs">{r.drawId.slice(0, 8)}…</td>
                    <td className="py-2 pr-2">{r.engine}</td>
                    <td className="py-2 pr-2">{r.runner}</td>
                    <td className="py-2 text-scout-muted">{r.answerPreview || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScoutCard>
      ) : null}
    </div>
  );
}

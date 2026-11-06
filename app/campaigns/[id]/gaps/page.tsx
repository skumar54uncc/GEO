"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { Badge } from "@/components/ui/card";

type GapRow = {
  id: string;
  kind: string;
  leverType: string | null;
  owner: string | null;
  evidenceGrade: string | null;
  status: string;
  payload: { format?: string; headlineTerms?: string[]; label?: string } | null;
  targetPromptIds: string[];
  baselineScanId: string | null;
  createdAt: string;
};

export default function GapsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [rows, setRows] = useState<GapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/gaps`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Loading gaps and recommendations…" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
          <Link href={`/campaigns/${campaignId}/dashboard`} className="underline">
            Campaign
          </Link>{" "}
          · Gaps &amp; Recommendations
        </p>
        <h1 className="font-serif text-3xl font-semibold">Gaps &amp; Recommendations</h1>
        <p className="mt-2 max-w-2xl text-sm text-uncc-ink/75">
          Lost questions, what cited pages share, and recommended actions with owners and evidence. Every card is
          correlation, not proven cause.
        </p>
      </header>

      <HowMeasured
        context={{
          extra:
            "Recommendations are built only from stored evidence rows. Unknown evidence IDs are rejected. Term comparisons need at least 10 pages per cohort.",
        }}
      />

      {rows.length === 0 ? (
        <EmptyState title="No recommendations yet">
          <p>When gap analysis finds lost prompts with enough cited pages, recommendation cards will appear here.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded border border-uncc-rule bg-white p-4">
              <div className="flex flex-wrap gap-2">
                {row.leverType ? <Badge tone="muted">{row.leverType}</Badge> : null}
                {row.evidenceGrade ? <Badge tone="muted">grade {row.evidenceGrade}</Badge> : null}
                <Badge tone={row.status === "published" ? "green" : "muted"}>{row.status}</Badge>
              </div>
              <p className="mt-2 font-medium">{row.payload?.format ?? row.kind}</p>
              <p className="text-sm text-uncc-ink/70">
                Owner: {row.owner ?? "unassigned"} · targets {row.targetPromptIds.length} prompt
                {row.targetPromptIds.length === 1 ? "" : "s"}
                {row.baselineScanId ? ` · baseline scan ${row.baselineScanId.slice(0, 8)}…` : ""}
              </p>
              {row.payload?.headlineTerms?.length ? (
                <p className="mt-1 text-sm">Headline terms: {row.payload.headlineTerms.join(", ")}</p>
              ) : null}
              <p className="mt-2 text-xs italic text-uncc-ink/60">Correlation, not proven cause.</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

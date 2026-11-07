"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle } from "@/components/scout/primitives";
import { Badge } from "@/components/ui/card";

type GapRow = {
  id: string;
  leverLabel: string | null;
  owner: string | null;
  evidenceGrade: string | null;
  status: string;
  displayTitle: string;
  suggestedAction: string | null;
  lostQuestionTexts: string[];
  sharedAmongCitedPages: string | null;
  sharedAmongCitedPagesN: number | null;
  evidenceCount: number;
  evidenceItems: Array<{ detail: string; url?: string }>;
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

  useEffect(() => {
    document.title = "Gaps & recommendations · Scout";
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Loading gaps and recommendations…" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-scout-muted">
          <Link href={`/campaigns/${campaignId}/dashboard`} className="font-medium text-scout-brand underline">
            Campaign
          </Link>{" "}
          · Gaps &amp; recommendations
        </p>
        <PageTitle
          title="Gaps & Recommendations"
          subtitle="Lost questions, what cited pages share, and recommended actions with owners and evidence. Every card is correlation, not proven cause."
        />
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
        <ul className="space-y-4" data-testid="gap-cards">
          {rows.map((row) => (
            <li key={row.id} className="rounded-scout border border-scout-border bg-scout-card p-5 shadow-scout">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-xl font-semibold">{row.displayTitle}</h2>
                {row.evidenceGrade ? <Badge tone="muted">Evidence grade {row.evidenceGrade}</Badge> : null}
                <Badge tone={row.status === "published" ? "green" : "muted"}>
                  {row.status === "open" ? "Open" : row.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-uncc-ink/80">
                {row.leverLabel ? (
                  <>
                    Lever: <strong>{row.leverLabel}</strong>
                    {" · "}
                  </>
                ) : null}
                Owner: <strong>{row.owner ?? "Unassigned"}</strong>
              </p>

              {row.lostQuestionTexts.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">Lost questions</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {row.lostQuestionTexts.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {row.sharedAmongCitedPages ? (
                <p className="mt-3 text-sm">
                  What cited pages share: {row.sharedAmongCitedPages}
                  {row.sharedAmongCitedPagesN != null ? ` (n=${row.sharedAmongCitedPagesN})` : ""}
                </p>
              ) : null}

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">
                  Evidence ({row.evidenceCount})
                </p>
                {row.evidenceItems.length === 0 ? (
                  <p className="mt-1 text-sm text-uncc-ink/60">No evidence rows stored.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {row.evidenceItems.map((e, i) => (
                      <li key={`${e.detail}-${i}`}>
                        {e.detail}
                        {e.url ? (
                          <>
                            {" "}
                            <a className="underline" href={e.url} target="_blank" rel="noreferrer">
                              source
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {row.suggestedAction ? (
                <p className="mt-3 text-sm">
                  Suggested action: <strong>{row.suggestedAction}</strong>
                </p>
              ) : null}

              <p className="mt-3 text-xs italic text-uncc-ink/60">Correlation, not proven cause.</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

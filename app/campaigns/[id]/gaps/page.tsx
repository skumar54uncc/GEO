"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HowMeasured } from "@/components/HowMeasured";
import { useMetricShowRaw } from "@/components/metrics/ShowRawContext";
import { ShowRawToggle } from "@/components/metrics/ShowRawToggle";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { useSessionRole } from "@/components/SessionRoleContext";
import { SafeLink } from "@/components/site/client";
import { PageTitle } from "@/components/scout/primitives";
import { Badge } from "@/components/ui/card";
import { displayableCitedPagesShare } from "@/lib/metrics/displayable";
import { safeHref } from "@/lib/url/safeHref";

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
  citedPagesShare: {
    label: string;
    n: number;
    headlineTerms: Array<{ term: string; n: number; headlines: string[] }>;
    contentTypes: Array<{ label: string; n: number }>;
    faqs: Array<{ label: string; n: number }>;
    freshness: { summary: string; n: number } | null;
    peers: Array<{ label: string; n: number }>;
  } | null;
  evidenceCount: number;
  evidenceItems: Array<{ detail: string; url?: string }>;
  createdAt: string;
};

type CitedShare = NonNullable<GapRow["citedPagesShare"]>;

function CitedPagesShareBlock({
  share,
  showRaw,
  canShowRaw,
}: {
  share: CitedShare;
  showRaw: boolean;
  canShowRaw: boolean;
}) {
  const decision = displayableCitedPagesShare(share.n);
  if (decision.kind !== "show") {
    return (
      <div className="mt-3" data-testid="cited-pages-share" data-share-kind={decision.kind}>
        <p className="text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">What cited pages share</p>
        <p className="mt-1 text-sm text-uncc-ink/70" data-testid="cited-pages-share-suppressed">
          {decision.message}
        </p>
        {canShowRaw && showRaw ? (
          <div className="mt-2 rounded border border-dashed border-uncc-rule/80 p-2 text-xs text-uncc-ink/60">
            <p className="font-medium">Raw (not reliable): n={share.n}</p>
            <CitedPagesShareTable share={share} />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-3" data-testid="cited-pages-share" data-share-kind="show">
      <p className="text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">
        What cited pages share (n={share.n})
      </p>
      <CitedPagesShareTable share={share} />
      <p className="mt-1 text-xs italic text-uncc-ink/60">{share.label}</p>
    </div>
  );
}

function CitedPagesShareTable({ share }: { share: CitedShare }) {
  return (
    <table className="mt-2 w-full border-collapse text-left text-sm">
      <caption className="sr-only">
        Traits shared among cited pages when we lose; {share.label}
      </caption>
      <thead>
        <tr className="border-b border-uncc-rule text-xs uppercase tracking-wide text-uncc-ink/60">
          <th className="py-1 pr-2 font-medium">Trait</th>
          <th className="py-1 pr-2 font-medium">Detail</th>
          <th className="py-1 font-medium">n</th>
        </tr>
      </thead>
      <tbody>
        {share.headlineTerms.map((t) => (
          <tr key={`term-${t.term}`} className="border-b border-uncc-rule/50 align-top">
            <td className="py-1.5 pr-2">Headline term</td>
            <td className="py-1.5 pr-2">
              <strong>{t.term}</strong>
              {t.headlines.length ? (
                <ul className="mt-1 list-disc pl-4 text-xs text-uncc-ink/70">
                  {t.headlines.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
            </td>
            <td className="py-1.5">{t.n}</td>
          </tr>
        ))}
        {share.contentTypes.map((c) => (
          <tr key={`type-${c.label}`} className="border-b border-uncc-rule/50">
            <td className="py-1.5 pr-2">Content type</td>
            <td className="py-1.5 pr-2">{c.label}</td>
            <td className="py-1.5">{c.n}</td>
          </tr>
        ))}
        {share.faqs.map((f) => (
          <tr key={`faq-${f.label}`} className="border-b border-uncc-rule/50">
            <td className="py-1.5 pr-2">FAQ</td>
            <td className="py-1.5 pr-2">{f.label}</td>
            <td className="py-1.5">{f.n}</td>
          </tr>
        ))}
        {share.freshness ? (
          <tr className="border-b border-uncc-rule/50">
            <td className="py-1.5 pr-2">Freshness</td>
            <td className="py-1.5 pr-2">{share.freshness.summary}</td>
            <td className="py-1.5">{share.freshness.n}</td>
          </tr>
        ) : null}
        {share.peers.map((p) => (
          <tr key={`peer-${p.label}`} className="border-b border-uncc-rule/50">
            <td className="py-1.5 pr-2">Peer</td>
            <td className="py-1.5 pr-2">{p.label}</td>
            <td className="py-1.5">{p.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GapsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const role = useSessionRole();
  const { showRaw } = useMetricShowRaw();
  const canShowRaw = role === "editor" || role === "admin";
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
          <Link href={safeHref(`/campaigns/${campaignId}/dashboard`) ?? "/campaigns"} className="font-medium text-scout-brand underline">
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

      {canShowRaw ? (
        <div className="flex justify-end">
          <ShowRawToggle />
        </div>
      ) : null}

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

              {row.citedPagesShare ? (
                <CitedPagesShareBlock
                  share={row.citedPagesShare}
                  showRaw={showRaw}
                  canShowRaw={canShowRaw}
                />
              ) : row.sharedAmongCitedPages ? (
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
                            <SafeLink href={e.url} className="underline">
                              source
                            </SafeLink>
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

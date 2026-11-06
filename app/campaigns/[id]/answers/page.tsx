"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { Badge } from "@/components/ui/card";
import { enginePlain, fidelityPlain, formatScanDate, runnerPlain } from "@/lib/ui/labels";

type AnswerRow = {
  drawId: string;
  promptText: string;
  engine: string;
  runner: string;
  fidelity: string;
  branded: boolean;
  mentionedBrand: boolean;
  scanCreatedAt: string;
};

type DrawDetail = {
  draw: {
    id: string;
    engine: string;
    runner: string;
    fidelity: string;
    promptText: string;
    capturedAt: string;
  };
  answer: { escapedText: string; text: string };
  mentions: Array<{ entityType: string; span: { text: string } | null }>;
  citations: Array<{ url: string; domain: string; sourceClass: string; position: number | null }>;
  claims: Array<{ text: string; verdict: string }>;
  fanoutQueries: Array<{ query: string }>;
  judge: { model: string } | null;
};

export default function AnswersPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [rows, setRows] = useState<AnswerRow[] | null>(null);
  const [selected, setSelected] = useState<DrawDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/answers`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.answers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDraw(drawId: string) {
    try {
      setDetailError(null);
      const res = await fetch(`/api/answers/${drawId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSelected(json);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Loading AI answers…" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
          <Link href={`/campaigns/${campaignId}/dashboard`} className="underline">
            Campaign
          </Link>{" "}
          · Answer Explorer
        </p>
        <h1 className="font-serif text-3xl font-semibold">Answer Explorer</h1>
        <p className="mt-2 max-w-2xl text-sm text-uncc-ink/75">
          Full answers with brand and competitor highlights, citations, claims, and follow-up queries. Highlights use
          labels as well as color.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No AI answers checked yet">
          <p>Run a measured scan (or open a campaign that already has one) to explore answers here.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.drawId}>
                <button
                  type="button"
                  className="w-full rounded border border-uncc-rule bg-white p-3 text-left text-sm hover:border-uncc-green"
                  onClick={() => void openDraw(row.drawId)}
                >
                  <p className="font-medium line-clamp-2">{row.promptText}</p>
                  <p className="mt-1 text-xs text-uncc-ink/60">
                    {enginePlain(row.engine)} · {runnerPlain(row.runner)} ·{" "}
                    {row.mentionedBrand ? "named us" : "did not name us"}
                    {row.branded ? " · branded question" : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div>
            {detailError ? <ErrorState message={detailError} /> : null}
            {!selected ? (
              <p className="text-sm text-uncc-ink/60">Select an answer to inspect.</p>
            ) : (
              <article className="space-y-3 rounded border border-uncc-rule bg-white p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="muted">{enginePlain(selected.draw.engine)}</Badge>
                  <Badge tone="muted">{runnerPlain(selected.draw.runner)}</Badge>
                  <Badge tone="muted">{fidelityPlain(selected.draw.fidelity)}</Badge>
                </div>
                <ChartCaption
                  context={{
                    engine: selected.draw.engine,
                    runner: selected.draw.runner,
                    fidelity: selected.draw.fidelity,
                    n: 1,
                    scanDate: selected.draw.capturedAt,
                  }}
                />
                <HowMeasured
                  context={{
                    engine: selected.draw.engine,
                    runner: selected.draw.runner,
                    fidelity: selected.draw.fidelity,
                    n: 1,
                    scanDate: selected.draw.capturedAt,
                    extra: `Judge model: ${selected.judge?.model ?? "unknown"}. Captured ${formatScanDate(selected.draw.capturedAt)}.`,
                  }}
                />
                <p className="text-sm font-medium">{selected.draw.promptText}</p>
                <div
                  className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-uncc-paper p-3 text-sm"
                  dangerouslySetInnerHTML={{
                    __html: annotateMentions(selected.answer.escapedText, selected.mentions),
                  }}
                />
                <section>
                  <h3 className="font-serif text-base font-semibold">Citations</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {selected.citations.map((c, i) => (
                      <li key={`${c.url}-${i}`}>
                        <span className="font-mono text-xs">{c.sourceClass}</span> · {c.domain} ·{" "}
                        <a className="text-uncc-green underline" href={c.url} target="_blank" rel="noreferrer">
                          link
                        </a>
                      </li>
                    ))}
                    {!selected.citations.length ? <li className="text-uncc-ink/60">None</li> : null}
                  </ul>
                </section>
                <section>
                  <h3 className="font-serif text-base font-semibold">Claims</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {selected.claims.map((c, i) => (
                      <li key={i}>
                        <Badge tone="muted">{c.verdict}</Badge> {c.text}
                      </li>
                    ))}
                    {!selected.claims.length ? <li className="text-uncc-ink/60">None</li> : null}
                  </ul>
                </section>
                <section>
                  <h3 className="font-serif text-base font-semibold">Follow-up queries</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {selected.fanoutQueries.map((f, i) => (
                      <li key={i}>{f.query}</li>
                    ))}
                    {!selected.fanoutQueries.length ? <li className="text-uncc-ink/60">None recorded</li> : null}
                  </ul>
                </section>
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function annotateMentions(
  escapedText: string,
  mentions: Array<{ entityType: string; span: { text: string } | null }>,
): string {
  let out = escapedText;
  for (const mention of mentions) {
    if (!mention.span?.text) continue;
    const label = mention.entityType === "brand" ? "our brand" : "competitor";
    const needle = mention.span.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    out = out.replace(
      needle,
      `<mark class="mention-${mention.entityType}" title="${label}">${needle}<span class="sr-only"> (${label})</span></mark>`,
    );
  }
  return out;
}

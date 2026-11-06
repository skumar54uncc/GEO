"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState, PartialDataNotice } from "@/components/PageStates";
import { Badge } from "@/components/ui/card";
import { answersChecked, enginePlain, formatScanDate } from "@/lib/ui/labels";

type OverviewCard = {
  campaignId: string;
  name: string;
  topic: string;
  status: string;
  legacy: boolean;
  latestScan: { id: string; createdAt: string; legacyMethod: boolean } | null;
  promptSetHash: string | null;
  headlines: Array<{
    engine: string;
    runner: string;
    fidelity: string;
    won: number;
    prompts: number;
    ciLow: number | null;
    ciHigh: number | null;
    draws: number;
    tooFewDraws: boolean;
  }>;
  openRecommendations: number;
  partial: boolean;
  emptyReason: string | null;
};

const pct = (x: number | null) => (x === null ? "unknown" : `${(x * 100).toFixed(0)}%`);

export default function OverviewPage() {
  const [cards, setCards] = useState<OverviewCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCards(json.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!cards) return <LoadingState label="Loading campaign summaries…" />;

  if (cards.length === 0) {
    return (
      <EmptyState title="No campaigns yet">
        <p>Create a campaign to start measuring AI search visibility. We never invent placeholder scores.</p>
        <Link className="mt-3 inline-block font-semibold text-uncc-green underline" href="/campaigns">
          Open Campaigns
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Overview</p>
        <h1 className="font-serif text-3xl font-semibold">AI search visibility</h1>
        <p className="mt-2 max-w-2xl text-uncc-ink/75">
          One summary per campaign. Engines stay separate. Questions that name the university are never mixed into these
          headlines.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <section key={card.campaignId} className="rounded border border-uncc-rule bg-white p-5" aria-labelledby={`c-${card.campaignId}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`c-${card.campaignId}`} className="font-serif text-xl font-semibold">
                {card.name}
              </h2>
              {card.legacy ? <Badge tone="gold">legacy method</Badge> : null}
              {card.latestScan?.legacyMethod ? <Badge tone="muted">legacy method</Badge> : null}
              {card.partial ? <Badge tone="muted">partial data</Badge> : null}
            </div>
            <p className="text-sm text-uncc-ink/60">{card.topic}</p>

            {!card.latestScan ? (
              <p className="mt-3 text-sm text-uncc-ink/70">{card.emptyReason}</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-uncc-ink/70">
                  Latest scan {formatScanDate(card.latestScan.createdAt)}
                  {card.openRecommendations ? ` · ${card.openRecommendations} open recommendations` : ""}
                </p>
                {card.partial ? (
                  <PartialDataNotice>Some answers are still being checked. Figures may change.</PartialDataNotice>
                ) : null}
                {card.headlines.length === 0 ? (
                  <p className="mt-3 text-sm text-uncc-ink/70">{card.emptyReason}</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {card.headlines.map((h) => (
                      <li key={`${h.engine}|${h.runner}`} className={h.tooFewDraws ? "opacity-60" : ""}>
                        <p className="font-medium">
                          {enginePlain(h.engine)}: {h.won} of {h.prompts} prompts
                          {h.ciLow !== null && h.ciHigh !== null ? (
                            <span className="text-sm font-normal text-uncc-ink/70">
                              {" "}
                              (95% CI {pct(h.ciLow)} to {pct(h.ciHigh)})
                            </span>
                          ) : null}
                        </p>
                        <ChartCaption
                          context={{
                            engine: h.engine,
                            runner: h.runner,
                            fidelity: h.fidelity,
                            n: h.draws,
                            scanDate: card.latestScan!.createdAt,
                            promptSetHash: card.promptSetHash,
                            legacyMethod: card.latestScan!.legacyMethod,
                          }}
                        />
                        <HowMeasured
                          context={{
                            engine: h.engine,
                            runner: h.runner,
                            fidelity: h.fidelity,
                            n: h.draws,
                            scanDate: card.latestScan!.createdAt,
                            promptSetHash: card.promptSetHash,
                            legacyMethod: card.latestScan!.legacyMethod,
                            extra: `Prompts won means UNC Charlotte was named in enough of the ${answersChecked(h.draws)} for that question.`,
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {/* Table view for accessibility — same numbers as cards */}
                {card.headlines.length ? (
                  <table className="mt-4 w-full text-left text-sm">
                    <caption className="sr-only">Prompts won by engine for {card.name}</caption>
                    <thead className="text-xs uppercase text-uncc-ink/60">
                      <tr>
                        <th className="py-1">Engine</th>
                        <th>Won</th>
                        <th>Of</th>
                        <th>Answers checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.headlines.map((h) => (
                        <tr key={`t-${h.engine}|${h.runner}`} className="border-t border-uncc-rule/60">
                          <td className="py-1">{enginePlain(h.engine)}</td>
                          <td>{h.won}</td>
                          <td>{h.prompts}</td>
                          <td>{h.draws}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </>
            )}
            <Link className="mt-4 inline-block text-sm font-semibold text-uncc-green underline" href={`/campaigns/${card.campaignId}/dashboard`}>
              Open campaign dashboard
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}

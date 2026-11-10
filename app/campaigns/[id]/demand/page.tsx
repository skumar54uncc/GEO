"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSessionRole } from "@/components/SessionRoleContext";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { demandStatusLabel, type CampaignDemandView, type DemandSignalRow, type DemandSourceCard } from "@/lib/demand/campaignView";

function statusTone(status: DemandSourceCard["status"]): "green" | "gold" | "muted" {
  if (status === "connected") return "green";
  if (status === "estimated") return "gold";
  return "muted";
}

function signalSummary(signal: DemandSignalRow): string {
  const v = signal.value ?? {};
  if (v.kind === "timeseries") {
    const pts = Array.isArray(v.points) ? v.points.length : 0;
    const regions = Array.isArray(v.byRegion) ? v.byRegion.length : 0;
    return `Interest over time (${pts} points) · ${regions} regions`;
  }
  if (v.kind === "keyword_volume") {
    return `Volume ${String(v.volume ?? "unknown")} (${String(v.volumeKind ?? "unknown")})`;
  }
  if (v.kind === "paa" && Array.isArray(v.questions)) return `${v.questions.length} PAA questions`;
  if (v.kind === "autocomplete" && Array.isArray(v.suggestions)) return `${v.suggestions.length} suggestions`;
  if (v.kind === "related_search" && Array.isArray(v.related)) return `${v.related.length} related`;
  if (v.kind === "exa_discussion" && Array.isArray(v.results)) return `${v.results.length} web/Reddit results`;
  if (v.kind === "search_console_query") {
    return `clicks ${String(v.clicks ?? "unknown")} · impressions ${String(v.impressions ?? "unknown")}`;
  }
  if (v.kind === "llm_mentions") return String(v.note ?? "LLM Mentions discovery");
  return signal.term;
}

export default function CampaignDemandPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const role = useSessionRole();
  const canEdit = role === "editor" || role === "admin";
  const [data, setData] = useState<CampaignDemandView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/demand`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as CampaignDemandView);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Demand · Scout";
  }, []);

  async function addAsCustomPrompt(signal: DemandSignalRow) {
    setBusy(signal.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_custom",
          text: signal.term,
          intent: "discovery",
          persona_id: null,
          branded: false,
          demand_evidence_ids: [signal.id],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMsg(`Draft prompt created from “${signal.term}” with demand evidence.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function estimateAndFetch(card: DemandSourceCard) {
    if (!canEdit) return;
    setBusy(card.source);
    setMsg(null);
    try {
      const estRes = await fetch(`/api/campaigns/${campaignId}/demand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: card.source, estimate_only: true }),
      });
      const estJson = await estRes.json();
      if (!estRes.ok) throw new Error(estJson.error ?? `HTTP ${estRes.status}`);
      if (card.status === "not_connected") {
        setMsg(`${card.label} is not connected.`);
        return;
      }
      const estimate = estJson.estimate as {
        paramsHash: string;
        units: number;
        priceUsd: null;
      };
      const fetchRes = await fetch(`/api/campaigns/${campaignId}/demand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: card.source,
          approval: {
            paramsHash: estimate.paramsHash,
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        }),
      });
      const fetchJson = await fetchRes.json();
      if (fetchRes.status === 409) {
        setMsg(fetchJson.error ?? "Estimate refused");
        return;
      }
      if (!fetchRes.ok) throw new Error(fetchJson.error ?? `HTTP ${fetchRes.status}`);
      if (fetchJson.snapshot) setData(fetchJson.snapshot as CampaignDemandView);
      else await load();
      setMsg(`Fetched ${card.label}: inserted ${fetchJson.inserted ?? 0}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading demand…" />;

  return (
    <div className="space-y-6" data-testid="demand-page">
      <PageTitle
        title="Demand"
        subtitle={`Search and discussion demand for ${data.campaign.name}. Missing sources show not connected — never zero.`}
      />
      <p className="text-sm text-scout-muted">
        <Link href={`/campaigns/${campaignId}/prompts`} className="underline">
          Prompts
        </Link>{" "}
        · evidence links return here by signal id.
      </p>
      {msg ? (
        <p className="text-sm" data-testid="demand-message" role="status">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-4">
        {data.sources.map((card) => (
          <ScoutCard key={card.source}>
            <div data-testid={`demand-source-${card.source}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl text-scout-text">{card.label}</h2>
                <p className="mt-1 text-sm text-scout-muted">
                  provider <code>{card.provider}</code>
                  {card.lastFetchAt ? ` · last fetch ${new Date(card.lastFetchAt).toLocaleString()}` : " · no fetch yet"}
                  {card.provenance ? ` · provenance ${card.provenance}` : ""}
                </p>
              </div>
              <Badge tone={statusTone(card.status)} data-testid={`demand-status-${card.source}`}>
                {demandStatusLabel(card.status, card.source)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-scout-muted">{card.note}</p>
            {card.status === "not_connected" || card.status === "approval_pending" ? (
              <p className="mt-3 text-sm font-medium" data-testid={`demand-empty-${card.source}`}>
                {demandStatusLabel(card.status, card.source)}
                {card.status === "not_connected" &&
                card.source !== "search_console" &&
                card.missing.length ? (
                  <span className="font-normal text-scout-muted">
                    {" "}
                    — missing <code>{card.missing.join(", ")}</code>
                  </span>
                ) : null}
              </p>
            ) : card.signals.length === 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium" data-testid={`demand-not-fetched-${card.source}`}>
                  {card.notFetchedYet ? "Connected, not fetched yet" : "No stored signals yet."}
                </p>
                <p className="text-sm text-scout-muted">No rows and no chart until a real fetch stores provenance.</p>
                {canEdit && card.status === "connected" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === card.source}
                    onClick={() => void estimateAndFetch(card)}
                    data-testid={`demand-fetch-${card.source}`}
                  >
                    Estimate & fetch
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {card.signals.map((signal) => (
                  <li
                    key={signal.id}
                    id={`demand-signal-${signal.id}`}
                    className="border-t border-scout-border pt-3"
                    data-testid={`demand-row-${signal.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-scout-text">{signal.term}</p>
                        <p className="text-sm text-scout-muted">{signalSummary(signal)}</p>
                        <SignalDetails signal={signal} />
                        <p className="mt-1 text-xs text-scout-muted">
                          fetched {new Date(signal.fetchedAt).toLocaleString()} · {signal.provenance}
                        </p>
                      </div>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === signal.id}
                          onClick={() => void addAsCustomPrompt(signal)}
                          data-testid={`demand-add-prompt-${signal.id}`}
                        >
                          Add as custom prompt
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </ScoutCard>
        ))}
      </div>

      {data.sources.every((s) => s.status === "not_connected" && s.signals.length === 0) ? (
        <EmptyState title="No demand sources connected">
          Connect Trends, Search Console, Exa, or DataForSEO under Settings. Cells stay blank until a real fetch or demo
          fixture exists.
        </EmptyState>
      ) : null}
    </div>
  );
}

function SignalDetails({ signal }: { signal: DemandSignalRow }) {
  const v = signal.value ?? {};
  if (v.kind === "timeseries") {
    const rising = Array.isArray(v.relatedRising) ? v.relatedRising : [];
    const related = Array.isArray(v.relatedQueries) ? v.relatedQueries : [];
    const regions = Array.isArray(v.byRegion) ? v.byRegion : [];
    return (
      <div className="mt-2 space-y-1 text-sm text-scout-muted">
        {regions.length ? (
          <p>
            By region:{" "}
            {regions
              .map((r) => {
                const row = r as { geo?: string; interest?: number };
                return `${row.geo ?? "?"} ${row.interest ?? "?"}`;
              })
              .join(" · ")}
          </p>
        ) : null}
        {rising.length ? (
          <p>
            Rising:{" "}
            {rising
              .map((r) => {
                const row = r as { query?: string; value?: string };
                return `${row.query ?? "?"} (${row.value ?? "?"})`;
              })
              .join("; ")}
          </p>
        ) : null}
        {related.length ? <p>Related: {(related as string[]).join("; ")}</p> : null}
      </div>
    );
  }
  if (v.kind === "paa" && Array.isArray(v.questions)) {
    return (
      <ul className="mt-2 list-disc pl-5 text-sm text-scout-muted">
        {(v.questions as string[]).map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    );
  }
  if (v.kind === "exa_discussion" && Array.isArray(v.results)) {
    return (
      <ul className="mt-2 space-y-1 text-sm">
        {(v.results as Array<{ title?: string; url?: string; venue?: string }>).map((r) => (
          <li key={r.url ?? r.title}>
            {r.url ? (
              <a href={r.url} className="underline" target="_blank" rel="noopener noreferrer nofollow">
                {r.title ?? r.url}
              </a>
            ) : (
              (r.title ?? "result")
            )}
            {r.venue ? <span className="text-scout-muted"> · {r.venue}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (v.kind === "autocomplete" && Array.isArray(v.suggestions)) {
    return <p className="mt-2 text-sm text-scout-muted">{(v.suggestions as string[]).join("; ")}</p>;
  }
  if (v.kind === "related_search" && Array.isArray(v.related)) {
    return <p className="mt-2 text-sm text-scout-muted">{(v.related as string[]).join("; ")}</p>;
  }
  if (v.kind === "llm_mentions" && Array.isArray(v.discoveries)) {
    return (
      <ul className="mt-2 list-disc pl-5 text-sm text-scout-muted">
        {(v.discoveries as Array<{ query?: string; surface?: string }>).map((d, i) => (
          <li key={`${d.query}-${i}`}>
            {d.query ?? "discovery"}
            {d.surface ? ` (${d.surface})` : ""}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

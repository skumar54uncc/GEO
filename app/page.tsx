"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronUp,
  FileText,
  Info,
  MessageSquare,
  PieChart,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import { HowMeasured } from "@/components/HowMeasured";
import { MetricValueScout } from "@/components/metrics/MetricValue";
import { ShowRawToggle } from "@/components/metrics/ShowRawToggle";
import { useMetricShowRaw } from "@/components/metrics/ShowRawContext";
import { useSessionRole } from "@/components/SessionRoleContext";
import { EmptyState, ErrorState, LoadingState, PartialDataNotice } from "@/components/PageStates";
import {
  CountUp,
  EngineChip,
  IntentPill,
  PageTitle,
  ScoutCard,
  Segmented,
  StatusBadge,
  TileIcon,
} from "@/components/scout/primitives";
import { VisibilityChart } from "@/components/scout/VisibilityChart";
import { SafeLink } from "@/components/site/client";
import { Button } from "@/components/ui/button";
import { safeHref } from "@/lib/url/safeHref";
import type { InstitutionRank } from "@/lib/metrics/institutions";
import type { SeriesComparison } from "@/lib/metrics/compare";
import type { PromptsWon, RateWithCi } from "@/lib/metrics/types";
import type { TrendScanPoint } from "@/lib/metrics/visibilityChart";
import type { OverviewQuestionRow } from "@/lib/overview/questions";
import { accuracyKpiBadge, kpiStatusFromComparison } from "@/lib/ui/kpiStatus";
import { enginePlain, formatScanDate, runnerPlain, shortHash } from "@/lib/ui/labels";

type OverviewCard = {
  campaignId: string;
  name: string;
  topic: string;
  status: string;
  legacy: boolean;
  latestScan: { id: string; createdAt: string; legacyMethod: boolean; scanStatus: string } | null;
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
    tooFewPrompts?: boolean;
    approximate?: boolean;
  }>;
  openRecommendations: number;
  partial: boolean;
  unjudgedCount: number;
  emptyReason: string | null;
};

type Dashboard = {
  campaign: { id: string; name: string; topic?: string; status?: string };
  organization: { name: string; brandId: string; brandName: string; isDemo?: boolean };
  target?: {
    metric: "prompts_won" | "citation_rate" | "share_of_voice";
    engine: string;
    value: number;
    date: string;
  } | null;
  peerAverageBenchmark?: { chat: number | null; google: number | null };
  analystNote?: {
    scanId: string;
    text: string;
    status: "draft" | "published";
    authorName: string | null;
    at: string;
  } | null;
  institutions: InstitutionRank[];
  promptSets: Array<{
    sha256: string | null;
    latestScan: { id: string; createdAt: string; status: string };
    rollup: {
      cells: Array<{
        key: { engine: string; runner: string; branded: boolean; regionId: string | null; personaId: string | null; personaGroup: string | null };
        draws: number;
        tooFewDraws: boolean;
        promptsWon: PromptsWon | null;
        citationRate: RateWithCi;
        shareOfVoice: RateWithCi;
        accuracy: { rate: RateWithCi | null; claims: number; contradicted: number; supported: number; unverifiable: number };
      }>;
    };
    previousScan: { id: string; createdAt: string } | null;
    comparisons: SeriesComparison[];
    trend: TrendScanPoint[];
  }>;
  alerts: Array<{ id: string; kind: string; message?: string | null; createdAt: string; payload?: unknown }>;
  modelEvents: Array<{ engine: string; occurredOn: string; note: string | null }>;
};

type AlertRow = { id: string; kind: string; createdAt: string; payload?: { detail?: string } | null };

const pct = (x: number | null | undefined) => (x == null ? "unknown" : `${(x * 100).toFixed(0)}%`);
const pct1 = (x: number | null | undefined) => (x == null ? "unknown" : `${(x * 100).toFixed(1)}%`);

function SignalBars({ named, of }: { named: number; of: number }) {
  const level = named <= 0 ? 0 : named <= Math.floor(of / 3) ? 1 : named < of ? 2 : 3;
  const fill =
    level === 0 ? "var(--border-input)" : level === 1 ? "var(--alert-amber)" : level === 2 ? "var(--alert-amber)" : "var(--alert-green)";
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap" aria-label={`${named} of ${of} engines`}>
      <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden>
        <rect x="0" y="10" width="4" height="6" rx="1" fill={level >= 1 ? fill : "var(--border-input)"} />
        <rect x="6" y="6" width="4" height="10" rx="1" fill={level >= 2 ? fill : "var(--border-input)"} />
        <rect x="12" y="2" width="4" height="14" rx="1" fill={level >= 3 ? fill : "var(--border-input)"} />
      </svg>
      <b className="text-sm font-semibold text-scout-text">
        {named} of {of}
      </b>
      <span className="text-xs text-scout-muted">engines</span>
    </div>
  );
}

function RateLine({ r, showRaw, canShowRaw }: { r: RateWithCi; showRaw: boolean; canShowRaw: boolean }) {
  return (
    <MetricValueScout value={r} showRaw={showRaw} canShowRaw={canShowRaw} grey={r.tooFewDraws} />
  );
}

export default function OverviewPage() {
  const [cards, setCards] = useState<OverviewCard[] | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [engineKey, setEngineKey] = useState<string | null>(null);
  const [qTab, setQTab] = useState<"all" | "lost" | "won">("all");
  const [qOffset, setQOffset] = useState(0);
  const [includeBranded, setIncludeBranded] = useState(false);
  const [oqRows, setOqRows] = useState<OverviewQuestionRow[]>([]);
  const [oqTotal, setOqTotal] = useState(0);
  const [oqTabCounts, setOqTabCounts] = useState({ all: 0, lost: 0, won: 0 });
  const [oqHiddenBranded, setOqHiddenBranded] = useState(0);
  const [oqLoading, setOqLoading] = useState(false);
  const [oqError, setOqError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState<"chat" | "google">("chat");
  const { showRaw } = useMetricShowRaw();
  const role = useSessionRole();
  const canShowRaw = role === "editor" || role === "admin";

  const qLimit = 20;

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/overview", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const list = json.campaigns as OverviewCard[];
      setCards(list);
      const pick =
        list.find((c) => c.headlines.length > 0 && !c.legacy) ??
        list.find((c) => c.headlines.length > 0) ??
        list.find((c) => c.status === "active") ??
        list[0];
      if (pick) {
        setCampaignId(pick.campaignId);
        const [dashRes, alertRes] = await Promise.all([
          fetch(`/api/campaigns/${pick.campaignId}/dashboard`, { cache: "no-store" }),
          fetch(`/api/alerts?campaignId=${pick.campaignId}`, { cache: "no-store" }),
        ]);
        const dash = await dashRes.json();
        if (dashRes.ok) {
          setDashboard(dash as Dashboard);
          const cells = (dash as Dashboard).promptSets?.[0]?.rollup?.cells ?? [];
          const first = cells.find(
            (c: { key: { branded: boolean; personaId: string | null; regionId: string | null } }) =>
              !c.key.branded && !c.key.personaId && !c.key.regionId,
          );
          if (first) setEngineKey(`${first.key.engine}|${first.key.runner}`);
        }
        if (alertRes.ok) {
          const a = await alertRes.json();
          setAlerts(a.alerts ?? []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Overview · Scout";
  }, []);

  const view = dashboard?.promptSets?.[0] ?? null;
  const orgBrandName = dashboard?.organization?.brandName ?? "";

  const cells = useMemo(() => {
    const all = view?.rollup.cells ?? [];
    return all.filter((c) => !c.key.branded && c.key.personaId == null && c.key.personaGroup == null && c.key.regionId == null);
  }, [view]);

  const engines = useMemo(() => {
    const chat = ["chatgpt", "gemini", "claude", "perplexity"];
    const google = ["google_aio", "google_ai_mode"];
    const allow = surface === "chat" ? chat : google;
    return cells.filter((c) => allow.includes(c.key.engine));
  }, [cells, surface]);

  const active = engines.find((c) => `${c.key.engine}|${c.key.runner}` === engineKey) ?? engines[0] ?? null;

  useEffect(() => {
    if (engines.length && !engines.some((c) => `${c.key.engine}|${c.key.runner}` === engineKey)) {
      setEngineKey(`${engines[0].key.engine}|${engines[0].key.runner}`);
    }
  }, [engines, engineKey]);

  useEffect(() => {
    setQOffset(0);
  }, [qTab, includeBranded, active?.key.engine, active?.key.runner]);

  useEffect(() => {
    if (!campaignId || !active) {
      setOqRows([]);
      setOqTotal(0);
      setOqTabCounts({ all: 0, lost: 0, won: 0 });
      setOqHiddenBranded(0);
      return;
    }
    const engineOnly = active.key.engine;
    let cancelled = false;
    setOqLoading(true);
    setOqError(null);
    const params = new URLSearchParams({
      tab: qTab,
      engine: engineOnly,
      offset: String(qOffset),
      limit: String(qLimit),
    });
    if (includeBranded) params.set("includeBranded", "1");
    void fetch(`/api/campaigns/${campaignId}/overview-questions?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json as {
          rows: OverviewQuestionRow[];
          total: number;
          tabCounts?: { all: number; lost: number; won: number };
          hiddenBrandedCount?: number;
        };
      })
      .then((data) => {
        if (!cancelled) {
          setOqRows(data.rows ?? []);
          setOqTotal(typeof data.total === "number" ? data.total : 0);
          setOqTabCounts(data.tabCounts ?? { all: 0, lost: 0, won: 0 });
          setOqHiddenBranded(typeof data.hiddenBrandedCount === "number" ? data.hiddenBrandedCount : 0);
        }
      })
      .catch((err) => {
        if (!cancelled) setOqError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setOqLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, active, qTab, qOffset, includeBranded, qLimit]);

  const comparison = active
    ? view?.comparisons.find((c) => c.series.engine === active.key.engine && c.series.runner === active.key.runner && !c.series.branded)
    : null;

  const topEngine = useMemo(() => {
    return [...cells].sort((a, b) => (b.promptsWon?.won ?? 0) - (a.promptsWon?.won ?? 0))[0] ?? null;
  }, [cells]);

  const card = cards?.find((c) => c.campaignId === campaignId) ?? cards?.[0] ?? null;

  if (error) return <ErrorState message={error} />;
  if (!cards) return <LoadingState label="Loading overview…" />;
  if (cards.length === 0) {
    return (
      <EmptyState title="No campaigns yet">
        <p>Create a campaign to start measuring AI search visibility. We never invent placeholder scores.</p>
        <Link className="mt-3 inline-block font-semibold text-scout-brand underline" href="/campaigns">
          Open Campaigns
        </Link>
      </EmptyState>
    );
  }

  const won = active?.promptsWon;
  const cite = active?.citationRate;
  const sov = active?.shareOfVoice;
  const accuracy = active?.accuracy;

  const latestPoint =
    view?.trend.length && active
      ? view.trend[view.trend.length - 1]?.series?.find((s) => s.engine === active.key.engine && s.runner === active.key.runner)?.promptsWon
      : undefined;

  const answersCheckedN = cells.reduce((s, c) => s + c.draws, 0);
  const citationsApprox = cells.reduce((s, c) => {
    if (c.citationRate.rate == null || c.citationRate.n <= 0) return s;
    return s + Math.round(c.citationRate.rate * c.citationRate.n);
  }, 0);

  const comparisonLabelForKpis = comparison?.label ?? null;

  const promptsWonStatus = kpiStatusFromComparison(comparisonLabelForKpis);
  const citeStatus = kpiStatusFromComparison(comparisonLabelForKpis);
  const sovStatus = kpiStatusFromComparison(comparisonLabelForKpis);

  const accBadge = accuracyKpiBadge(accuracy?.contradicted ?? 0);

  const uj = card?.unjudgedCount ?? 0;
  const scanSt = card?.latestScan?.scanStatus ?? "";
  const partialNotice =
    uj > 0 ? (
      <PartialDataNotice>
        This scan is partial. {uj} {uj === 1 ? "answer was" : "answers were"} never judged and are left out of every number.
      </PartialDataNotice>
    ) : card?.partial && scanSt === "running" ? (
      <PartialDataNotice>Some answers are still being checked. Figures may change.</PartialDataNotice>
    ) : card?.partial ? (
      <PartialDataNotice>
        This scan is partial. Figures may change when judging finishes.
      </PartialDataNotice>
    ) : null;

  return (
    <div className="space-y-scout-gap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title={card ? `${card.name}` : "Overview"}
          subtitle={card?.topic ?? "AI search visibility across engines"}
        />
        <div className="flex flex-wrap items-center gap-2">
          {campaignId ? (
            <Button asChild variant="outline" size="sm" data-testid="leadership-pdf-link">
              <SafeLink href={`/api/campaigns/${campaignId}/leadership-pdf`} className="inline-flex items-center">
                Leadership PDF
              </SafeLink>
            </Button>
          ) : null}
          <Segmented
            value={surface}
            onChange={setSurface}
            options={[
              { value: "chat", label: "Chat engines" },
              { value: "google", label: "Google surfaces" },
            ]}
          />
        </div>
      </div>

      {dashboard?.analystNote?.status === "published" ? (
        <div
          className="rounded-[12px] border border-scout-border bg-scout-card px-4 py-3 shadow-scout"
          data-testid="analyst-note"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-scout-muted">Analyst note</p>
          <p className="mt-1 text-sm leading-6 text-scout-text">{dashboard.analystNote.text}</p>
          <p className="mt-1 text-xs text-scout-muted">
            {dashboard.analystNote.authorName ?? "Editor"} · {formatScanDate(dashboard.analystNote.at)}
          </p>
        </div>
      ) : dashboard?.analystNote?.status === "draft" && canShowRaw ? (
        <div
          className="rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3"
          data-testid="analyst-note-draft"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Draft</p>
          <p className="mt-1 text-sm leading-6 text-amber-950">{dashboard.analystNote.text}</p>
          <p className="mt-1 text-xs text-amber-800">AI draft — edit and approve before it appears for leadership.</p>
        </div>
      ) : null}

      {partialNotice}

      <div className="chips flex flex-wrap items-center gap-1.5 text-[12.5px] text-scout-muted">
        <span>Engine</span>
        {engines.map((c) => {
          const key = `${c.key.engine}|${c.key.runner}`;
          return (
            <EngineChip key={key} active={key === `${active?.key.engine}|${active?.key.runner}`} onClick={() => setEngineKey(key)}>
              {enginePlain(c.key.engine)}
            </EngineChip>
          );
        })}
        {active ? <span className="ml-1.5">· {runnerPlain(active.key.runner)}</span> : null}
      </div>

      {!active ? (
        <EmptyState title="No judged answers for this surface">
          <p>{card?.emptyReason ?? "Run a measured scan to populate this overview."}</p>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-scout-gap md:grid-cols-2 xl:grid-cols-4">
            <ScoutCard hover delayMs={0} padded={false} className="flex gap-3.5 p-4">
              <TileIcon tone="blue">
                <Trophy size={20} strokeWidth={2} />
              </TileIcon>
              <div>
                <div className="text-sm font-medium text-scout-text">Prompts won</div>
                {won ? (
                  <div className="mt-1 text-scout-kpi text-scout-text">
                    <MetricValueScout value={won} showRaw={showRaw} canShowRaw={canShowRaw} grey={active.tooFewDraws} className="block" />
                  </div>
                ) : null}
                {dashboard?.target?.metric === "prompts_won" &&
                (!dashboard.target.engine || dashboard.target.engine === active.key.engine) ? (
                  <p className="mt-1 text-xs text-scout-muted" data-testid="kpi-target-prompts-won">
                    Target {(dashboard.target.value * 100).toFixed(0)}% by {dashboard.target.date}
                  </p>
                ) : null}
                <div className="mt-1.5">
                  {(() => {
                    const status = promptsWonStatus;
                    if (status.tone === "gain" && status.showPositiveDelta && comparison && won) {
                      const delta = comparison.wonAfter - comparison.wonBefore;
                      return (
                        <StatusBadge tone="gain">
                          <ChevronUp size={12} strokeWidth={2.6} />+{delta} prompts, {status.label}
                        </StatusBadge>
                      );
                    }
                    if (status.tone === "decline") {
                      return <StatusBadge tone="decline">{status.label}</StatusBadge>;
                    }
                    return <StatusBadge tone="noise">{status.label}</StatusBadge>;
                  })()}
                </div>
              </div>
            </ScoutCard>

            <ScoutCard hover delayMs={50} padded={false} className="flex gap-3.5 p-4">
              <TileIcon tone="green">
                <FileText size={20} strokeWidth={2} />
              </TileIcon>
              <div>
                <div className="text-sm font-medium text-scout-text">Citation rate</div>
                {cite ? (
                  <div className="mt-1 text-scout-kpi text-scout-text">
                    <MetricValueScout value={cite} showRaw={showRaw} canShowRaw={canShowRaw} grey={active.tooFewDraws} className="block" />
                  </div>
                ) : null}
                <div className="mt-1.5">
                  <StatusBadge tone={citeStatus.tone === "decline" ? "decline" : citeStatus.tone === "gain" ? "gain" : "noise"}>
                    {citeStatus.label}
                  </StatusBadge>
                </div>
              </div>
            </ScoutCard>

            <ScoutCard hover delayMs={100} padded={false} className="flex gap-3.5 p-4">
              <TileIcon tone="amber">
                <PieChart size={20} strokeWidth={2} />
              </TileIcon>
              <div>
                <div className="text-sm font-medium text-scout-text">Share of voice</div>
                {sov ? (
                  <div className="mt-1 text-scout-kpi text-scout-text">
                    <MetricValueScout value={sov} showRaw={showRaw} canShowRaw={canShowRaw} grey={active.tooFewDraws} className="block" />
                  </div>
                ) : null}
                {(() => {
                  const peer =
                    surface === "chat"
                      ? dashboard?.peerAverageBenchmark?.chat
                      : dashboard?.peerAverageBenchmark?.google;
                  return peer != null ? (
                    <p className="mt-1 text-xs text-scout-muted" data-testid="kpi-peer-average">
                      Peer average {(peer * 100).toFixed(0)}%
                    </p>
                  ) : null;
                })()}
                <div className="mt-1.5">
                  <StatusBadge tone={sovStatus.tone === "decline" ? "decline" : sovStatus.tone === "gain" ? "gain" : "noise"}>
                    {sovStatus.label}
                  </StatusBadge>
                </div>
              </div>
            </ScoutCard>

            <ScoutCard hover delayMs={150} padded={false} className="flex gap-3.5 p-4">
              <TileIcon tone="purple">
                <ShieldAlert size={20} strokeWidth={2} />
              </TileIcon>
              <div>
                <div className="text-sm font-medium text-scout-text">Accuracy issues</div>
                <div className="text-scout-kpi text-scout-text">
                  <CountUp value={accuracy?.contradicted ?? 0} />
                  <small className="ml-1 text-sm font-medium text-scout-muted">claims</small>
                </div>
                <div className="text-scout-caption text-scout-muted">Of {accuracy?.claims ?? 0} claims checked</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={accBadge.tone === "decline" ? "decline" : "noise"}>{accBadge.label}</StatusBadge>
                  {(accuracy?.contradicted ?? 0) > 0 ? (
                    <Link
                      href={safeHref(campaignId ? `/campaigns/${campaignId}/answers` : "/campaigns") ?? "/campaigns"}
                      className="text-[11.5px] font-semibold text-[var(--status-decline-fg)]"
                    >
                      Review in Answers
                    </Link>
                  ) : null}
                </div>
              </div>
            </ScoutCard>
          </div>

          <div className="grid gap-scout-gap xl:grid-cols-[1.62fr_1fr]">
            <ScoutCard delayMs={200}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-scout-card text-scout-text">AI search visibility</h2>
                  <p className="mt-1 text-[13px] text-scout-muted">
                    Share of prompts where {enginePlain(active.key.engine)} names us in at least half of valid answers
                  </p>
                </div>
                <div className="flex items-center gap-4 rounded-xl border border-scout-border px-3.5 py-2 text-[12.5px] text-scout-muted">
                  <div>
                    Latest scan
                    <b className="block font-medium text-scout-text">{formatScanDate(view?.latestScan.createdAt)}</b>
                    {view?.trend.some((t) => t.isBaseline && t.scanId === view.latestScan.id) ? (
                      <span className="mt-0.5 inline-block text-[11px] font-semibold text-scout-brand" data-testid="baseline-scan-badge">
                        Baseline
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[19px] font-bold text-scout-chart">
                    {latestPoint ? (
                      <MetricValueScout value={latestPoint} showRaw={showRaw} canShowRaw={canShowRaw} grey={active.tooFewDraws} className="text-[19px] font-bold" />
                    ) : null}
                  </div>
                </div>
              </div>
              {view ? (
                <VisibilityChart
                  trend={view.trend}
                  targetValue={
                    dashboard?.target &&
                    dashboard.target.metric === "prompts_won" &&
                    (!dashboard.target.engine || dashboard.target.engine === active.key.engine)
                      ? dashboard.target.value
                      : null
                  }
                  engine={active.key.engine}
                  runner={active.key.runner}
                  events={dashboard?.modelEvents ?? []}
                  showRaw={showRaw}
                  canShowRaw={canShowRaw}
                />
              ) : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-scout-muted">
                <div className="flex items-center gap-2">
                  <i className="inline-block h-1 w-[22px] rounded-sm bg-scout-chart" />
                  <span>
                    <b className="font-medium text-scout-text">Prompts won</b> · lines show the 95% range, n = {won?.prompts ?? 0} prompts
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-scout-pill bg-[var(--tile-blue-bg)] px-2.5 py-1 text-[var(--intent-comparison-fg)]">
                  <Info size={13} strokeWidth={1.8} />
                  Same prompt set {shortHash(view?.sha256 ?? card?.promptSetHash)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <HowMeasured
                  context={{
                    engine: active.key.engine,
                    runner: active.key.runner,
                    fidelity: active.key.runner === "ui_provider" ? "high" : active.key.runner === "api_parametric" ? "low" : "medium",
                    n: active.draws,
                    scanDate: view?.latestScan.createdAt,
                    promptSetHash: view?.sha256 ?? card?.promptSetHash,
                    legacyMethod: card?.latestScan?.legacyMethod,
                    brandedSeparate: true,
                  }}
                />
                <ShowRawToggle />
              </div>
            </ScoutCard>

            <ScoutCard delayMs={250}>
              <h2 className="text-scout-card text-scout-text">Top engine by prompts won</h2>
              {topEngine?.promptsWon ? (
                <>
                  <p className="mt-1 text-[13px] text-scout-muted">{enginePlain(topEngine.key.engine)} · {runnerPlain(topEngine.key.runner)}</p>
                  <div className="mt-2 text-[28px] font-bold tracking-tight text-scout-text">
                    <MetricValueScout value={topEngine.promptsWon} showRaw={showRaw} canShowRaw={canShowRaw} grey={topEngine.tooFewDraws} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-scout-muted">No prompts-won cell yet.</p>
              )}
              <p className="mb-1 mt-4 text-[13px] text-scout-muted">
                Most mentioned institutions · {surface === "chat" ? "chat engines" : "Google surfaces"}
              </p>
              {dashboard?.institutions?.length ? (
                dashboard.institutions.map((inst) => {
                  const isUs = inst.isUs;
                  return (
                    <div
                      key={inst.entityId}
                      className="flex items-center gap-3 border-b border-[var(--border-nav)] py-2.5 last:border-0"
                    >
                      <div
                        className="grid h-8 w-8 place-items-center rounded-[9px] text-[11.5px] font-bold"
                        style={
                          isUs
                            ? { background: "var(--tile-green-bg)", color: "var(--brand)" }
                            : { background: "var(--scout-page)", color: "var(--text-nav)" }
                        }
                      >
                        {inst.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <b className="block text-sm font-medium" style={isUs ? { color: "var(--brand)" } : { color: "var(--scout-text)" }}>
                          {isUs ? orgBrandName || inst.name : inst.name}
                        </b>
                        {isUs ? <span className="text-xs text-scout-muted">That&apos;s us</span> : null}
                      </div>
                      <div className="ml-auto text-sm font-semibold">{pct1(inst.rate)}</div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-scout-muted">No institution mentions in this index yet for the latest scan.</p>
              )}
              <p className="mt-2 text-scout-caption text-scout-muted">
                Peer ranks appear when competitor mention rates are available from the same cell. We never invent peer percentages.
              </p>
            </ScoutCard>
          </div>

          <div className="grid gap-scout-gap xl:grid-cols-[1.62fr_1fr]">
            <ScoutCard delayMs={300}>
              <div data-testid="overview-questions" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-scout-card text-scout-text">Questions</h2>
                  <p className="mt-1 text-[13px] text-scout-muted">From the latest scan, filtered by engine and tab</p>
                </div>
                <Segmented
                  value={qTab}
                  onChange={setQTab}
                  options={[
                    { value: "all", label: `All ${oqTabCounts.all}` },
                    { value: "lost", label: `Lost ${oqTabCounts.lost}` },
                    { value: "won", label: `Won ${oqTabCounts.won}` },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-scout-muted">
                  <input
                    type="checkbox"
                    className="rounded border-scout-border"
                    checked={includeBranded}
                    onChange={(e) => setIncludeBranded(e.target.checked)}
                  />
                  Show location-biased
                </label>
                {oqLoading ? <span className="text-xs text-scout-muted">Loading…</span> : null}
                {oqError ? <span className="text-xs text-[var(--status-decline-fg)]">{oqError}</span> : null}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-scout-body">
                  <caption className="sr-only">
                    Questions from the latest scan, with named-by engines, last scan date, and intent
                  </caption>
                  <thead>
                    <tr>
                      {["Question", "Named by", "Last scan", "Intent"].map((h, i, arr) => (
                        <th
                          key={h}
                          className={`bg-scout-page px-3.5 py-2.5 text-left font-medium text-[var(--text-nav)] border-y border-scout-border ${i === 0 ? "rounded-l-[10px] border-l" : ""} ${i === arr.length - 1 ? "rounded-r-[10px] border-r" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {oqTotal === 0 && !oqLoading ? (
                      <tr>
                        <td colSpan={4} className="border-b border-[var(--border-nav)] px-3.5 py-6 text-center text-scout-muted">
                          {oqHiddenBranded > 0 && !includeBranded ? (
                            <span>
                              {oqHiddenBranded} {oqHiddenBranded === 1 ? "prompt" : "prompts"} hidden as location-biased.{" "}
                              <button
                                type="button"
                                className="font-semibold text-scout-brand underline"
                                onClick={() => setIncludeBranded(true)}
                              >
                                Show them.
                              </button>
                            </span>
                          ) : (
                            "No prompts match this filter."
                          )}
                        </td>
                      </tr>
                    ) : (
                      oqRows.map((row) => (
                        <tr key={row.promptId}>
                          <td className="max-w-md border-b border-[var(--border-nav)] px-3.5 py-3 align-top">
                            <span className="font-medium text-scout-text">{row.text}</span>
                            {row.audience ? (
                              <div className="mt-1 flex items-center gap-1 text-[11.5px] font-normal text-scout-muted">
                                <Users size={12} strokeWidth={1.8} /> {row.audience}
                              </div>
                            ) : null}
                            {row.branded ? (
                              <div className="mt-1 text-[11px] text-scout-muted">Location-biased prompt</div>
                            ) : null}
                          </td>
                          <td className="border-b border-[var(--border-nav)] px-3.5 py-3 align-top">
                            <SignalBars named={row.namedByEngines} of={row.enginesTotal} />
                          </td>
                          <td className="border-b border-[var(--border-nav)] px-3.5 py-3 text-[var(--text-nav)]">
                            {formatScanDate(row.lastScanAt)}
                          </td>
                          <td className="border-b border-[var(--border-nav)] px-3.5 py-3 align-top">
                            <IntentPill intent={row.intent} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {oqTotal > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-scout-muted">
                    Showing {qOffset + 1}–{Math.min(qOffset + oqRows.length, oqTotal)} of {oqTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={qOffset <= 0} onClick={() => setQOffset((o) => Math.max(0, o - qLimit))}>
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={qOffset + qLimit >= oqTotal}
                      onClick={() => setQOffset((o) => o + qLimit)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
              {campaignId ? (
                <Link className="inline-block text-sm font-medium text-scout-brand underline" href={safeHref(`/campaigns/${campaignId}/answers`) ?? "/campaigns"}>
                  Open Answer Explorer
                </Link>
              ) : null}
              </div>
            </ScoutCard>

            <ScoutCard delayMs={320}>
              <div data-testid="ga4-panel">
                <h2 className="text-scout-card text-scout-text">AI referral traffic (GA4)</h2>
                <p className="mt-2 text-scout-body text-scout-muted" data-testid="ga4-status">
                  Not connected (GA4 access pending from the web team)
                </p>
              </div>
            </ScoutCard>

            <ScoutCard delayMs={330}>
              <div data-testid="gsc-panel">
                <h2 className="text-scout-card text-scout-text">Branded search impressions (Search Console)</h2>
                <p className="mt-2 text-scout-body text-scout-muted" data-testid="gsc-status">
                  Not connected (property access pending from the web team)
                </p>
              </div>
            </ScoutCard>

            <ScoutCard delayMs={350}>
              <h2 className="text-scout-card text-scout-text">Activity</h2>
              <p className="text-[13px] text-scout-muted">From the latest scan</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link href={safeHref(campaignId ? `/campaigns/${campaignId}/answers` : "/campaigns") ?? "/campaigns"} className="rounded-xl bg-scout-page px-1.5 py-3 text-center no-underline">
                  <div className="mx-auto mb-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--tile-blue-bg)] text-[var(--tile-blue-fg)]">
                    <MessageSquare size={15} strokeWidth={2} />
                  </div>
                  <b className="block text-[17px] text-scout-text">{answersCheckedN}</b>
                  <span className="text-xs text-scout-muted">AI answers checked</span>
                </Link>
                <Link href={safeHref(campaignId ? `/campaigns/${campaignId}/dashboard` : "/campaigns") ?? "/campaigns"} className="rounded-xl bg-scout-page px-1.5 py-3 text-center no-underline">
                  <div className="mx-auto mb-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--tile-green-bg)] text-[var(--tile-green-fg)]">
                    <LayersIcon />
                  </div>
                  <b className="block text-[17px] text-scout-text">{cells.length}</b>
                  <span className="text-xs text-scout-muted">Engines tracked</span>
                </Link>
                <Link href={safeHref(campaignId ? `/campaigns/${campaignId}/citations` : "/campaigns") ?? "/campaigns"} className="rounded-xl bg-scout-page px-1.5 py-3 text-center no-underline">
                  <div className="mx-auto mb-2 grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--tile-amber-bg)] text-[var(--tile-amber-fg)]">
                    <FileText size={15} strokeWidth={2} />
                  </div>
                  <b className="block text-[17px] text-scout-text">{citationsApprox || "—"}</b>
                  <span className="text-xs text-scout-muted">Owned citation hits</span>
                </Link>
              </div>
              <p id="alerts" className="mb-1 mt-4 scroll-mt-24 text-[13px] text-scout-muted">
                Recent alerts
              </p>
              {(alerts.length ? alerts : dashboard?.alerts ?? []).slice(0, 5).map((a) => {
                const kind = a.kind ?? "";
                const tone =
                  kind.includes("decline") || kind.includes("error") || kind.includes("lost")
                    ? "var(--alert-red)"
                    : kind.includes("budget")
                      ? "var(--alert-amber)"
                      : "var(--alert-green)";
                return (
                  <div key={a.id} className="flex justify-between gap-2 border-b border-[var(--border-nav)] py-2.5 text-scout-body last:border-0">
                    <div>
                      <b className="font-medium text-scout-text">{kind.replace(/_/g, " ")}</b>
                      <small className="mt-0.5 block text-[12.5px] text-scout-muted">{formatScanDate(a.createdAt)}</small>
                    </div>
                    <time className="flex items-center gap-1.5 whitespace-nowrap text-xs text-scout-muted">
                      <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                      open
                    </time>
                  </div>
                );
              })}
              {(alerts.length ? alerts : dashboard?.alerts ?? []).length === 0 ? (
                <p className="text-scout-caption text-scout-muted">No open alerts for this campaign.</p>
              ) : null}
            </ScoutCard>
          </div>

          {/* Accessible table twin of KPI cards */}
          <div className="sr-only" aria-hidden={false}>
            <h2>Engine rates table</h2>
            <table>
              <thead>
                <tr>
                  <th>Engine</th>
                  <th>Runner</th>
                  <th>Prompts won</th>
                  <th>Citation rate</th>
                  <th>n</th>
                </tr>
              </thead>
              <tbody>
                {engines.map((c) => (
                  <tr key={`${c.key.engine}|${c.key.runner}`}>
                    <td>{enginePlain(c.key.engine)}</td>
                    <td>{runnerPlain(c.key.runner)}</td>
                    <td>{c.promptsWon ? `${c.promptsWon.won} of ${c.promptsWon.prompts}` : "n/a"}</td>
                    <td>
                      <RateLine r={c.citationRate} showRaw={showRaw} canShowRaw={canShowRaw} />
                    </td>
                    <td>{c.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

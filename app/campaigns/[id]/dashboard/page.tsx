"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { MetricValue } from "@/components/metrics/MetricValue";
import { ShowRawToggle } from "@/components/metrics/ShowRawToggle";
import { useMetricShowRaw } from "@/components/metrics/ShowRawContext";
import { useSessionRole } from "@/components/SessionRoleContext";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { PageTitle } from "@/components/scout/primitives";
import { VisibilityChart } from "@/components/scout/VisibilityChart";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENGINES, fidelityFor } from "@/lib/capture/types";
import type { CellRollup, ScanRollup } from "@/lib/metrics/rollup";
import type { SeriesComparison } from "@/lib/metrics/compare";
import { displayable } from "@/lib/metrics/displayable";
import type { PromptsWon, RateWithCi } from "@/lib/metrics/types";
import { enginePlain, formatScanDate, runnerPlain } from "@/lib/ui/labels";

type AlertRow = { id: string; kind: string; status: string; createdAt: string; payload: { message?: string } | null };
type ModelEventRow = { id: string; engine: string; occurredOn: string; note: string; sourceUrl: string | null };
type Trend = {
  scanId: string;
  createdAt: string;
  isBaseline?: boolean;
  series: Array<{ engine: string; runner: string; promptsWon: PromptsWon; citationRate?: RateWithCi }>;
};
type PromptSetView = {
  promptSetId: string;
  version: number;
  sha256: string | null;
  scanCount: number;
  latestScan: { id: string; createdAt: string; status: string };
  rollup: ScanRollup;
  previousScan: { id: string; createdAt: string } | null;
  comparisons: SeriesComparison[];
  trend: Trend[];
};
type CoverageCell = {
  intent: string;
  engine: string;
  runner: string;
  label: "strong" | "partial" | "invisible" | "suppressed";
  kOfN: string | null;
  won: { rate: number | null; won: number; prompts: number; draws: number; tooFewDraws: boolean; tooFewPrompts?: boolean };
};

type RegionComparisonCell = {
  regionId: string;
  regionLabel: string;
  engine: string;
  runner: string;
  locationSupport: "supported" | "not_supported";
  honoredMix: { yes: number; unknown: number; no: number; total: number };
  display: string;
  displayable: boolean;
};

type Dashboard = {
  campaign: { id: string; name: string; topic: string; status: string };
  target?: {
    metric: "prompts_won" | "citation_rate" | "share_of_voice";
    engine: string;
    value: number;
    date: string;
  } | null;
  peerAverageBenchmark?: { chat: number | null; google: number | null };
  coverageMatrix?: CoverageCell[];
  regionComparison?: RegionComparisonCell[];
  regions: Array<{ id: string; label: string }>;
  personas: Array<{ id: string; name: string; key?: string | null; group?: string | null }>;
  persona_groups: Array<{ key: string; label: string }>;
  promptSets: PromptSetView[];
  alerts: AlertRow[];
  modelEvents: ModelEventRow[];
  annotations?: Array<{ id: string; kind: string; occurredOn: string; note: string }>;
};

const engineLabel = enginePlain;
const runnerLabel = runnerPlain;
const pct = (x: number | null) => (x === null ? "unknown" : `${(x * 100).toFixed(1)}%`);
const date = formatScanDate;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

function Headline({
  cell,
  scanDate,
  promptSetHash,
  showRaw,
  canShowRaw,
}: {
  cell: CellRollup;
  scanDate: string;
  promptSetHash: string | null;
  showRaw: boolean;
  canShowRaw: boolean;
}) {
  const w = cell.promptsWon;
  if (!w) return null;
  const grey = cell.tooFewDraws;
  const fidelity = fidelityFor(cell.key.runner);
  return (
    <div
      className={`rounded border p-4 ${
        grey ? "border-dashed border-uncc-rule bg-uncc-paper" : "border-uncc-rule bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
        {engineLabel(cell.key.engine)} · {runnerLabel(cell.key.runner)}
      </p>
      <p className="mt-1 font-serif text-xl text-uncc-ink">
        <MetricValue value={w} showRaw={showRaw} canShowRaw={canShowRaw} grey={grey} />
      </p>
      <ChartCaption
        context={{
          engine: cell.key.engine,
          runner: cell.key.runner,
          fidelity,
          n: w.draws,
          scanDate,
          promptSetHash,
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <HowMeasured
          context={{
            engine: cell.key.engine,
            runner: cell.key.runner,
            fidelity,
            n: w.draws,
            scanDate,
            promptSetHash,
            extra: `Won means UNC Charlotte was named under the ${w.rule} rule.`,
          }}
        />
      </div>
      {grey ? <Badge tone="muted" className="mt-2">Too few answers checked (under 30)</Badge> : null}
    </div>
  );
}

function CellTable({ cells, showWon }: { cells: CellRollup[]; showWon: boolean }) {
  const { showRaw } = useMetricShowRaw();
  const role = useSessionRole();
  const canShowRaw = role === "editor" || role === "admin";
  if (cells.length === 0) return <p className="text-sm text-uncc-ink/60">No valid judged draws in this selection yet.</p>;
  return (
    <div className="w-full overflow-x-auto rounded-[12px] border border-scout-border">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid="dashboard-metrics-table">
        <caption className="sr-only">Campaign metrics by engine and how answers were collected</caption>
        <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
          <tr className="border-b border-uncc-rule">
            <th className="py-2 pr-3">Engine · how collected</th>
            <th className="pr-3">Answers · prompts</th>
            {showWon ? <th className="pr-3">Prompts won</th> : null}
            <th className="pr-3">Mention rate</th>
            <th className="pr-3">Owned citation rate</th>
            <th className="pr-3">First mention</th>
            <th className="pr-3">Share of voice</th>
            <th className="pr-3">Position</th>
            <th className="pr-3">Consistency</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => {
            const acc = c.accuracy.rate;
            return (
              <tr key={`${c.key.engine}|${c.key.runner}|${c.key.regionId}|${c.key.personaId}|${c.key.branded}`} className={`border-b border-uncc-rule/60 align-top ${c.tooFewDraws ? "text-uncc-ink/50" : ""}`}>
                <td className="py-2 pr-3">
                  {engineLabel(c.key.engine)} · {runnerLabel(c.key.runner)}
                  <div className="text-xs text-uncc-ink/50">{c.key.index} index</div>
                  {c.tooFewDraws ? <Badge tone="muted">Too few answers checked</Badge> : null}
                  {c.regionExcluded > 0 ? (
                    <div className="text-xs">{c.regionExcluded} answers left out: region not honored</div>
                  ) : null}
                </td>
                <td className="pr-3">
                  {c.draws} AI answers · {c.prompts} prompts
                </td>
                {showWon ? (
                  <td className="pr-3">
                    {c.promptsWon ? (
                      <MetricValue value={c.promptsWon} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                    ) : (
                      "n/a"
                    )}
                  </td>
                ) : null}
                <td className="pr-3">
                  <MetricValue value={c.mentionRate} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                </td>
                <td className="pr-3">
                  <MetricValue value={c.citationRate} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                </td>
                <td className="pr-3">
                  <MetricValue value={c.firstMentionRate} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                  {c.firstMentionUnknownSpan > 0 ? <div className="text-xs">{c.firstMentionUnknownSpan} draws without spans</div> : null}
                </td>
                <td className="pr-3">
                  <MetricValue value={c.shareOfVoice} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                </td>
                <td className="pr-3">
                  {(() => {
                    const dec = displayable({ n: c.position.n, prompts: c.prompts });
                    if (dec.kind !== "show") {
                      return (
                        <span data-testid="metric-suppressed" data-metric-kind={dec.kind}>
                          {dec.message}
                        </span>
                      );
                    }
                    if (c.position.median === null) return <>none</>;
                    return (
                      <>
                        {c.position.median}{" "}
                        <span className="text-xs text-uncc-ink/60">(n={c.position.n})</span>
                      </>
                    );
                  })()}
                </td>
                <td className="pr-3">
                  {(() => {
                    const dec = displayable({ n: c.draws, prompts: c.consistency.prompts });
                    if (dec.kind !== "show") {
                      return (
                        <span data-testid="metric-suppressed" data-metric-kind={dec.kind}>
                          {dec.message}
                        </span>
                      );
                    }
                    if (c.consistency.value === null) return <>unknown</>;
                    return (
                      <>
                        {pct(c.consistency.value)}{" "}
                        <span className="text-xs text-uncc-ink/60">(n={c.consistency.prompts} prompts)</span>
                      </>
                    );
                  })()}
                </td>
                <td>
                  {acc && acc.rate !== null ? (
                    <MetricValue value={{ ...acc, n: c.accuracy.claims }} showRaw={showRaw} canShowRaw={canShowRaw} grey={c.tooFewDraws} />
                  ) : (
                    <span className="text-uncc-ink/50">no claims</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function labelTone(label: string): "green" | "gold" | "muted" {
  return label === "significant improvement" ? "green" : label === "significant decline" ? "gold" : "muted";
}

function Comparisons({ rows, regions }: { rows: SeriesComparison[]; regions: Array<{ id: string; label: string }> }) {
  if (rows.length === 0) return <p className="text-sm text-uncc-ink/60">No previous scan of this prompt set to compare with.</p>;
  const regionName = (id: string) => regions.find((r) => r.id === id)?.label ?? id.slice(0, 8);
  return (
    <div className="overflow-x-auto rounded-[12px] border border-scout-border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
          <tr className="border-b border-uncc-rule">
            <th className="py-2 pr-3">Series</th>
            <th className="pr-3">Prompts won, paired</th>
            <th className="pr-3">Lost · gained</th>
            <th className="pr-3">McNemar</th>
            <th>Mention rate change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const d = c.presenceDifference;
            return (
              <tr key={`${c.series.engine}|${c.series.runner}|${c.series.provider}|${c.series.regionId}|${c.series.branded}`} className="border-b border-uncc-rule/60 align-top">
                <td className="py-2 pr-3">
                  {engineLabel(c.series.engine)} · {runnerLabel(c.series.runner)}
                  <div className="text-xs text-uncc-ink/50">
                    {c.series.provider} · {regionName(c.series.regionId)} ·{" "}
                    {c.series.branded ? "location-biased prompts" : "location-neutral prompts"}
                  </div>
                </td>
                <td className="pr-3">
                  {c.wonBefore} to {c.wonAfter} of {c.pairs}
                </td>
                <td className="pr-3">
                  {c.b} · {c.c}
                </td>
                <td className="pr-3">
                  <Badge tone={labelTone(c.label)}>{c.label}</Badge>
                  <div className="text-xs text-uncc-ink/60">exact p = {c.pValue.toFixed(4)}</div>
                </td>
                <td>
                  {d ? (
                    <>
                      {d.estimate >= 0 ? "+" : ""}
                      {(d.estimate * 100).toFixed(1)} points{" "}
                      <span className="text-xs text-uncc-ink/60">
                        (95% paired bootstrap {d.ciLow === null ? "unknown" : `${(d.ciLow * 100).toFixed(1)} to ${(d.ciHigh! * 100).toFixed(1)}`}; {d.prompts} prompts, {d.drawsBefore} and {d.drawsAfter} AI answers)
                      </span>
                    </>
                  ) : (
                    "unknown"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendTable({ trend }: { trend: Trend[] }) {
  const { showRaw } = useMetricShowRaw();
  const role = useSessionRole();
  const canShowRaw = role === "editor" || role === "admin";
  const seriesKeys = [...new Set(trend.flatMap((t) => t.series.map((s) => `${s.engine}|${s.runner}`)))].sort();
  if (trend.length === 0 || seriesKeys.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-[12px] border border-scout-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
          <tr className="border-b border-uncc-rule">
            <th className="py-2 pr-3">Scan</th>
            {seriesKeys.map((k) => {
              const [e, r] = k.split("|");
              return (
                <th key={k} className="pr-3">
                  {engineLabel(e)} · {runnerLabel(r)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {trend.map((t) => (
            <tr key={t.scanId} className="border-b border-uncc-rule/60">
              <td className="py-2 pr-3">{date(t.createdAt)}</td>
              {seriesKeys.map((k) => {
                const s = t.series.find((x) => `${x.engine}|${x.runner}` === k)?.promptsWon;
                return (
                  <td key={k} className={`pr-3 ${s?.tooFewDraws ? "text-uncc-ink/50" : ""}`}>
                    {s ? (
                      <MetricValue value={s} showRaw={showRaw} canShowRaw={canShowRaw} grey={s.tooFewDraws} />
                    ) : (
                      "none"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromptSetCard({ view, data }: { view: PromptSetView; data: Dashboard }) {
  // Never default to pooled "all regions" — pick the first campaign region.
  const [regionId, setRegionId] = useState<string>(() => data.regions[0]?.id ?? "");
  /** "" = overall; "group:<key>" = audience group; "persona:<id>" = specific persona (n≥30 only). */
  const [audienceFilter, setAudienceFilter] = useState<string>("");
  const [trendMetric, setTrendMetric] = useState<"prompts_won" | "citation_rate">("prompts_won");
  const { showRaw } = useMetricShowRaw();
  const role = useSessionRole();
  const canShowRaw = role === "editor" || role === "admin";
  const cells = view.rollup.cells;
  const detailPersonas = data.personas.filter((p) =>
    cells.some((c) => c.key.personaId === p.id && c.key.personaGroup == null && c.draws >= 30),
  );
  const pick = (branded: boolean) => {
    return cells.filter((c) => {
      if (c.key.branded !== branded) return false;
      // Never pool multiple regions into one number. With 0 linked regions, show overall
      // (regionId null) cells. With 1+, require a single selected region.
      if (data.regions.length === 0) {
        if (c.key.regionId != null) return false;
      } else {
        const selected = regionId || data.regions[0]!.id;
        if (c.key.regionId !== selected) return false;
      }
      if (audienceFilter.startsWith("group:")) {
        return c.key.personaGroup === audienceFilter.slice(6) && c.key.personaId == null;
      }
      if (audienceFilter.startsWith("persona:")) {
        return c.key.personaId === audienceFilter.slice(8) && c.key.personaGroup == null;
      }
      return c.key.personaId == null && c.key.personaGroup == null;
    });
  };
  const unbranded = pick(false);
  const branded = pick(true);
  const visCell = [...unbranded].sort((a, b) => b.draws - a.draws)[0] ?? null;
  const ex = view.rollup.excluded;
  const excludedTotal = ex.notOk + ex.searchNotUsed + ex.experimental + ex.unjudged;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Prompt set v{view.version}{" "}
          <span className="font-mono text-xs font-normal text-uncc-ink/60">{view.sha256?.slice(0, 12)}…</span>
        </CardTitle>
        <CardDescription>
          Latest scan {date(view.latestScan.createdAt)} ({view.latestScan.status}) · {view.scanCount} scan{view.scanCount === 1 ? "" : "s"} on this set. Scores
          from different prompt set versions are never compared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canShowRaw ? (
          <div className="flex justify-end">
            <ShowRawToggle />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="space-y-1">
            <Label htmlFor={`region-${view.promptSetId}`}>Region</Label>
            <select
              id={`region-${view.promptSetId}`}
              className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              data-testid="region-filter"
            >
              <option value="">Pick a region (never pooled)</option>
              {data.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`persona-${view.promptSetId}`}>Audience</Label>
            <select
              id={`persona-${view.promptSetId}`}
              className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm"
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
            >
              <option value="">All audiences (no filter)</option>
              <optgroup label="Groups (default reporting)">
                {(data.persona_groups ?? []).map((g) => (
                  <option key={g.key} value={`group:${g.key}`}>
                    {g.label}
                  </option>
                ))}
              </optgroup>
              {detailPersonas.length ? (
                <optgroup label="Specific personas (30+ AI answers)">
                  {detailPersonas.map((p) => (
                    <option key={p.id} value={`persona:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <p className="max-w-md self-end text-xs text-uncc-ink/60">
            Reports default to audience groups. A specific persona appears only when that cell has 30 or more AI answers
            checked. Region cells use honored or unknown answers only.
          </p>
        </div>

        <section className="space-y-3">
          <h3 className="font-serif text-base font-semibold text-uncc-ink">Prompts won (location-neutral prompts only)</h3>
          {unbranded.length ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {unbranded.map((c) => (
                <Headline
                  key={`${c.key.engine}|${c.key.runner}`}
                  cell={c}
                  scanDate={view.latestScan.createdAt}
                  promptSetHash={view.sha256}
                  showRaw={showRaw}
                  canShowRaw={canShowRaw}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-uncc-ink/60">No judged location-neutral AI answers yet for this selection.</p>
          )}
          <p className="text-xs text-uncc-ink/60" data-testid="location-biased-note">
            Location-biased prompts (those that name a brand alias or the city) are excluded from these headline
            numbers and shown in their own series below. One card per engine and collection method. Collection methods
            are never averaged and the chat and Google indexes are never pooled.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-serif text-base font-semibold text-uncc-ink">Engine × runner</h3>
          <CellTable cells={unbranded} showWon />
        </section>

        {branded.length ? (
          <section className="space-y-2">
            <h3 className="font-serif text-base font-semibold text-uncc-ink">
              Location-biased prompts (separate series, not in the headline)
            </h3>
            <CellTable cells={branded} showWon={false} />
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="font-serif text-base font-semibold text-uncc-ink">
            Change vs previous scan{view.previousScan ? ` (${date(view.previousScan.createdAt)})` : ""}
          </h3>
          <Comparisons rows={view.comparisons} regions={data.regions} />
          <p className="text-xs text-uncc-ink/60">McNemar exact test on prompts paired within this frozen set; labels are significant improvement, significant decline, or within noise (alpha 0.05).</p>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-serif text-base font-semibold text-uncc-ink">
              {trendMetric === "citation_rate" ? "Citation rate over scans" : "Prompts won over scans"}
            </h3>
            <div className="space-y-1">
              <Label htmlFor={`trend-metric-${view.promptSetId}`}>Trend metric</Label>
              <select
                id={`trend-metric-${view.promptSetId}`}
                className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm"
                value={trendMetric}
                onChange={(e) => setTrendMetric(e.target.value as "prompts_won" | "citation_rate")}
                data-testid="trend-metric"
              >
                <option value="prompts_won">Prompts won</option>
                <option value="citation_rate">Citation rate</option>
              </select>
            </div>
          </div>
          {visCell ? (
            <div className="rounded-[12px] border border-scout-border bg-white p-3">
              <VisibilityChart
                trend={view.trend}
                engine={visCell.key.engine}
                runner={visCell.key.runner}
                metric={trendMetric}
                events={data.modelEvents.map((e) => ({ engine: e.engine, occurredOn: e.occurredOn, note: e.note }))}
                annotations={(data.annotations ?? []).map((a) => ({
                  occurredOn: a.occurredOn,
                  note: a.note,
                  kind: a.kind,
                }))}
                showRaw={showRaw}
                canShowRaw={canShowRaw}
                targetValue={
                  data.target &&
                  data.target.metric === trendMetric &&
                  (!data.target.engine || data.target.engine === visCell.key.engine)
                    ? data.target.value
                    : null
                }
              />
              {/* Accessible table twin for Lighthouse / screen readers (wrapper keeps layout size 1×1) */}
              <div className="sr-only" data-testid="visibility-chart-table">
                <table>
                  <caption>
                    {trendMetric === "citation_rate" ? "Citation rate" : "Prompts won"} by scan for{" "}
                    {engineLabel(visCell.key.engine)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Scan date</th>
                      <th scope="col">Rate</th>
                      <th scope="col">95% low</th>
                      <th scope="col">95% high</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.trend.map((t) => {
                      const s = t.series.find(
                        (x) => x.engine === visCell.key.engine && x.runner === visCell.key.runner,
                      );
                      const rate =
                        trendMetric === "citation_rate" ? s?.citationRate?.rate ?? null : s?.promptsWon?.rate ?? null;
                      const lo =
                        trendMetric === "citation_rate" ? s?.citationRate?.ciLow ?? null : s?.promptsWon?.ciLow ?? null;
                      const hi =
                        trendMetric === "citation_rate" ? s?.citationRate?.ciHigh ?? null : s?.promptsWon?.ciHigh ?? null;
                      return (
                        <tr key={t.scanId}>
                          <td>{date(t.createdAt)}</td>
                          <td>{rate == null ? "—" : `${(rate * 100).toFixed(1)}%`}</td>
                          <td>{lo == null ? "—" : `${(lo * 100).toFixed(1)}%`}</td>
                          <td>{hi == null ? "—" : `${(hi * 100).toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-uncc-ink/60">
                Chart uses the engine and collection method with the most answers in this table ({engineLabel(visCell.key.engine)} · {runnerLabel(visCell.key.runner)}). Displayable rule applies.
              </p>
            </div>
          ) : null}
          <TrendTable trend={view.trend} />
        </section>

        {excludedTotal > 0 ? (
          <p className="text-xs text-uncc-ink/60">
            Left out of every number: {ex.notOk} not ok, {ex.searchNotUsed} API-with-search answers that did not use
            web search, {ex.experimental} experimental, {ex.unjudged} not judged yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CampaignDashboardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Dashboard | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ engine: ENGINES[0] as string, occurred_on: "", note: "", source_url: "" });
  const [annForm, setAnnForm] = useState({
    kind: "press_release" as "press_release" | "campaign_launch" | "content_launch",
    occurred_on: "",
    note: "",
  });

  const load = useCallback(async () => {
    try {
      setData(await api<Dashboard>(`/api/campaigns/${id}/dashboard`));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, [id]);

  useEffect(() => {
    void load();
    api<{ user: { role: string } | null }>("/api/auth/me")
      .then((r) => setRole(r.user?.role ?? null))
      .catch(() => setRole(null));
  }, [load]);

  useEffect(() => {
    document.title = "Visibility · Scout";
  }, []);

  async function addEvent() {
    setMessage(null);
    try {
      await api("/api/model-events", {
        method: "POST",
        body: JSON.stringify({ engine: form.engine, occurred_on: form.occurred_on, note: form.note, source_url: form.source_url || null }),
      });
      setForm({ ...form, occurred_on: "", note: "", source_url: "" });
      setMessage({ tone: "ok", text: "Model event added." });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function removeEvent(eventId: string) {
    setMessage(null);
    try {
      await api(`/api/model-events/${eventId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function addAnnotation() {
    setMessage(null);
    try {
      await api(`/api/campaigns/${id}/annotations`, {
        method: "POST",
        body: JSON.stringify(annForm),
      });
      setAnnForm({ ...annForm, occurred_on: "", note: "" });
      setMessage({ tone: "ok", text: "Annotation added." });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function removeAnnotation(annId: string) {
    setMessage(null);
    try {
      await api(`/api/campaigns/${id}/annotations/${annId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!data) {
    return message?.tone === "error" ? <ErrorState message={message.text} /> : <LoadingState label="Loading campaign dashboard…" />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-scout-muted">
          <Link href="/campaigns" className="font-medium text-scout-brand underline">
            Campaigns
          </Link>
        </p>
        <PageTitle
          title={`${data.campaign.name}: dashboard`}
          subtitle={data.campaign.topic ? `Visibility · ${data.campaign.topic}` : "Visibility across engines"}
        />
        <p className="max-w-3xl text-xs text-scout-muted">
          Rates describe sampled AI answers from each collection method, not all users. Every rate shows n and a 95%
          interval. Answers inside one prompt are correlated, so intervals come from a bootstrap over prompts.
        </p>
      </div>

      {message ? (
        <p
          className={`text-sm ${message.tone === "error" ? "" : "text-uncc-green"}`}
          style={message.tone === "error" ? { color: "var(--status-decline-fg)" } : undefined}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {data.coverageMatrix && data.coverageMatrix.length > 0 ? (
        <Card data-testid="intent-engine-matrix">
          <CardHeader>
            <CardTitle>Intent × engine coverage</CardTitle>
            <CardDescription>
              Prompts won by intent and engine on the latest scan. Labels: strong (≥60%), partial (20–59%), invisible
              (&lt;20%). Displayable rule still applies (too few prompts/draws → suppressed).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.coverageMatrix.filter((c) => c.label === "suppressed").length >
            data.coverageMatrix.length / 2 ? (
              <p className="mb-3 text-sm text-scout-muted" data-testid="coverage-matrix-suppressed-note">
                Cells fill in as more prompts are measured (needs 10+ prompts per cell).
              </p>
            ) : null}
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-scout-muted">
                <tr className="border-b border-scout-border">
                  <th className="px-2 py-2">Intent</th>
                  <th className="px-2 py-2">Engine · runner</th>
                  <th className="px-2 py-2">Won</th>
                  <th className="px-2 py-2">Label</th>
                </tr>
              </thead>
              <tbody>
                {data.coverageMatrix.map((c) => (
                  <tr key={`${c.intent}|${c.engine}|${c.runner}`} className="border-b border-scout-border">
                    <td className="px-2 py-2">{c.intent}</td>
                    <td className="px-2 py-2">
                      {engineLabel(c.engine)} · {runnerLabel(c.runner)}
                    </td>
                    <td className="px-2 py-2">{c.kOfN ?? "—"}</td>
                    <td className="px-2 py-2">
                      <span
                        data-testid={`coverage-label-${c.label}`}
                        style={{
                          color:
                            c.label === "strong"
                              ? "var(--status-gain-fg)"
                              : c.label === "partial"
                                ? "var(--intent-evaluation-fg)"
                                : c.label === "invisible"
                                  ? "var(--status-decline-fg)"
                                  : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {c.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {data.regionComparison && data.regionComparison.length > 0 ? (
        <Card data-testid="region-comparison">
          <CardHeader>
            <CardTitle>Region comparison</CardTitle>
            <CardDescription>
              One row per region × engine. Uses region_honored yes/unknown only (no is excluded). Displayable rule applies.
              Regions are never pooled into one number. Engines that ignore location show “region not supported”.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-scout-muted">
                <tr className="border-b border-scout-border">
                  <th className="px-2 py-2">Region</th>
                  <th className="px-2 py-2">Engine · runner</th>
                  <th className="px-2 py-2">Honored mix</th>
                  <th className="px-2 py-2">Prompts won</th>
                </tr>
              </thead>
              <tbody>
                {data.regionComparison.map((c) => (
                  <tr key={`${c.regionId}|${c.engine}|${c.runner}`} className="border-b border-scout-border">
                    <td className="px-2 py-2">{c.regionLabel}</td>
                    <td className="px-2 py-2">
                      {engineLabel(c.engine)} · {runnerLabel(c.runner)}
                    </td>
                    <td className="px-2 py-2 text-xs text-scout-muted">
                      honored {c.honoredMix.yes} / unknown {c.honoredMix.unknown} / no {c.honoredMix.no}
                    </td>
                    <td className="px-2 py-2" data-testid={`region-cell-${c.regionId}-${c.engine}-${c.runner}`}>
                      {c.display}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {data.promptSets.length === 0 ? (
        <EmptyState title="No finished scans yet">
          <p>Freeze a question set and run a measured scan. We never invent placeholder scores.</p>
        </EmptyState>
      ) : (
        data.promptSets.map((v) => <PromptSetCard key={v.promptSetId} view={v} data={data} />)
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-uncc-ink/60">No open alerts for this campaign.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.kind === "significant_decline" ? "gold" : "neutral"}>{a.kind.replace(/_/g, " ")}</Badge>
                  <span>{a.payload?.message ?? "No message recorded."}</span>
                  <span className="text-xs text-uncc-ink/50">{date(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model events</CardTitle>
          <CardDescription>Engine model changes. A change here means the series before and after may not be the same model.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.modelEvents.length === 0 ? (
            <p className="text-sm text-uncc-ink/60">No model events recorded for this campaign&apos;s engines.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
                <tr className="border-b border-uncc-rule">
                  <th className="py-2 pr-3">Date</th>
                  <th className="pr-3">Engine</th>
                  <th className="pr-3">Note</th>
                  <th className="pr-3">Source</th>
                  {role === "admin" ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.modelEvents.map((e) => (
                  <tr key={e.id} className="border-b border-uncc-rule/60 align-top">
                    <td className="py-2 pr-3">{e.occurredOn}</td>
                    <td className="pr-3">{engineLabel(e.engine)}</td>
                    <td className="pr-3">{e.note}</td>
                    <td className="pr-3">
                      {e.sourceUrl ? (
                        <a href={e.sourceUrl} className="text-uncc-green underline" target="_blank" rel="noreferrer">
                          link
                        </a>
                      ) : (
                        "none"
                      )}
                    </td>
                    {role === "admin" ? (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete model event ${e.note.slice(0, 40)}`}
                          onClick={() => removeEvent(e.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {role === "admin" ? (
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="me-engine">Engine</Label>
                <select id="me-engine" className="h-9 w-full rounded border border-uncc-rule bg-white px-2 text-sm" value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })}>
                  {ENGINES.map((e) => (
                    <option key={e} value={e}>
                      {engineLabel(e)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="me-date">Occurred on</Label>
                <Input id="me-date" type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="me-note">Note</Label>
                <Input id="me-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="me-url">Source URL (optional)</Label>
                <Input id="me-url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
              </div>
              <div>
                <Button onClick={addEvent} disabled={!form.occurred_on || !form.note.trim()}>
                  Add model event
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-uncc-ink/60">Only admins can add model events.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="campaign-annotations">
        <CardHeader>
          <CardTitle>Campaign annotations</CardTitle>
          <CardDescription>
            Press release, campaign launch, and content launch — shown on every Visibility trend chart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data.annotations ?? []).length === 0 ? (
            <p className="text-sm text-uncc-ink/60">No campaign annotations yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(data.annotations ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="muted">{a.kind.replace(/_/g, " ")}</Badge>
                  <span>{a.occurredOn}</span>
                  <span>{a.note}</span>
                  {role === "editor" || role === "admin" ? (
                    <Button size="sm" variant="ghost" onClick={() => removeAnnotation(a.id)}>
                      Delete
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {role === "editor" || role === "admin" ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="ann-kind">Kind</Label>
                <select
                  id="ann-kind"
                  className="h-9 w-full rounded border border-uncc-rule bg-white px-2 text-sm"
                  value={annForm.kind}
                  onChange={(e) =>
                    setAnnForm({ ...annForm, kind: e.target.value as typeof annForm.kind })
                  }
                >
                  <option value="press_release">Press release</option>
                  <option value="campaign_launch">Campaign launch</option>
                  <option value="content_launch">Content launch</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-date">Occurred on</Label>
                <Input
                  id="ann-date"
                  type="date"
                  value={annForm.occurred_on}
                  onChange={(e) => setAnnForm({ ...annForm, occurred_on: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-note">Note</Label>
                <Input
                  id="ann-note"
                  value={annForm.note}
                  onChange={(e) => setAnnForm({ ...annForm, note: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addAnnotation} disabled={!annForm.occurred_on || !annForm.note.trim()}>
                  Add annotation
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

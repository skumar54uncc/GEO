"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENGINES } from "@/lib/capture/types";
import type { CellRollup, ScanRollup } from "@/lib/metrics/rollup";
import type { SeriesComparison } from "@/lib/metrics/compare";
import type { PromptsWon, RateWithCi } from "@/lib/metrics/types";
import { SURFACE_LABELS, type Surface } from "@/lib/types";

const RUNNER_LABELS: Record<string, string> = {
  ui_provider: "UI capture provider",
  serp_provider: "SERP provider",
  api_search: "API with web search",
  api_parametric: "API, no browsing",
  manual_paste: "Manual paste",
};

type AlertRow = { id: string; kind: string; status: string; createdAt: string; payload: { message?: string } | null };
type ModelEventRow = { id: string; engine: string; occurredOn: string; note: string; sourceUrl: string | null };
type Trend = { scanId: string; createdAt: string; series: Array<{ engine: string; runner: string; promptsWon: PromptsWon }> };
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
type Dashboard = {
  campaign: { id: string; name: string; topic: string; status: string };
  regions: Array<{ id: string; label: string }>;
  personas: Array<{ id: string; name: string; key?: string | null; group?: string | null }>;
  persona_groups: Array<{ key: string; label: string }>;
  promptSets: PromptSetView[];
  alerts: AlertRow[];
  modelEvents: ModelEventRow[];
};

const engineLabel = (e: string) => SURFACE_LABELS[e as Surface] ?? e;
const runnerLabel = (r: string) => RUNNER_LABELS[r] ?? r;
const pct = (x: number | null) => (x === null ? "unknown" : `${(x * 100).toFixed(1)}%`);
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

/** A rate always shows its n and 95% interval. */
function Rate({ r }: { r: RateWithCi }) {
  if (r.rate === null) return <span className="text-uncc-ink/50">unknown (n={r.n})</span>;
  const ci = r.ciLow !== null && r.ciHigh !== null ? `${pct(r.ciLow)} to ${pct(r.ciHigh)}` : "interval unknown";
  return (
    <span className={r.tooFewDraws ? "text-uncc-ink/50" : ""}>
      {pct(r.rate)} <span className="text-xs text-uncc-ink/60">({ci}, n={r.n})</span>
    </span>
  );
}

function Headline({ cell }: { cell: CellRollup }) {
  const w = cell.promptsWon;
  if (!w) return null;
  const grey = cell.tooFewDraws;
  return (
    <div className={`rounded border border-uncc-rule p-4 ${grey ? "bg-uncc-paper opacity-70" : "bg-white"}`}>
      <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
        {engineLabel(cell.key.engine)} · {runnerLabel(cell.key.runner)}
      </p>
      <p className="mt-1 font-serif text-xl text-uncc-ink">
        {w.won} of {w.prompts} prompts
        {w.ciLow !== null && w.ciHigh !== null ? (
          <span className="text-sm text-uncc-ink/70"> (95% CI {pct(w.ciLow)} to {pct(w.ciHigh)})</span>
        ) : null}
      </p>
      <p className="text-xs text-uncc-ink/60">
        Won = brand named in {w.rule}. {w.draws} valid draws.
      </p>
      {grey ? <Badge tone="muted" className="mt-2">too few draws (under 30)</Badge> : null}
    </div>
  );
}

function CellTable({ cells, showWon }: { cells: CellRollup[]; showWon: boolean }) {
  if (cells.length === 0) return <p className="text-sm text-uncc-ink/60">No valid judged draws in this selection yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
          <tr className="border-b border-uncc-rule">
            <th className="py-2 pr-3">Engine · runner</th>
            <th className="pr-3">Draws · prompts</th>
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
                  {c.tooFewDraws ? <Badge tone="muted">too few draws</Badge> : null}
                  {c.regionExcluded > 0 ? <div className="text-xs">{c.regionExcluded} draws left out: region not honored</div> : null}
                </td>
                <td className="pr-3">
                  {c.draws} · {c.prompts}
                </td>
                {showWon ? (
                  <td className="pr-3">
                    {c.promptsWon ? `${c.promptsWon.won} of ${c.promptsWon.prompts} (${pct(c.promptsWon.rate)})` : "n/a"}
                  </td>
                ) : null}
                <td className="pr-3"><Rate r={c.mentionRate} /></td>
                <td className="pr-3"><Rate r={c.citationRate} /></td>
                <td className="pr-3">
                  <Rate r={c.firstMentionRate} />
                  {c.firstMentionUnknownSpan > 0 ? <div className="text-xs">{c.firstMentionUnknownSpan} draws without spans</div> : null}
                </td>
                <td className="pr-3">
                  <Rate r={c.shareOfVoice} />
                </td>
                <td className="pr-3">{c.position.median === null ? "none" : c.position.median} <span className="text-xs text-uncc-ink/60">(n={c.position.n})</span></td>
                <td className="pr-3">
                  {c.consistency.value === null ? "unknown" : pct(c.consistency.value)}{" "}
                  <span className="text-xs text-uncc-ink/60">(n={c.consistency.prompts} prompts)</span>
                </td>
                <td>
                  {acc && acc.rate !== null ? (
                    <Rate r={{ ...acc, n: c.accuracy.claims }} />
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
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
                    {c.series.provider} · {regionName(c.series.regionId)} · {c.series.branded ? "branded prompts" : "unbranded prompts"}
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
                        (95% paired bootstrap {d.ciLow === null ? "unknown" : `${(d.ciLow * 100).toFixed(1)} to ${(d.ciHigh! * 100).toFixed(1)}`}; {d.prompts} prompts, {d.drawsBefore} and {d.drawsAfter} draws)
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
  const seriesKeys = [...new Set(trend.flatMap((t) => t.series.map((s) => `${s.engine}|${s.runner}`)))].sort();
  if (trend.length === 0 || seriesKeys.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
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
                      <>
                        {s.won} of {s.prompts}
                        {s.ciLow !== null && s.ciHigh !== null ? <span className="text-xs text-uncc-ink/60"> ({pct(s.ciLow)} to {pct(s.ciHigh)})</span> : null}
                      </>
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
  const [regionId, setRegionId] = useState<string>("");
  /** "" = overall; "group:<key>" = audience group; "persona:<id>" = specific persona (n≥30 only). */
  const [audienceFilter, setAudienceFilter] = useState<string>("");
  const cells = view.rollup.cells;
  const detailPersonas = data.personas.filter((p) =>
    cells.some((c) => c.key.personaId === p.id && c.key.personaGroup == null && c.draws >= 30),
  );
  const pick = (branded: boolean) =>
    cells.filter((c) => {
      if (c.key.branded !== branded) return false;
      if ((c.key.regionId ?? "") !== regionId) return false;
      if (audienceFilter.startsWith("group:")) {
        return c.key.personaGroup === audienceFilter.slice(6) && c.key.personaId == null;
      }
      if (audienceFilter.startsWith("persona:")) {
        return c.key.personaId === audienceFilter.slice(8) && c.key.personaGroup == null;
      }
      return c.key.personaId == null && c.key.personaGroup == null;
    });
  const unbranded = pick(false);
  const branded = pick(true);
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
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="space-y-1">
            <Label htmlFor={`region-${view.promptSetId}`}>Region</Label>
            <select id={`region-${view.promptSetId}`} className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">All regions (no filter)</option>
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
                <optgroup label="Specific personas (30+ draws)">
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
            Reports default to audience groups. A specific persona appears only when that cell has 30 or more draws. Region cells use honored or unknown draws only.
          </p>
        </div>

        <section className="space-y-3">
          <h4 className="font-serif text-base font-semibold text-uncc-ink">Prompts won (unbranded prompts only)</h4>
          {unbranded.length ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {unbranded.map((c) => (
                <Headline key={`${c.key.engine}|${c.key.runner}`} cell={c} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-uncc-ink/60">No judged unbranded draws yet for this selection.</p>
          )}
          <p className="text-xs text-uncc-ink/60">
            One card per engine and runner. Runners are never averaged and the chat and Google indexes are never pooled.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="font-serif text-base font-semibold text-uncc-ink">Engine × runner</h4>
          <CellTable cells={unbranded} showWon />
        </section>

        {branded.length ? (
          <section className="space-y-2">
            <h4 className="font-serif text-base font-semibold text-uncc-ink">Branded prompts (separate series, not in the headline)</h4>
            <CellTable cells={branded} showWon={false} />
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="font-serif text-base font-semibold text-uncc-ink">
            Change vs previous scan{view.previousScan ? ` (${date(view.previousScan.createdAt)})` : ""}
          </h4>
          <Comparisons rows={view.comparisons} regions={data.regions} />
          <p className="text-xs text-uncc-ink/60">McNemar exact test on prompts paired within this frozen set; labels are significant improvement, significant decline, or within noise (alpha 0.05).</p>
        </section>

        <section className="space-y-2">
          <h4 className="font-serif text-base font-semibold text-uncc-ink">Prompts won over scans</h4>
          <TrendTable trend={view.trend} />
        </section>

        {excludedTotal > 0 ? (
          <p className="text-xs text-uncc-ink/60">
            Left out of every number: {ex.notOk} not ok, {ex.searchNotUsed} api_search without web search, {ex.experimental} experimental, {ex.unjudged} not judged yet.
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

  if (!data) {
    return message ? <p className="text-sm text-red-700">{message.text}</p> : <p className="text-uncc-ink/60">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/campaigns" className="text-sm text-uncc-green underline">
          Campaigns
        </Link>
        <h2 className="font-serif text-2xl font-semibold text-uncc-ink">{data.campaign.name}: dashboard</h2>
        {data.campaign.topic ? <p className="text-sm text-uncc-ink/75">{data.campaign.topic}</p> : null}
        <p className="max-w-3xl text-xs text-uncc-ink/60">
          Rates describe sampled answers from each captured runner, not all users. Every rate shows n and a 95% interval. Draws inside one prompt are correlated, so draw-level intervals come from a bootstrap over prompts.
        </p>
      </div>

      {message ? (
        <p className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-uncc-green"}`} role="status">
          {message.text}
        </p>
      ) : null}

      {data.promptSets.length === 0 ? (
        <p className="text-sm text-uncc-ink/60">No finished scans on a frozen prompt set yet. Freeze a prompt set and run a scan first.</p>
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
              <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
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
                        <Button size="sm" variant="ghost" onClick={() => removeEvent(e.id)}>
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
    </div>
  );
}

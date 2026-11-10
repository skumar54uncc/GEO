"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartCaption, HowMeasured } from "@/components/HowMeasured";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { SafeLink } from "@/components/site/client";
import { PageTitle } from "@/components/scout/primitives";
import { safeHref } from "@/lib/url/safeHref";
import { Badge } from "@/components/ui/card";
import {
  FEATURES_DETECTED_LABEL,
  FEATURES_DETECTED_TOOLTIP,
  featureFlagsSummary,
  type FeatureFlags,
} from "@/lib/citations/pageDisplay";
import { enginePlain, fidelityPlain, formatScanDate, runnerPlain } from "@/lib/ui/labels";

type AnswerRow = {
  drawId: string;
  promptId: string;
  promptText: string;
  engine: string;
  runner: string;
  fidelity: string;
  branded: boolean;
  mentionedBrand: boolean;
  scanCreatedAt: string;
  capturedAt: string;
  personaKey: string | null;
  personaLabel: string | null;
  drawIndex: number | null;
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
  mentions: Array<{
    entityType: string;
    span: { text: string } | null;
    listPosition: number | null;
  }>;
  citations: Array<{
    url: string;
    domain: string;
    sourceClass: string;
    position: number | null;
    page: {
      title: string | null;
      h1: string | null;
      h2s: string[];
      titleHtml: string | null;
      h1Html: string | null;
      h2Htmls: string[];
      contentType: string | null;
      publishedAt: string | null;
      updatedAt: string | null;
      freshness?: { label: string; source: "updated" | "published" | "unknown" };
      features: {
        listicle: boolean;
        answerCapsule: boolean;
        statisticsCount: number;
        namedQuotes: number;
      } | null;
    } | null;
  }>;
  claims: Array<{ text: string; verdict: string }>;
  fanoutQueries: Array<{ query: string }>;
  judge: {
    model: string;
    sentiment?: string | null;
    sentimentSpan?: { text: string; startUtf16?: number; endUtf16?: number } | null;
  } | null;
  gapTerms?: string[];
};

type PromptGroup = {
  promptId: string;
  promptText: string;
  branded: boolean;
  personaLabel: string | null;
  personaKey: string | null;
  byEngine: Map<string, AnswerRow[]>;
};

const ALL = "";

export default function AnswersPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [rows, setRows] = useState<AnswerRow[] | null>(null);
  const [selected, setSelected] = useState<DrawDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [engineFilter, setEngineFilter] = useState(ALL);
  const [namedUs, setNamedUs] = useState<"all" | "yes" | "no">("all");
  const [personaFilter, setPersonaFilter] = useState(ALL);
  const [runnerFilter, setRunnerFilter] = useState(ALL);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [engineTab, setEngineTab] = useState<string | null>(null);

  const openDraw = useCallback(async (drawId: string) => {
    try {
      setDetailError(null);
      setSelectedId(drawId);
      const res = await fetch(`/api/answers/${drawId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSelected(json);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/answers?limit=2000`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const answers = json.answers as AnswerRow[];
      setRows(answers);
      if (answers.length > 0) {
        setActivePromptId(answers[0].promptId);
        setEngineTab(answers[0].engine);
        void openDraw(answers[0].drawId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId, openDraw]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Answers · Scout";
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (engineFilter && r.engine !== engineFilter) return false;
      if (runnerFilter && r.runner !== runnerFilter) return false;
      if (personaFilter) {
        const key = r.personaKey ?? "none";
        if (key !== personaFilter) return false;
      }
      if (namedUs === "yes" && !r.mentionedBrand) return false;
      if (namedUs === "no" && r.mentionedBrand) return false;
      return true;
    });
  }, [rows, engineFilter, runnerFilter, personaFilter, namedUs]);

  const groups = useMemo(() => {
    const map = new Map<string, PromptGroup>();
    for (const row of filtered) {
      let g = map.get(row.promptId);
      if (!g) {
        g = {
          promptId: row.promptId,
          promptText: row.promptText,
          branded: row.branded,
          personaLabel: row.personaLabel,
          personaKey: row.personaKey,
          byEngine: new Map(),
        };
        map.set(row.promptId, g);
      }
      const list = g.byEngine.get(row.engine) ?? [];
      list.push(row);
      g.byEngine.set(row.engine, list);
    }
    for (const g of map.values()) {
      for (const [engine, list] of g.byEngine) {
        list.sort((a, b) => (a.drawIndex ?? 0) - (b.drawIndex ?? 0) || a.capturedAt.localeCompare(b.capturedAt));
        g.byEngine.set(engine, list);
      }
    }
    return [...map.values()];
  }, [filtered]);

  const engines = useMemo(() => [...new Set((rows ?? []).map((r) => r.engine))].sort(), [rows]);
  const runners = useMemo(() => [...new Set((rows ?? []).map((r) => r.runner))].sort(), [rows]);
  const personas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) {
      const key = r.personaKey ?? "none";
      if (!seen.has(key)) seen.set(key, r.personaLabel ?? (key === "none" ? "no persona" : key));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const activeGroup = groups.find((g) => g.promptId === activePromptId) ?? groups[0] ?? null;
  const engineTabs = activeGroup ? [...activeGroup.byEngine.keys()].sort() : [];
  const activeEngine = engineTab && activeGroup?.byEngine.has(engineTab) ? engineTab : engineTabs[0] ?? null;
  const drawsForTab = activeGroup && activeEngine ? activeGroup.byEngine.get(activeEngine) ?? [] : [];

  useEffect(() => {
    if (!activeGroup) return;
    if (!engineTab || !activeGroup.byEngine.has(engineTab)) {
      const firstEngine = [...activeGroup.byEngine.keys()].sort()[0];
      if (firstEngine) setEngineTab(firstEngine);
    }
  }, [activeGroup, engineTab]);

  if (error) return <ErrorState message={error} />;
  if (!rows) return <LoadingState label="Loading AI answers…" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-scout-muted">
          <Link href={safeHref(`/campaigns/${campaignId}/dashboard`) ?? "/campaigns"} className="font-medium text-scout-brand underline">
            Campaign
          </Link>{" "}
          · Answers
        </p>
        <PageTitle
          title="Answer Explorer"
          subtitle="Grouped by question. Pick an engine tab, then open draw 1, 2, or 3. Highlights use labels as well as color."
        />
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No AI answers checked yet">
          <p>Run a measured scan (or open a campaign that already has one) to explore answers here.</p>
        </EmptyState>
      ) : (
        <>
          <div
            className="flex flex-col gap-3 rounded-scout border border-scout-border bg-scout-card p-3.5 text-scout-body shadow-scout sm:flex-row sm:flex-wrap"
            data-testid="answer-filters"
          >
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-scout-caption font-medium uppercase tracking-wide text-scout-muted">Engine</span>
              <select
                className="min-h-11 w-full rounded-scout-control border border-scout-input bg-scout-card px-2.5"
                value={engineFilter}
                onChange={(e) => setEngineFilter(e.target.value)}
              >
                <option value={ALL}>All</option>
                {engines.map((e) => (
                  <option key={e} value={e}>
                    {enginePlain(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-scout-caption font-medium uppercase tracking-wide text-scout-muted">Named us</span>
              <select
                className="min-h-11 w-full rounded-scout-control border border-scout-input bg-scout-card px-2.5"
                value={namedUs}
                onChange={(e) => setNamedUs(e.target.value as "all" | "yes" | "no")}
              >
                <option value="all">All</option>
                <option value="yes">Named us</option>
                <option value="no">Did not name us</option>
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-scout-caption font-medium uppercase tracking-wide text-scout-muted">Persona</span>
              <select
                className="min-h-11 w-full rounded-scout-control border border-scout-input bg-scout-card px-2.5"
                value={personaFilter}
                onChange={(e) => setPersonaFilter(e.target.value)}
              >
                <option value={ALL}>All</option>
                {personas.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-scout-caption font-medium uppercase tracking-wide text-scout-muted">Runner</span>
              <select
                className="min-h-11 w-full rounded-scout-control border border-scout-input bg-scout-card px-2.5"
                value={runnerFilter}
                onChange={(e) => setRunnerFilter(e.target.value)}
              >
                <option value={ALL}>All</option>
                {runners.map((r) => (
                  <option key={r} value={r}>
                    {runnerPlain(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {groups.length === 0 ? (
            <EmptyState title="No answers match these filters">
              <p>Clear a filter to see more questions.</p>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ul className="max-h-[70vh] min-w-0 space-y-2 overflow-auto" data-testid="answer-list">
                {groups.map((g) => (
                  <li key={g.promptId}>
                    <button
                      type="button"
                      className={`w-full rounded border bg-white p-3 text-left text-sm hover:border-uncc-green ${
                        activeGroup?.promptId === g.promptId ? "border-uncc-green" : "border-uncc-rule"
                      }`}
                      onClick={() => {
                        setActivePromptId(g.promptId);
                        const firstEngine = [...g.byEngine.keys()].sort()[0];
                        setEngineTab(firstEngine);
                        const first = firstEngine ? g.byEngine.get(firstEngine)?.[0] : null;
                        if (first) void openDraw(first.drawId);
                      }}
                    >
                      <p className="font-medium line-clamp-2 text-scout-text">{g.promptText}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-scout-muted">
                        <span>{g.personaLabel ?? g.personaKey ?? "no persona"}</span>
                        {g.branded ? (
                          <Badge tone="muted" data-testid="location-biased-badge">
                            Location-biased
                          </Badge>
                        ) : null}
                        <span>
                          · {[...g.byEngine.keys()].length} engine{[...g.byEngine.keys()].length === 1 ? "" : "s"}
                        </span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="min-w-0 space-y-3">
                {activeGroup ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-scout-text">{activeGroup.promptText}</p>
                      {activeGroup.branded ? (
                        <Badge tone="muted" data-testid="location-biased-badge">
                          Location-biased
                        </Badge>
                      ) : null}
                    </div>
                    <div
                      className="flex w-full min-w-0 flex-wrap gap-2"
                      role="tablist"
                      aria-label="Engines"
                      data-testid="engine-tabs"
                    >
                      {engineTabs.map((eng) => (
                        <button
                          key={eng}
                          type="button"
                          role="tab"
                          aria-selected={eng === activeEngine}
                          className={`min-h-11 shrink-0 rounded px-3 py-2 text-sm ${
                            eng === activeEngine ? "bg-uncc-green text-white" : "border border-uncc-rule bg-white"
                          }`}
                          onClick={() => {
                            setEngineTab(eng);
                            const first = activeGroup.byEngine.get(eng)?.[0];
                            if (first) void openDraw(first.drawId);
                          }}
                        >
                          {enginePlain(eng)}
                        </button>
                      ))}
                    </div>
                    <div className="flex w-full min-w-0 flex-wrap gap-2" data-testid="draw-tabs">
                      {drawsForTab.map((d, i) => {
                        const n = d.drawIndex && d.drawIndex >= 1 ? d.drawIndex : i + 1;
                        return (
                          <button
                            key={d.drawId}
                            type="button"
                            className={`min-h-11 shrink-0 rounded border px-3 py-2 text-sm ${
                              selectedId === d.drawId ? "border-uncc-green bg-uncc-mist" : "border-uncc-rule bg-white"
                            }`}
                            onClick={() => void openDraw(d.drawId)}
                          >
                            Draw {n}
                            <span className="ml-1 text-xs text-uncc-ink/60">
                              {d.mentionedBrand ? "named us" : "did not"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                {detailError ? <ErrorState message={detailError} /> : null}
                {!selected ? (
                  <LoadingState label="Opening answer…" />
                ) : (
                  <article className="space-y-3 rounded border border-uncc-rule bg-white p-4" data-testid="answer-detail">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="muted">{enginePlain(selected.draw.engine)}</Badge>
                      <Badge tone="muted">{runnerPlain(selected.draw.runner)}</Badge>
                      <Badge tone="muted">{fidelityPlain(selected.draw.fidelity)}</Badge>
                    </div>
                    {selected.judge?.sentiment ? (
                      <section data-testid="answer-sentiment" className="rounded border border-scout-border bg-scout-page/60 p-3 text-sm">
                        <h2 className="text-sm font-semibold text-scout-text">Sentiment</h2>
                        <p className="mt-1 capitalize text-scout-text">{selected.judge.sentiment}</p>
                        {selected.judge.sentimentSpan?.text ? (
                          <blockquote className="mt-2 border-l-2 border-scout-brand pl-3 text-scout-muted" data-testid="sentiment-span">
                            “{selected.judge.sentimentSpan.text}”
                          </blockquote>
                        ) : null}
                      </section>
                    ) : null}
                    {selected.mentions.some((m) => m.listPosition != null) ? (
                      <section data-testid="answer-list-positions" className="text-sm">
                        <h2 className="text-sm font-semibold">List positions</h2>
                        <ul className="mt-1 list-disc pl-5 text-scout-muted">
                          {selected.mentions
                            .filter((m) => m.listPosition != null)
                            .map((m, i) => (
                              <li key={`${m.entityType}-${m.listPosition}-${i}`}>
                                {m.entityType}: position {m.listPosition}
                                {m.span?.text ? ` (“${m.span.text}”)` : ""}
                              </li>
                            ))}
                        </ul>
                      </section>
                    ) : null}
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
                    <div
                      className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-uncc-paper p-3 text-sm"
                      // escapedText is produced only by highlightAnswerHtml (escape-then-mark on raw offsets).
                      dangerouslySetInnerHTML={{ __html: selected.answer.escapedText }}
                    />
                    <section data-testid="citations-panel">
                      <h2 className="text-sm font-semibold">Citations</h2>
                      {selected.citations.length === 0 ? (
                        <p className="text-xs text-uncc-ink/60">None recorded.</p>
                      ) : (
                        <ul className="mt-2 space-y-3 text-sm">
                          {selected.citations.map((c) => (
                            <li key={c.url} className="rounded border border-uncc-rule/60 bg-white p-2.5" data-testid="citation-headline">
                              <p>
                                <SafeLink href={c.url} className="underline">
                                  {c.domain}
                                </SafeLink>{" "}
                                <span className="text-xs text-uncc-ink/60">({c.sourceClass})</span>
                                {c.page?.contentType ? (
                                  <span className="ml-1 text-xs text-uncc-ink/60">· {c.page.contentType.replace(/_/g, " ")}</span>
                                ) : null}
                              </p>
                              {c.page ? (
                                <div className="mt-1.5 space-y-1 text-xs text-uncc-ink/80">
                                  {c.page.titleHtml ? (
                                    <p>
                                      <span className="font-semibold text-uncc-ink/60">Title:</span>{" "}
                                      <span
                                        // titleHtml from highlightGapTermsHtml only
                                        dangerouslySetInnerHTML={{ __html: c.page.titleHtml }}
                                      />
                                    </p>
                                  ) : null}
                                  {c.page.h1Html ? (
                                    <p>
                                      <span className="font-semibold text-uncc-ink/60">H1:</span>{" "}
                                      <span dangerouslySetInnerHTML={{ __html: c.page.h1Html }} />
                                    </p>
                                  ) : null}
                                  {c.page.h2Htmls.length > 0 ? (
                                    <ul className="list-disc pl-4">
                                      {c.page.h2Htmls.map((html, i) => (
                                        <li key={`${c.url}-h2-${i}`}>
                                          <span className="font-semibold text-uncc-ink/60">H2:</span>{" "}
                                          <span dangerouslySetInnerHTML={{ __html: html }} />
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  <p className="text-uncc-ink/60" data-testid="citation-freshness">
                                    Freshness:{" "}
                                    {c.page.freshness?.label ??
                                      (c.page.updatedAt || c.page.publishedAt
                                        ? formatScanDate(c.page.updatedAt ?? c.page.publishedAt!)
                                        : "unknown")}
                                    {c.page.freshness?.source === "updated"
                                      ? " (page modified date)"
                                      : c.page.freshness?.source === "published"
                                        ? " (page published date)"
                                        : ""}
                                  </p>
                                  {c.page.features ? (
                                    <p className="text-uncc-ink/60" data-testid="citation-features">
                                      Features:{" "}
                                      {featureFlagsSummary(c.page.features as FeatureFlags).join(", ") || "none flagged"}
                                      {" · "}
                                      <abbr
                                        className="cursor-help underline decoration-dotted"
                                        title={FEATURES_DETECTED_TOOLTIP}
                                      >
                                        {FEATURES_DETECTED_LABEL}
                                      </abbr>
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-uncc-ink/50">Cited page headlines not fetched yet.</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h2 className="text-sm font-semibold">Claims</h2>
                      {selected.claims.length === 0 ? (
                        <p className="text-xs text-uncc-ink/60">None recorded.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-sm">
                          {selected.claims.map((c, i) => (
                            <li key={`${c.text}-${i}`}>
                              {c.text} <Badge tone="muted">{c.verdict}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </article>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

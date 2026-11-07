"use client";

import { useCallback, useEffect, useState } from "react";
import { api, EvidenceBadge, Message, SafeLink, SeverityBadge, SitePicker, useSites } from "@/components/site/client";
import { EmptyState, ErrorState, LoadingState, PartialDataNotice } from "@/components/PageStates";
import { PageTitle } from "@/components/scout/primitives";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Finding = {
  id: string;
  rule_id: string;
  title: string;
  why: string;
  evidence_strength: string;
  severity: string;
  host_id: string | null;
  host: string | null;
  page_id: string | null;
  page_url: string | null;
  detail: Record<string, unknown>;
};
type Report = {
  audit_run: { id: string; crawl_run_id: string; rules_version: string; finding_count: number; findings_sha256: string; created_at: string };
  crawl: { id: string; status: string; page_count: number; page_cap_per_host: number; finished_at: string | null };
  hosts: Array<{ id: string; host: string }>;
  severities: string[];
  counts_by_host: Array<{ host_id: string | null; host: string; severity: string; n: number }>;
  counts_by_rule: Array<{ ruleId: string; severity: string; n: number }>;
  rules: Array<{ id: string; title: string; why: string; evidence_strength: string }>;
  pagespeed: { tested: number; failed: number };
  total: number;
  findings: Finding[];
};
type PageDetail = {
  page: Record<string, unknown> & { url: string; headings?: { h1?: string[]; h2?: string[]; h3?: string[] }; faq?: Array<{ q: string; a: string }>; schema_types?: string[] };
  findings: Array<{ id: string; rule_id: string; title: string; why: string; evidence_strength: string; severity: string; detail: Record<string, unknown> }>;
};

function DetailList({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail).filter(([k]) => k !== "url");
  if (!entries.length) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-uncc-ink/70">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-uncc-ink/50">{k.replace(/_/g, " ")}</dt>
          <dd className="break-all">{Array.isArray(v) ? v.join(", ") : v === null ? "n/a" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuditPage() {
  const { sites, siteId, setSiteId, error } = useSites();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [filter, setFilter] = useState({ host_id: "", severity: "", rule_id: "" });
  const [page, setPage] = useState<PageDetail | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!siteId) {
      setReport(null);
      return;
    }
    setReport(undefined);
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    q.set("limit", "500");
    const res = await api<{ report: Report | null }>(`/api/sites/${siteId}/audit?${q}`);
    setReport(res.report);
  }, [siteId, filter]);

  useEffect(() => {
    void load().catch((err) => {
      setMsg({ tone: "error", text: String(err) });
      setReport(null);
    });
  }, [load]);

  useEffect(() => {
    document.title = "Site audit · Scout";
  }, []);

  const openPage = async (id: string) => {
    try {
      setPage(await api<PageDetail>(`/api/audit/pages/${id}?audit_run_id=${report?.audit_run.id ?? ""}`));
    } catch (err) {
      setMsg({ tone: "error", text: String(err) });
    }
  };

  const rerun = async () => {
    if (!report || !siteId) return;
    try {
      await api(`/api/sites/${siteId}/audit`, { method: "POST", body: JSON.stringify({ crawl_run_id: report.crawl.id }) });
      setMsg({ tone: "ok", text: "Audit rerun queued. It adds a new audit run; refresh when the worker finishes." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const hostNames = Array.from(new Set(report?.counts_by_host.map((c) => c.host) ?? [])).sort();
  const cell = (host: string, sev: string) => report?.counts_by_host.find((c) => c.host === host && c.severity === sev)?.n ?? 0;
  const ruleTitle = new Map(report?.rules.map((r) => [r.id, r.title]) ?? []);
  const ruleIds = Array.from(new Set(report?.counts_by_rule.map((r) => r.ruleId) ?? [])).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl space-y-1">
          <PageTitle
            title="AI readiness audit"
            subtitle="Each finding states why it may matter and how strong the evidence is. Counts are findings, not rates. Rerunning the audit on the same crawl gives identical findings; the fingerprint below proves it."
          />
        </div>
        {sites ? <SitePicker sites={sites} siteId={siteId} onChange={setSiteId} /> : null}
      </div>
      {error ? <ErrorState message={error} /> : null}
      {msg?.tone === "error" ? <ErrorState message={msg.text} /> : <Message msg={msg} />}
      {!sites ? <LoadingState label="Loading sites…" /> : null}
      {sites && sites.length === 0 ? (
        <EmptyState title="No sites yet">
          <p>
            Start from <SafeLink href="/onboarding">Onboarding</SafeLink> to add a root URL and crawl before running an audit.
          </p>
        </EmptyState>
      ) : null}
      {siteId && report === undefined ? <LoadingState label="Loading audit findings…" /> : null}
      {siteId && report === null ? (
        <EmptyState title="No audit yet">
          <p>Crawl the site from Onboarding first, then return here to review findings.</p>
        </EmptyState>
      ) : null}
      {report && report.crawl.status !== "complete" ? (
        <PartialDataNotice>Crawl status is {report.crawl.status}. Findings may still change.</PartialDataNotice>
      ) : null}
      {report ? (
        <>
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {report.audit_run.finding_count} findings · {report.crawl.page_count} pages crawled
                </CardTitle>
                <CardDescription>
                  Rules {report.audit_run.rules_version} · fingerprint <span className="font-mono">{report.audit_run.findings_sha256.slice(0, 16)}…</span> · crawl{" "}
                  {report.crawl.finished_at ? new Date(report.crawl.finished_at).toLocaleString() : report.crawl.status} · PageSpeed tested {report.pagespeed.tested} pages
                  {report.pagespeed.failed ? ` (${report.pagespeed.failed} failed)` : ""}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={rerun}>
                Rerun audit on this crawl
              </Button>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                  <tr>
                    <th className="py-1 pr-6">Host</th>
                    {report.severities.map((s) => (
                      <th key={s} className="pr-4 text-right">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hostNames.map((h) => (
                    <tr key={h} className="border-t border-uncc-rule/60">
                      <td className="py-1 pr-6 font-mono text-xs">{h}</td>
                      {report.severities.map((s) => (
                        <td key={s} className="pr-4 text-right tabular-nums">
                          {cell(h, s) || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <select aria-label="Host" className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm" value={filter.host_id} onChange={(e) => setFilter({ ...filter, host_id: e.target.value })}>
              <option value="">All hosts</option>
              <option value="none">Site wide</option>
              {report.hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.host}
                </option>
              ))}
            </select>
            <select aria-label="Severity" className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm" value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })}>
              <option value="">All severities</option>
              {report.severities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select aria-label="Rule" className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm" value={filter.rule_id} onChange={(e) => setFilter({ ...filter, rule_id: e.target.value })}>
              <option value="">All rules</option>
              {ruleIds.map((r) => (
                <option key={r} value={r}>
                  {ruleTitle.get(r) ?? r} ({report.counts_by_rule.filter((x) => x.ruleId === r).reduce((a, b) => a + b.n, 0)})
                </option>
              ))}
            </select>
            <span className="self-center text-sm text-uncc-ink/60">
              {report.findings.length} of {report.total} shown
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
            <ul className="space-y-2">
              {report.findings.map((f) => (
                <li key={f.id} className="rounded border border-uncc-rule bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <strong className="text-sm">{f.title}</strong>
                    <EvidenceBadge strength={f.evidence_strength} />
                    <span className="font-mono text-xs text-uncc-ink/60">{f.host ?? "site wide"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-uncc-ink/70">{f.why}</p>
                  {f.page_url ? (
                    <p className="mt-1 text-xs">
                      <button type="button" className="text-uncc-green underline-offset-2 hover:underline" onClick={() => f.page_id && openPage(f.page_id)}>
                        {f.page_url}
                      </button>
                    </p>
                  ) : null}
                  <DetailList detail={f.detail} />
                </li>
              ))}
            </ul>
            <aside className="lg:sticky lg:top-4 lg:self-start">
              {page ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Page</CardTitle>
                    <CardDescription>
                      <SafeLink href={page.page.url} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {(["status_code", "title", "h1", "meta_description", "canonical", "word_count", "raw_word_count", "render_mode", "lastmod", "robots_meta", "fetch_error"] as const).map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-uncc-ink/50">{k.replace(/_/g, " ")}</dt>
                          <dd className="break-all">{page.page[k] === null || page.page[k] === undefined ? "n/a" : String(page.page[k])}</dd>
                        </div>
                      ))}
                    </dl>
                    <div>
                      <p className="text-uncc-ink/50">Schema types</p>
                      <div className="flex flex-wrap gap-1">{(page.page.schema_types ?? []).map((t) => <Badge key={t}>{t}</Badge>)}</div>
                    </div>
                    <div>
                      <p className="text-uncc-ink/50">H2 headings</p>
                      <ul className="list-disc pl-4">{(page.page.headings?.h2 ?? []).slice(0, 12).map((h, i) => <li key={i}>{h}</li>)}</ul>
                    </div>
                    {page.page.faq?.length ? (
                      <div>
                        <p className="text-uncc-ink/50">FAQ blocks ({page.page.faq.length})</p>
                        <ul className="list-disc pl-4">{page.page.faq.slice(0, 8).map((q, i) => <li key={i}>{q.q}</li>)}</ul>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-uncc-ink/50">Findings on this page</p>
                      <ul className="space-y-1">
                        {page.findings.map((f) => (
                          <li key={f.id}>
                            <SeverityBadge severity={f.severity} /> {f.title} <EvidenceBadge strength={f.evidence_strength} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    {typeof page.page.text_excerpt === "string" ? (
                      <div>
                        <p className="text-uncc-ink/50">Text excerpt (as crawled)</p>
                        <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-uncc-paper p-2">{page.page.text_excerpt}</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <p className="text-xs text-uncc-ink/60">Select a page URL to see its details.</p>
              )}
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

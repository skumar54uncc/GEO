"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, Message, SafeLink, SitePicker, useSites } from "@/components/site/client";
import { EmptyState, ErrorState, LoadingState, PartialDataNotice } from "@/components/PageStates";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeHref } from "@/lib/url/safeHref";

type Host = {
  id: string;
  host: string;
  included: boolean;
  included_by_user: boolean;
  discovered_via: string[];
  resolves: boolean | null;
  root_status: number | null;
  login_portal: boolean | null;
  exclude_reason: string | null;
  robots_status: number | null;
  sitemap_url_count: number | null;
  llms_txt_status: number | null;
};
type CrawlRun = { id: string; status: string; page_count: number; page_cap_per_host: number; hosts: number; hosts_done: number; error: string | null; created_at: string; audits: Array<{ id: string; finding_count: number; findings_sha256: string }> };
type SiteView = {
  site: { id: string; rootUrl: string; status: string; discovery: Record<string, unknown> | null; discoveryError: string | null };
  brand: { id: string; name: string; ipeds_unitid: string | null; profile: Record<string, string | number> };
  root_domain: string;
  hosts: Host[];
  crawl_runs: CrawlRun[];
};
type Candidate = {
  id: string;
  kind: string;
  value: string;
  sourceUrl: string;
  sourceUrls: string[];
  method: string;
  evidence: string | null;
  groupLabel: string | null;
  groupSource: string | null;
  requiresContext: boolean;
  status: "proposed" | "confirmed" | "rejected";
};
type Check = { id: string; source: string; field: string; status: string; observed: { value: unknown; as_of?: string | null; note?: string | null }; expected: { value: unknown }; checkedAt: string };
type Peer = { id: string; ipedsUnitid: string; name: string; city: string | null; state: string | null; score: string | null; reasons: Array<{ kind: string; text: string }>; status: string };
type Competitor = { id: string; name: string; source: string; ipedsUnitid: string | null };

const STEPS = ["Hosts", "Entities", "Peers"] as const;
const KIND_LABEL: Record<string, string> = {
  name: "Institution name",
  alias: "Aliases",
  college: "Colleges and schools",
  program: "Programs and degrees",
  research_center: "Research centers",
  ranking_claim: "Rankings claims (the site's own words)",
  location: "Locations",
};
const PROFILE_FIELDS: Array<[string, string]> = [
  ["name", "Official name"],
  ["founding_year", "Founding year"],
  ["city", "City"],
  ["state", "State"],
  ["type", "Type (public or private)"],
  ["website", "Website"],
  ["enrollment_total", "Total enrollment"],
  ["enrollment_undergrad", "Undergraduate enrollment"],
  ["ipeds_unitid", "IPEDS unit id"],
];

function HostsStep({ view, reload, setMsg }: { view: SiteView; reload: () => Promise<void>; setMsg: (m: { tone: "ok" | "error"; text: string }) => void }) {
  const [showExcluded, setShowExcluded] = useState(false);
  const [filter, setFilter] = useState("");
  const [newHost, setNewHost] = useState("");
  const [cap, setCap] = useState(40);
  const included = view.hosts.filter((h) => h.included);
  const shown = view.hosts.filter((h) => (showExcluded || h.included) && h.host.includes(filter.trim().toLowerCase()));
  const latest = view.crawl_runs[0];
  const d = view.site.discovery as Record<string, unknown> | null;

  const act = async (fn: () => Promise<string>) => {
    try {
      setMsg({ tone: "ok", text: await fn() });
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Discovery</CardTitle>
          <CardDescription>
            From robots.txt, sitemaps, links on the home page and sitemap pages, and certificate transparency (crt.sh). Hosts that do not
            resolve, fail at the root, are sign-in portals, or look like dev or test servers start excluded. Your choices are kept when
            discovery reruns.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Status: <strong>{view.site.status}</strong>
          </span>
          {d ? (
            <span className="text-uncc-ink/70">
              {String(d.hosts_found)} hosts found · {String(d.hosts_checked)} checked · {String(d.sitemap_urls)} sitemap URLs ·{" "}
              crt.sh {(d.ct as { ok: boolean; hosts: number; error: string | null })?.ok ? `${(d.ct as { hosts: number }).hosts} names` : `failed: ${(d.ct as { error: string | null })?.error}`}
            </span>
          ) : null}
          {view.site.discoveryError ? <span className="text-red-700">{view.site.discoveryError}</span> : null}
          <Button size="sm" variant="outline" disabled={view.site.status === "discovering"} onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/discover`, { method: "POST" }), "Discovery queued."))}>
            Rerun discovery
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>
              Hosts · {included.length} included of {view.hosts.length}
            </CardTitle>
            <CardDescription>Only included hosts are crawled. Excluded hosts are never fetched by the crawler.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input className="h-8 w-48" placeholder="Filter hosts" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
              Show excluded
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-uncc-ink/60">
                <tr>
                  <th className="py-2 pr-2">Include</th>
                  <th className="pr-2">Host</th>
                  <th className="pr-2">Found via</th>
                  <th className="pr-2">Root</th>
                  <th className="pr-2">robots.txt</th>
                  <th className="pr-2">Sitemap URLs</th>
                  <th className="pr-2">Reason excluded</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 500).map((h) => (
                  <tr key={h.id} className="border-t border-uncc-rule/60">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Include ${h.host}`}
                        checked={h.included}
                        onChange={(e) =>
                          act(async () => {
                            await api(`/api/sites/${view.site.id}/hosts`, { method: "PATCH", body: JSON.stringify({ host_id: h.id, included: e.target.checked }) });
                            return `${e.target.checked ? "Included" : "Excluded"} ${h.host}.`;
                          })
                        }
                      />
                    </td>
                    <td className="pr-2 font-mono text-xs">
                      {h.host} {h.included_by_user ? <Badge tone="muted">your choice</Badge> : null}
                    </td>
                    <td className="pr-2 text-xs">{h.discovered_via.join(", ")}</td>
                    <td className="pr-2 text-xs">{h.resolves === false ? "no DNS" : (h.root_status ?? "n/a")}</td>
                    <td className="pr-2 text-xs">{h.robots_status ?? "n/a"}</td>
                    <td className="pr-2 text-xs">{h.sitemap_url_count ?? "n/a"}</td>
                    <td className="pr-2 text-xs text-uncc-ink/70">{h.exclude_reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 500 ? <p className="text-xs text-uncc-ink/60">Showing 500 of {shown.length}. Use the filter.</p> : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="new-host">Add a host under {view.root_domain}</Label>
              <Input id="new-host" className="h-8 w-64" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder={`news.${view.root_domain}`} />
            </div>
            <Button size="sm" variant="outline" onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/hosts`, { method: "POST", body: JSON.stringify({ host: newHost }) }), setNewHost(""), "Host added and included."))}>
              Add host
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crawl</CardTitle>
          <CardDescription>
            Crawlee with Playwright. Respects robots.txt, at most 4 requests at a time per host, a polite rate limit, and an identifying user
            agent with a contact address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4 text-sm">
          <div className="space-y-1">
            <Label htmlFor="cap">Page cap per host</Label>
            <Input id="cap" type="number" min={1} max={2000} className="h-8 w-28" value={cap} onChange={(e) => setCap(Number(e.target.value))} />
          </div>
          <Button
            disabled={!included.length || latest?.status === "running" || latest?.status === "queued"}
            onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/crawl`, { method: "POST", body: JSON.stringify({ page_cap_per_host: cap }) }), `Crawl queued for ${included.length} hosts, up to ${cap} pages each.`))}
          >
            Crawl {included.length} included hosts
          </Button>
          {latest ? (
            <span className="text-uncc-ink/70">
              Latest crawl: {latest.status} · {latest.page_count} pages · {latest.hosts_done} of {latest.hosts} hosts done
              {latest.error ? <span className="text-red-700"> · {latest.error}</span> : null}
              {latest.audits[0] ? (
                <>
                  {" "}
                  ·{" "}
                  <Link className="text-uncc-green underline" href={safeHref(`/audit?site=${view.site.id}`) ?? "/audit"}>
                    {latest.audits[0].finding_count} findings
                  </Link>
                </>
              ) : null}
            </span>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EntitiesStep({ view, reloadSite, setMsg }: { view: SiteView; reloadSite: () => Promise<void>; setMsg: (m: { tone: "ok" | "error"; text: string }) => void }) {
  const [cands, setCands] = useState<Candidate[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    const [c, k] = await Promise.all([
      api<{ candidates: Candidate[] }>(`/api/sites/${view.site.id}/entities`),
      api<{ checks: Check[] }>(`/api/sites/${view.site.id}/entity-checks`),
    ]);
    setCands(c.candidates);
    setChecks(k.checks);
    return c.candidates;
  }, [view.site.id]);

  useEffect(() => {
    void load().then((list) => {
      // Confirmed values win; otherwise prefill from what the site itself states.
      const p = view.brand.profile ?? {};
      const name = list.find((c) => c.kind === "name" && c.status !== "rejected")?.value;
      const address = list.find((c) => c.kind === "location" && c.method === "schema")?.value?.split(", ");
      setProfile({
        name: String(p.name ?? name ?? view.brand.name ?? ""),
        founding_year: String(p.founding_year ?? ""),
        city: String(p.city ?? address?.[1] ?? ""),
        state: String(p.state ?? address?.[2] ?? ""),
        type: String(p.type ?? ""),
        website: String(p.website ?? view.root_domain),
        enrollment_total: String(p.enrollment_total ?? ""),
        enrollment_undergrad: String(p.enrollment_undergrad ?? ""),
        ipeds_unitid: String(view.brand.ipeds_unitid ?? ""),
      });
    });
  }, [view.brand.profile, view.brand.name, view.brand.ipeds_unitid, view.root_domain, load]);

  const act = async (fn: () => Promise<string>) => {
    try {
      setMsg({ tone: "ok", text: await fn() });
      await load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };
  const review = (c: Candidate, status: Candidate["status"], requires_context?: boolean) =>
    act(async () => (await api(`/api/sites/${view.site.id}/entities`, { method: "PATCH", body: JSON.stringify({ id: c.id, status, requires_context }) }), `${status === "confirmed" ? "Confirmed" : status === "rejected" ? "Rejected" : "Reset"}: ${c.value.slice(0, 60)}`));

  const byKind = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of cands) {
      if (!showRejected && c.status === "rejected") continue;
      if (!m.has(c.kind)) m.set(c.kind, []);
      m.get(c.kind)!.push(c);
    }
    return m;
  }, [cands, showRejected]);
  const confirmedProfile = Boolean((view.brand.profile as { confirmed_at?: string })?.confirmed_at);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Confirmed profile</CardTitle>
          <CardDescription>The values public sources are checked against. Prefilled from what the site states; confirm or correct each.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {PROFILE_FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`p-${k}`}>{label}</Label>
                <Input id={`p-${k}`} className="h-8" value={profile[k] ?? ""} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/profile`, { method: "PUT", body: JSON.stringify(profile) }), await reloadSite(), "Profile confirmed."))}>
              Confirm profile
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!confirmedProfile}
              onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/entity-checks`, { method: "POST" }), "Entity check queued. Refresh in a minute."))}
            >
              Check Knowledge Graph, Wikidata, Wikipedia, IPEDS, Scorecard
            </Button>
          </div>
          {checks.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                <tr>
                  <th className="py-1">Source</th>
                  <th>Field</th>
                  <th>Source says</th>
                  <th>Confirmed</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id} className="border-t border-uncc-rule/60">
                    <td className="py-1">{c.source}</td>
                    <td>{c.field}</td>
                    <td>
                      {c.observed?.value === null || c.observed?.value === undefined ? "n/a" : String(c.observed.value)}
                      {c.observed?.as_of ? <span className="text-xs text-uncc-ink/60"> (as of {c.observed.as_of})</span> : null}
                      {c.observed?.note ? <span className="block text-xs text-uncc-ink/60">{c.observed.note}</span> : null}
                    </td>
                    <td>{String(c.expected?.value ?? "")}</td>
                    <td>
                      <Badge tone={c.status === "match" ? "green" : c.status === "mismatch" ? "gold" : "muted"}>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-uncc-ink/60">No entity checks yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>Proposed entities</CardTitle>
            <CardDescription>
              Found by rules in schema, titles, headings, navigation and page text, each with its source page. The optional grouping step uses an
              LLM only to group and label items already found; it cannot add any. &ldquo;Charlotte&rdquo; alone is the city, so a bare place word
              is stored as needing context.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />
              Show rejected
            </label>
            <Button size="sm" variant="outline" onClick={() => act(async () => { const r = await api<{ result: { added: number; dropped: number } }>(`/api/sites/${view.site.id}/entities`, { method: "POST", body: JSON.stringify({ action: "extract" }) }); return `${r.result.added} new candidates; ${r.result.dropped} unreviewed ones no longer found were removed.`; })}>
              Re-extract from latest crawl
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(async () => { const r = await api<{ result: { status: string; reason: string | null; assigned: number; rejected: number } }>(`/api/sites/${view.site.id}/entities`, { method: "POST", body: JSON.stringify({ action: "group" }) }); return r.result.status === "ran" ? `Grouped ${r.result.assigned}; ${r.result.rejected} model answers rejected.` : `Grouping ${r.result.status}: ${r.result.reason}`; })}>
              Group with LLM
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {cands.length === 0 ? <p className="text-sm text-uncc-ink/60">No candidates yet. They appear after the first crawl finishes.</p> : null}
          {Object.keys(KIND_LABEL)
            .filter((k) => byKind.get(k)?.length)
            .map((kind) => (
              <div key={kind} className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {KIND_LABEL[kind]} <span className="font-normal text-uncc-ink/60">({byKind.get(kind)!.length})</span>
                </h4>
                <ul className="max-h-72 divide-y divide-uncc-rule/60 overflow-auto text-sm">
                  {byKind.get(kind)!.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className={c.status === "rejected" ? "line-through text-uncc-ink/50" : ""}>{c.value}</span>{" "}
                        {c.requiresContext ? <Badge tone="gold">needs context</Badge> : null} {c.status === "confirmed" ? <Badge tone="green">confirmed</Badge> : null}{" "}
                        {c.groupLabel ? <Badge tone="muted">{c.groupLabel}</Badge> : null}
                        <div className="text-xs text-uncc-ink/60">
                          {c.method} · <SafeLink href={c.sourceUrl} />
                          {c.sourceUrls.length > 1 ? ` · +${c.sourceUrls.length - 1} more pages` : ""}
                          {c.evidence ? ` · ${c.evidence}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {c.kind === "alias" ? (
                          <Button size="sm" variant="ghost" onClick={() => review(c, c.status, !c.requiresContext)}>
                            {c.requiresContext ? "Counts alone" : "Needs context"}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" disabled={c.status === "confirmed"} onClick={() => review(c, "confirmed")}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" disabled={c.status === "rejected"} onClick={() => review(c, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PeersStep({ view, setMsg }: { view: SiteView; setMsg: (m: { tone: "ok" | "error"; text: string }) => void }) {
  const [data, setData] = useState<{ suggestions: Peer[]; competitors: Competitor[]; ipeds_unitid: string | null; data_gov_key: boolean } | null>(null);
  const [manual, setManual] = useState({ name: "", domain: "" });
  const load = useCallback(async () => setData(await api(`/api/sites/${view.site.id}/peers`)), [view.site.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<string>) => {
    try {
      setMsg({ tone: "ok", text: await fn() });
      await load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };
  if (!data) return <LoadingState label="Loading peer suggestions…" />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>Suggested peers</CardTitle>
            <CardDescription>
              From College Scorecard (IPEDS unit ids): same Carnegie basic class, region and control, ranked by overlap in programs offered.
              {data.data_gov_key ? "" : " No DATA_GOV_API_KEY is set, so the shared DEMO_KEY is used (about 10 calls an hour)."}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => act(async () => { const r = await api<{ result: { suggested: number; self: { name: string; carnegie: string } | null } }>(`/api/sites/${view.site.id}/peers`, { method: "POST", body: JSON.stringify({ action: "suggest" }) }); return `${r.result.suggested} suggestions for ${r.result.self?.name} (${r.result.self?.carnegie}).`; })}>
            Suggest peers
          </Button>
        </CardHeader>
        <CardContent>
          {data.suggestions.length ? (
            <ul className="divide-y divide-uncc-rule/60 text-sm">
              {data.suggestions.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div>
                    <strong>{p.name}</strong> <span className="text-uncc-ink/60">{[p.city, p.state].filter(Boolean).join(", ")} · unit id {p.ipedsUnitid}</span>{" "}
                    {p.status !== "proposed" ? <Badge tone={p.status === "confirmed" ? "green" : "muted"}>{p.status}</Badge> : null}
                    <ul className="mt-1 list-disc pl-5 text-xs text-uncc-ink/70">
                      {p.reasons.map((r) => (
                        <li key={r.kind}>{r.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={p.status === "confirmed"} onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/peers`, { method: "PATCH", body: JSON.stringify({ id: p.id, status: "confirmed" }) }), `Added ${p.name} as a peer.`))}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" disabled={p.status === "rejected"} onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/peers`, { method: "PATCH", body: JSON.stringify({ id: p.id, status: "rejected" }) }), `Rejected ${p.name}.`))}>
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-uncc-ink/60">No suggestions yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Peers in use · {data.competitors.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="flex flex-wrap gap-2">
            {data.competitors.map((c) => (
              <li key={c.id}>
                <Badge tone={c.source === "ipeds_suggested" ? "green" : "neutral"}>
                  {c.name}
                  {c.ipedsUnitid ? ` · ${c.ipedsUnitid}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <Input className="h-8 w-64" placeholder="Peer name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <Input className="h-8 w-48" placeholder="Domain (optional)" value={manual.domain} onChange={(e) => setManual({ ...manual, domain: e.target.value })} />
            <Button size="sm" variant="outline" onClick={() => act(async () => (await api(`/api/sites/${view.site.id}/peers`, { method: "POST", body: JSON.stringify(manual) }), setManual({ name: "", domain: "" }), "Peer added."))}>
              Add peer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  const { sites, siteId, setSiteId, reload: reloadSites, error } = useSites();
  const [view, setView] = useState<SiteView | null>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("Hosts");
  const [rootUrl, setRootUrl] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const loadSite = useCallback(async () => {
    if (!siteId) return setView(null);
    setView(await api<SiteView>(`/api/sites/${siteId}`));
  }, [siteId]);

  useEffect(() => {
    void loadSite().catch((err) => setMsg({ tone: "error", text: String(err) }));
  }, [loadSite]);

  const busy = view && (view.site.status === "discovering" || view.site.status === "new" || ["queued", "running"].includes(view.crawl_runs[0]?.status ?? ""));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void loadSite(), 4000);
    return () => clearInterval(t);
  }, [busy, loadSite]);

  const start = async () => {
    try {
      const res = await api<{ site: { id: string }; created: boolean }>("/api/sites", { method: "POST", body: JSON.stringify({ root_url: rootUrl }) });
      await reloadSites(res.site.id);
      setSiteId(res.site.id);
      setMsg({ tone: "ok", text: res.created ? "Site added. Discovery is running in the worker (npm run worker)." : "That site already exists." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-6">
      <ScoutCard className="flex flex-wrap items-end justify-between gap-4" hover={false}>
        <div className="max-w-3xl space-y-1">
          <PageTitle
            title="Onboarding"
            subtitle="Enter a root URL. The platform finds hosts, crawls included ones, proposes names, aliases, colleges, programs and peers for confirmation, and audits what AI crawlers can read."
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="root-url">Root URL</Label>
            <Input id="root-url" className="h-9 w-64 rounded-scout-control border-scout-border" placeholder="charlotte.edu" value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} />
          </div>
          <Button onClick={start} disabled={!rootUrl.trim()}>
            Start
          </Button>
        </div>
      </ScoutCard>
      {error ? <ErrorState message={error} /> : null}
      {msg?.tone === "error" ? <ErrorState message={msg.text} /> : <Message msg={msg} />}
      {!sites ? <LoadingState label="Loading sites…" /> : null}
      {sites?.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <SitePicker sites={sites} siteId={siteId} onChange={setSiteId} />
          <nav className="flex gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                className={`px-3 py-1.5 text-sm ${step === s ? "border-b-2 border-uncc-green font-medium text-uncc-green" : "text-uncc-ink/70 hover:text-uncc-ink"}`}
              >
                {i + 1}. {s}
              </button>
            ))}
            <Link href={safeHref(`/audit${siteId ? `?site=${siteId}` : ""}`) ?? "/audit"} className="px-3 py-1.5 text-sm text-uncc-ink/70 hover:text-uncc-ink">
              4. Audit →
            </Link>
          </nav>
        </div>
      ) : null}
      {busy ? <PartialDataNotice>Discovery or crawl is still running. This page refreshes automatically.</PartialDataNotice> : null}
      {view ? (
        step === "Hosts" ? (
          <HostsStep view={view} reload={loadSite} setMsg={setMsg} />
        ) : step === "Entities" ? (
          <EntitiesStep view={view} reloadSite={loadSite} setMsg={setMsg} />
        ) : (
          <PeersStep view={view} setMsg={setMsg} />
        )
      ) : siteId && !view ? (
        <LoadingState label="Loading site details…" />
      ) : sites && !sites.length ? (
        <EmptyState title="No sites yet">
          <p>Enter a root URL above to begin discovery and crawl.</p>
        </EmptyState>
      ) : null}
    </div>
  );
}

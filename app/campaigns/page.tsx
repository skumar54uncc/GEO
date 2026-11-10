"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OperatorOnly, canMutate } from "@/components/CanAct";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/lib/auth";
import { enginePlain, runnerPlain } from "@/lib/ui/labels";
import { safeHref } from "@/lib/url/safeHref";

type EngineSel = { engine: string; runner: string };
type Campaign = {
  id: string;
  name: string;
  topic: string;
  status: "draft" | "active" | "archived";
  legacy: boolean;
  engines: EngineSel[];
  regions: Array<{ id: string; label: string }>;
  personas: Array<{ id: string; name: string; key?: string | null; group?: string | null }>;
  persona_subset_ok?: boolean;
  prompt_count: number;
  approved_count: number;
  fixture_approved_count?: number;
  prompt_sets: Array<{ id: string; version: number; sha256: string | null; frozen_at: string | null }>;
};
type Options = {
  engines: string[];
  runners: string[];
  default_runner: Record<string, string>;
  has_site_audit?: boolean;
  regions: Array<{
    id: string;
    label: string;
    picker_label?: string;
    location_code?: number | null;
    catalog_key?: string | null;
  }>;
  personas: Array<{
    id: string;
    name: string;
    key: string | null;
    group: string | null;
    group_label: string | null;
    kind: string;
    selectable: boolean;
    opening: string | null;
  }>;
  persona_groups: Array<{ key: string; label: string }>;
  persona_subset: { min: number; max: number };
};
type Draft = {
  name: string;
  topic: string;
  status: Campaign["status"];
  engines: EngineSel[];
  region_ids: string[];
  persona_ids: string[];
};

function emptyDraft(): Draft {
  return { name: "", topic: "", status: "draft", engines: [], region_ids: [], persona_ids: [] };
}

function draftFrom(c: Campaign): Draft {
  return {
    name: c.name,
    topic: c.topic,
    status: c.status,
    engines: c.engines,
    region_ids: c.regions.map((r) => r.id),
    persona_ids: c.personas.map((p) => p.id),
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function CampaignForm({
  options,
  draft,
  setDraft,
}: {
  options: Options;
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  const runnerFor = (engine: string) => draft.engines.find((e) => e.engine === engine)?.runner;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-topic">Topic</Label>
          <Textarea id="c-topic" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-status">Status</Label>
          <select
            id="c-status"
            className="h-9 w-full rounded border border-uncc-rule bg-white px-2 text-sm"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Engines and how each is captured</Label>
        <p className="text-xs text-uncc-ink/60">
          Runner is planned, not verified. Provider availability is confirmed in Phase 3.
        </p>
        {options.engines.map((engine) => {
          const runner = runnerFor(engine);
          return (
            <div key={engine} className="flex items-center gap-3">
              <label className="flex w-44 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(runner)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      engines: runner
                        ? draft.engines.filter((e) => e.engine !== engine)
                        : [...draft.engines, { engine, runner: options.default_runner[engine] }],
                    })
                  }
                />
                {enginePlain(engine)}
              </label>
              <select
                aria-label={`How answers are collected for ${engine}`}
                disabled={!runner}
                className="h-8 flex-1 rounded border border-uncc-rule bg-white px-2 text-xs disabled:opacity-40"
                value={runner ?? options.default_runner[engine]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    engines: draft.engines.map((x) => (x.engine === engine ? { engine, runner: e.target.value } : x)),
                  })
                }
              >
                {options.runners.map((r) => (
                  <option key={r} value={r}>
                    {runnerPlain(r)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="space-y-2" data-testid="campaign-regions">
        <Label>Regions</Label>
        <p className="text-xs text-uncc-ink/60">
          Default is 1 region (Charlotte metro). Each extra region multiplies scan draws and cost. Estimate shows cost per
          region.
        </p>
        {options.regions.length ? (
          options.regions.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.region_ids.includes(r.id)}
                onChange={() => setDraft({ ...draft, region_ids: toggle(draft.region_ids, r.id) })}
                data-testid={`region-option-${r.catalog_key ?? r.id}`}
              />
              <span>
                {r.picker_label ?? r.label}
                {r.location_code != null ? (
                  <span className="text-uncc-ink/50"> · DFS {r.location_code}</span>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p className="text-xs text-uncc-ink/60">No regions yet.</p>
        )}
        {draft.region_ids.length > 1 ? (
          <p className="text-xs text-amber-900" data-testid="region-cost-multiplier">
            {draft.region_ids.length} regions selected → estimate multiplies by {draft.region_ids.length} (cost per region
            shown at scan/schedule estimate).
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Personas</Label>
        <p className="text-xs text-uncc-ink/60">
          A persona changes how the prompt is written, not who is logged in. Pick {options.persona_subset.min} to{" "}
          {options.persona_subset.max} from the menu (library is the menu, not the order).
        </p>
        {draft.persona_ids.length > 0 &&
        (draft.persona_ids.length < options.persona_subset.min || draft.persona_ids.length > options.persona_subset.max) ? (
          <p className="text-xs text-amber-800">Recommended subset is {options.persona_subset.min}–{options.persona_subset.max} personas.</p>
        ) : null}
        {(options.persona_groups ?? []).map((g) => {
          const groupPersonas = options.personas.filter((p) => p.group === g.key);
          if (!groupPersonas.length) return null;
          return (
            <div key={g.key} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-uncc-ink/60">{g.label}</p>
              {groupPersonas.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.persona_ids.includes(p.id)}
                    onChange={() => setDraft({ ...draft, persona_ids: toggle(draft.persona_ids, p.id) })}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [overrideFor, setOverrideFor] = useState<{ id: string; name: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, opts, me] = await Promise.all([
        api<{ campaigns: Campaign[] }>(`/api/campaigns${showArchived ? "?archived=1" : ""}`),
        api<Options>("/api/campaigns/options"),
        api<{ user: { role: Role } | null; activeOrganization?: { isDemo?: boolean } | null }>("/api/auth/me"),
      ]);
      setCampaigns(list.campaigns);
      setOptions(opts);
      setRole(me.user?.role ?? null);
      setIsDemo(Boolean(me.activeOrganization?.isDemo));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<string>) {
    setMessage(null);
    try {
      const text = await action();
      setMessage({ tone: "ok", text });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  const create = () =>
    run(async () => {
      if (!creating) return "";
      await api("/api/campaigns", { method: "POST", body: JSON.stringify(creating) });
      setCreating(null);
      return "Campaign created.";
    });

  const save = () =>
    run(async () => {
      if (!editing) return "";
      await api(`/api/campaigns/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing.draft) });
      setEditing(null);
      return "Campaign saved.";
    });

  const archive = (c: Campaign) =>
    run(async () => {
      await api(`/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
      return `Archived “${c.name}”.`;
    });

  const freezeBlockedByFixture = (c: Campaign) =>
    !isDemo && (c.fixture_approved_count ?? 0) > 0;

  const freeze = (c: Campaign, unbrandedOverrideReason?: string) =>
    run(async () => {
      if (freezeBlockedByFixture(c)) {
        throw new Error("Fixture — cannot be frozen");
      }
      const res = await fetch(`/api/campaigns/${c.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unbrandedOverrideReason ? { unbrandedOverrideReason } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.code === "unbranded_share") {
          setOverrideFor({ id: c.id, name: c.name, reason: "" });
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setOverrideFor(null);
      return json.created
        ? `Froze version ${json.set.version} (${String(json.set.sha256).slice(0, 12)}…).`
        : `No change since version ${json.set.version}; nothing new to freeze.`;
    });

  if (!campaigns || !options) {
    return message?.tone === "error" ? <ErrorState message={message.text} /> : <LoadingState label="Loading campaigns…" />;
  }

  const operator = canMutate(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl space-y-1">
          <h1 className="font-serif text-2xl font-semibold text-uncc-ink">Campaigns</h1>
          <p className="text-sm leading-6 text-uncc-ink/75">
            A campaign owns its prompts, engines, regions, and personas. Freezing snapshots the approved prompts into a
            numbered version with a hash. Scores are only compared within one version; editing a prompt afterwards only
            affects the next version.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-uncc-ink/70">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <OperatorOnly role={role}>
            <Button
              onClick={() => {
                const charlotte =
                  options?.regions.find((r) => r.catalog_key === "charlotte_metro") ??
                  options?.regions.find((r) => /charlotte/i.test(r.label));
                setCreating({
                  ...emptyDraft(),
                  region_ids: charlotte ? [charlotte.id] : [],
                });
              }}
              disabled={Boolean(creating)}
              data-testid="new-campaign"
            >
              New campaign
            </Button>
          </OperatorOnly>
        </div>
      </div>

      {message ? (
        <p className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-uncc-green"}`} role="status">
          {message.text}
        </p>
      ) : null}

      {overrideFor ? (
        <Card data-testid="unbranded-override-card">
          <CardHeader>
            <CardTitle>Unbranded share below 70%</CardTitle>
            <CardDescription>
              Freezing “{overrideFor.name}” needs an editor reason. The reason is audit-logged.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={overrideFor.reason}
              onChange={(e) => setOverrideFor({ ...overrideFor, reason: e.target.value })}
              placeholder="Why freeze below the 70% unbranded default?"
              data-testid="unbranded-override-reason"
            />
            <div className="flex gap-2">
              <Button
                data-testid="unbranded-override-confirm"
                disabled={overrideFor.reason.trim().length < 3}
                onClick={() => {
                  const c = campaigns?.find((x) => x.id === overrideFor.id);
                  if (c) freeze(c, overrideFor.reason.trim());
                }}
              >
                Freeze with override
              </Button>
              <Button variant="outline" onClick={() => setOverrideFor(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>New campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {options.has_site_audit === false ? (
              <p
                className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                data-testid="no-audit-banner"
                role="status"
              >
                This organization has no site audit yet. Start with an audit before measuring visibility.{" "}
                <Link href="/audit" className="font-medium underline">
                  Open site audit
                </Link>
              </p>
            ) : null}
            <CampaignForm options={options} draft={creating} setDraft={setCreating} />
            <div className="flex gap-2">
              <Button onClick={create}>Create</Button>
              <Button variant="outline" onClick={() => setCreating(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet">
          <p>
            {operator
              ? "Create a campaign to start measuring AI search visibility."
              : "An Operator must prepare a campaign before Leadership can review results."}
          </p>
        </EmptyState>
      ) : null}

      {campaigns.map((c) => {
        const latest = c.prompt_sets.find((s) => s.frozen_at);
        const isEditing = editing?.id === c.id;
        return (
          <Card key={c.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle>{c.name}</CardTitle>
                  <Badge tone={c.status === "active" ? "green" : c.status === "archived" ? "muted" : "neutral"}>
                    {c.status}
                  </Badge>
                  {c.legacy ? <Badge tone="gold">migrated legacy data</Badge> : null}
                </div>
                {c.topic ? <CardDescription>{c.topic}</CardDescription> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={safeHref(`/campaigns/${c.id}/dashboard`) ?? "/campaigns"}>Dashboard</Link>
                </Button>
                {!c.legacy ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={safeHref(`/campaigns/${c.id}/prompts`) ?? "/campaigns"}>Review prompts</Link>
                  </Button>
                ) : null}
                <OperatorOnly role={role}>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="edit-campaign"
                    onClick={() => setEditing({ id: c.id, draft: draftFrom(c) })}
                  >
                    Edit
                  </Button>
                  {freezeBlockedByFixture(c) ? (
                    <span
                      className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950"
                      data-testid="fixture-cannot-freeze"
                    >
                      Fixture — cannot be frozen
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="freeze-prompt-set"
                      onClick={() => freeze(c)}
                      disabled={c.approved_count === 0}
                    >
                      Freeze prompt set
                    </Button>
                  )}
                  {c.status !== "archived" ? (
                    <Button size="sm" variant="ghost" data-testid="archive-campaign" onClick={() => archive(c)}>
                      Archive
                    </Button>
                  ) : null}
                </OperatorOnly>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing && editing ? (
                <div className="space-y-4">
                  <CampaignForm
                    options={options}
                    draft={editing.draft}
                    setDraft={(d) => setEditing({ id: c.id, draft: d })}
                  />
                  <div className="flex gap-2">
                    <Button onClick={save}>Save</Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid gap-4 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-uncc-ink/60">Prompts</dt>
                    <dd>
                      {c.approved_count} approved of {c.prompt_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-uncc-ink/60">Latest frozen set</dt>
                    <dd>
                      {latest ? (
                        <>
                          v{latest.version} ·{" "}
                          <span className="font-mono text-xs" title={latest.sha256 ?? ""}>
                            {latest.sha256?.slice(0, 12)}…
                          </span>
                        </>
                      ) : (
                        "none yet"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-uncc-ink/60">Engines</dt>
                    <dd className="flex flex-wrap gap-1">
                      {c.engines.length
                        ? c.engines.map((e) => (
                            <Badge key={`${e.engine}:${e.runner}`} title={runnerPlain(e.runner)}>
                              {enginePlain(e.engine)} · {runnerPlain(e.runner)}
                            </Badge>
                          ))
                        : "none"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-uncc-ink/60">Regions · personas</dt>
                    <dd>
                      {c.regions.length} regions · {c.personas.length} personas
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

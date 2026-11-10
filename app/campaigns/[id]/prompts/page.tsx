"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OperatorOnly, canMutate } from "@/components/CanAct";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { CustomPromptForm } from "@/components/prompts/CustomPromptForm";
import { GeneratePanel } from "@/components/prompts/GeneratePanel";
import { PageTitle } from "@/components/scout/primitives";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/lib/auth";
import { personaTaxonomyLabel } from "@/lib/ui/labels";

type PromptRow = {
  id: string;
  text: string;
  status: string;
  branded: boolean;
  note: string | null;
  persona_key: string | null;
  persona_name: string | null;
  doc_personas: string[];
  suggested_personas: string[];
  question_id: string | null;
  pillar: string | null;
  region: string | null;
  near_duplicate: boolean;
  provenance: string;
  intent: string | null;
  demand_evidence_label: string;
  demand_evidence_ids?: string[];
};

type Counts = {
  total: number;
  approved: number;
  neutrals: number;
  variants: number;
  branded?: number;
  unbranded?: number;
  unbrandedShare?: number;
  unbrandedWarning?: boolean;
  unbrandedWarningMessage?: string | null;
};

export default function PromptReviewPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [prompts, setPrompts] = useState<PromptRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [dedupeStatus, setDedupeStatus] = useState<"enabled" | "disabled" | null>(null);
  const [personaOpts, setPersonaOpts] = useState<Array<{ id: string; key: string | null; name: string; group: string | null }>>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pillar, setPillar] = useState("");
  const [persona, setPersona] = useState("");
  const [region, setRegion] = useState("");
  const [branded, setBranded] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [frozenSets, setFrozenSets] = useState<
    Array<{ id: string; version: number; label: string | null; frozenAt: string | null; sha256: string | null }>
  >([]);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (pillar) q.set("pillar", pillar);
    if (persona) q.set("persona", persona);
    if (region) q.set("region", region);
    if (branded) q.set("branded", branded);
    if (status) q.set("status", status);
    try {
      const [res, me, setsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/prompts?${q}`),
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch(`/api/schedules?campaign_id=${campaignId}&include=form`, { cache: "no-store" }),
      ]);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load");
        return;
      }
      const meJson = await me.json();
      setRole(meJson.user?.role ?? null);
      setError(null);
      setPrompts(json.prompts);
      setCounts(json.counts);
      setPersonaOpts(Array.isArray(json.personas) ? json.personas : []);
      setDedupeStatus(json.dedupeStatus === "enabled" || json.dedupeStatus === "disabled" ? json.dedupeStatus : null);
      if (setsRes.ok) {
        const setsJson = await setsRes.json();
        setFrozenSets(Array.isArray(setsJson.frozen_prompt_sets) ? setsJson.frozen_prompt_sets : []);
      } else {
        setFrozenSets([]);
      }
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId, pillar, persona, region, branded, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Prompts · Scout";
  }, []);

  const allSelected = useMemo(
    () => Boolean(prompts?.length) && (prompts?.every((p) => selected.has(p.id)) ?? false),
    [prompts, selected],
  );

  function toggleAll() {
    if (!prompts) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(prompts.map((p) => p.id)));
  }

  async function bulk(next: "approved" | "rejected" | "draft") {
    if (!selected.size) return;
    const res = await fetch(`/api/campaigns/${campaignId}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], status: next }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Bulk update failed");
      return;
    }
    await load();
  }

  async function saveEdit() {
    if (!editing) return;
    const res = await fetch(`/api/prompts/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editing.text }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Save failed");
      return;
    }
    setEditing(null);
    await load();
  }

  async function setOne(id: string, next: "approved" | "rejected" | "draft") {
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Update failed");
      return;
    }
    await load();
  }

  if (error && !prompts) return <ErrorState message={error} />;
  if (!prompts) return <LoadingState label="Loading prompts…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-scout-muted">
            <Link href="/campaigns" className="font-medium text-scout-brand underline">
              Campaigns
            </Link>{" "}
            · Prompts
          </p>
          <PageTitle
            title="Prompts"
            subtitle="Prompt review — a persona changes how the prompt is written, not who is logged in. Draft prefixes need content-team approval. Near-duplicates are highlighted; do not auto-delete them."
          />
        </div>
        {counts ? (
          <div className="space-y-1 text-right text-sm text-uncc-ink/70">
            <p>
              {counts.approved} approved · {counts.neutrals} neutral · {counts.variants} persona · {counts.total} total
            </p>
            {typeof counts.unbrandedShare === "number" ? (
              <p>
                Branded {counts.branded ?? 0} · unbranded {counts.unbranded ?? 0} (
                {(counts.unbrandedShare * 100).toFixed(0)}% unbranded)
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}
      {dedupeStatus === "disabled" ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dedupe disabled. Local embedding model is unavailable. Near-duplicates will not be filtered automatically.
        </p>
      ) : null}
      {counts?.unbrandedWarning ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {counts.unbrandedWarningMessage ?? "Unbranded share is below the 70% default."}
        </p>
      ) : null}

      <Card data-testid="prompt-library-export">
        <CardHeader>
          <CardTitle>Prompt library export</CardTitle>
          <CardDescription>
            Download a frozen prompt set as CSV or PDF (text, category, persona, intent, branded, provenance, demand
            evidence, author, approved by, set hash, frozen date). Viewers and editors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {frozenSets.length === 0 ? (
            <p className="text-sm text-scout-muted">No frozen prompt set yet. Freeze approved prompts before exporting.</p>
          ) : (
            <ul className="space-y-2">
              {frozenSets.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-scout-text">
                    v{s.version}
                    {s.label ? ` · ${s.label}` : ""}
                  </span>
                  <span className="text-scout-muted">
                    {s.frozenAt ? new Date(s.frozenAt).toLocaleString() : "frozen date unknown"}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/api/campaigns/${campaignId}/prompt-sets/${s.id}/library.csv`}
                      data-testid={`library-csv-${s.id}`}
                    >
                      CSV
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/api/campaigns/${campaignId}/prompt-sets/${s.id}/library.pdf`}
                      data-testid={`library-pdf-${s.id}`}
                    >
                      PDF
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Pillar, persona, region, branded, status</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label>Pillar</Label>
            <Input value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="AI / Energy / Internships" />
          </div>
          <div>
            <Label>Persona</Label>
            <Input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="neutral or undergrad…" />
          </div>
          <div>
            <Label>Region</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="NC / SOUTH / SE / NONE" />
          </div>
          <div>
            <Label>Branded</Label>
            <Input value={branded} onChange={(e) => setBranded(e.target.value)} placeholder="true / false" />
          </div>
          <div>
            <Label>Status</Label>
            <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="draft / approved / rejected" />
          </div>
        </CardContent>
      </Card>

      <OperatorOnly role={role}>
        <div className="space-y-4">
          <GeneratePanel campaignId={campaignId} personas={personaOpts} onDone={load} />
          <CustomPromptForm campaignId={campaignId} personas={personaOpts} onDone={load} />
          <div className="flex flex-wrap gap-2" data-testid="prompt-mutate-actions">
            <Button type="button" variant="outline" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
            <Button type="button" data-testid="bulk-approve" onClick={() => bulk("approved")} disabled={!selected.size}>
              Bulk approve ({selected.size})
            </Button>
            <Button type="button" variant="outline" onClick={() => bulk("rejected")} disabled={!selected.size}>
              Bulk reject
            </Button>
          </div>
        </div>
      </OperatorOnly>
      {!canMutate(role) ? (
        <p className="text-sm text-uncc-ink/60">Leadership access is read-only. Prompt approval is an Operator action.</p>
      ) : null}

      {prompts.length === 0 ? (
        <EmptyState title="No prompts for these filters">
          <p>
            {canMutate(role)
              ? "Import or generate prompts, then clear filters if needed."
              : "An Operator must import or generate prompts before results appear here."}
          </p>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-scout-border bg-scout-card shadow-scout">
          <table className="min-w-full text-left text-sm" data-testid="prompt-review-table">
            <caption className="sr-only">Campaign prompts</caption>
            <thead className="border-b border-scout-border bg-scout-page text-xs uppercase tracking-wide text-scout-muted">
              <tr>
                {canMutate(role) ? <th className="px-3 py-2" /> : null}
                <th className="px-3 py-2">QID</th>
                <th className="px-3 py-2">Text</th>
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Provenance</th>
                <th className="px-3 py-2">Evidence</th>
                <th className="px-3 py-2">Doc vs suggested</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Status</th>
                {canMutate(role) ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-uncc-rule/60 align-top ${p.near_duplicate ? "bg-amber-50" : ""}`}
                >
                  {canMutate(role) ? (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 font-mono text-xs">
                    {p.question_id}
                    {p.branded ? <Badge className="ml-1">branded</Badge> : null}
                    {p.near_duplicate ? <Badge className="ml-1">near-dupe</Badge> : null}
                  </td>
                  <td className="max-w-md px-3 py-2">
                    {editing?.id === p.id ? (
                      <textarea
                        className="w-full rounded border p-2 text-sm"
                        rows={3}
                        value={editing.text}
                        onChange={(e) => setEditing({ id: p.id, text: e.target.value })}
                      />
                    ) : (
                      p.text
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {personaTaxonomyLabel(p.persona_key, p.persona_name) ?? "neutral"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{p.provenance}</div>
                    {p.intent ? <div className="text-uncc-ink/60">{p.intent}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-uncc-ink/80">
                    {p.demand_evidence_ids && p.demand_evidence_ids.length > 0 ? (
                      <span className="flex flex-col gap-1">
                        {p.demand_evidence_ids.map((eid) => (
                          <Link
                            key={eid}
                            href={`/campaigns/${params.id}/demand#demand-signal-${eid}`}
                            className="underline"
                            data-testid={`demand-evidence-link-${eid}`}
                          >
                            Demand row {eid.slice(0, 8)}…
                          </Link>
                        ))}
                      </span>
                    ) : (
                      p.demand_evidence_label
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>doc: {p.doc_personas.join("; ") || "n/a"}</div>
                    <div>suggested: {p.suggested_personas.join("; ") || "n/a"}</div>
                  </td>
                  <td className="max-w-xs px-3 py-2 text-xs text-uncc-ink/70">{p.note ?? "n/a"}</td>
                  <td className="px-3 py-2">{p.status}</td>
                  {canMutate(role) ? (
                    <td className="space-y-1 px-3 py-2">
                      {editing?.id === p.id ? (
                        <>
                          <Button size="sm" onClick={saveEdit}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" data-testid="edit-prompt" onClick={() => setEditing({ id: p.id, text: p.text })}>
                            Edit
                          </Button>
                          <Button size="sm" data-testid="approve-prompt" onClick={() => setOne(p.id, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setOne(p.id, "rejected")}>
                            Reject
                          </Button>
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

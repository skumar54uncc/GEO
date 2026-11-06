"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
};

type Counts = { total: number; approved: number; neutrals: number; variants: number };

export default function PromptReviewPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pillar, setPillar] = useState("");
  const [persona, setPersona] = useState("");
  const [region, setRegion] = useState("");
  const [branded, setBranded] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (pillar) q.set("pillar", pillar);
    if (persona) q.set("persona", persona);
    if (region) q.set("region", region);
    if (branded) q.set("branded", branded);
    if (status) q.set("status", status);
    const res = await fetch(`/api/campaigns/${campaignId}/prompts?${q}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setError(null);
    setPrompts(json.prompts);
    setCounts(json.counts);
    setSelected(new Set());
  }, [campaignId, pillar, persona, region, branded, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(() => prompts.length > 0 && prompts.every((p) => selected.has(p.id)), [prompts, selected]);

  function toggleAll() {
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-uncc-ink/60">
            <Link href="/campaigns" className="underline">
              Campaigns
            </Link>{" "}
            / prompt review
          </p>
          <h1 className="font-serif text-2xl font-semibold text-uncc-ink">Prompt review</h1>
          <p className="mt-1 max-w-2xl text-sm text-uncc-ink/70">
            A persona changes how the prompt is written, not who is logged in. Draft prefixes need content-team approval.
            Near-duplicates are highlighted; do not auto-delete them.
          </p>
        </div>
        {counts ? (
          <p className="text-sm text-uncc-ink/70">
            {counts.approved} approved · {counts.neutrals} neutral · {counts.variants} persona · {counts.total} total
          </p>
        ) : null}
      </div>

      {error ? <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={toggleAll}>
          {allSelected ? "Clear selection" : "Select all"}
        </Button>
        <Button type="button" onClick={() => bulk("approved")} disabled={!selected.size}>
          Bulk approve ({selected.size})
        </Button>
        <Button type="button" variant="outline" onClick={() => bulk("rejected")} disabled={!selected.size}>
          Bulk reject
        </Button>
      </div>

      <div className="overflow-x-auto rounded border border-uncc-rule bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-uncc-rule bg-uncc-mist/40 text-xs uppercase tracking-wide text-uncc-ink/60">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">QID</th>
              <th className="px-3 py-2">Text</th>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Doc vs suggested</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr key={p.id} className={`border-b border-uncc-rule/60 align-top ${p.near_duplicate ? "bg-amber-50" : ""}`}>
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
                <td className="px-3 py-2 font-mono text-xs">
                  {p.question_id}
                  {p.branded ? <Badge className="ml-1">branded</Badge> : null}
                  {p.near_duplicate ? <Badge className="ml-1">near-dupe</Badge> : null}
                </td>
                <td className="max-w-md px-3 py-2">
                  {editing?.id === p.id ? (
                    <textarea className="w-full rounded border p-2 text-sm" rows={3} value={editing.text} onChange={(e) => setEditing({ id: p.id, text: e.target.value })} />
                  ) : (
                    p.text
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{p.persona_key ?? "neutral"}</td>
                <td className="px-3 py-2 text-xs">
                  <div>doc: {p.doc_personas.join("; ") || "—"}</div>
                  <div>suggested: {p.suggested_personas.join("; ") || "—"}</div>
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-uncc-ink/70">{p.note ?? "—"}</td>
                <td className="px-3 py-2">{p.status}</td>
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
                      <Button size="sm" variant="outline" onClick={() => setEditing({ id: p.id, text: p.text })}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => setOne(p.id, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setOne(p.id, "rejected")}>
                        Reject
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

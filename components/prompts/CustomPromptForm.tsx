"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { intentValues, type Intent } from "@/lib/prompts/generate";

type PersonaOpt = { id: string; key: string | null; name: string };

export function CustomPromptForm({
  campaignId,
  personas,
  onDone,
}: {
  campaignId: string;
  personas: PersonaOpt[];
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<Intent>("discovery");
  const [personaId, setPersonaId] = useState("");
  const [branded, setBranded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) {
      setError("Text is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_custom",
          text: text.trim(),
          intent,
          persona_id: personaId || null,
          branded,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setText("");
      setBranded(false);
      setOpen(false);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="add-custom-prompt">
        Add custom prompt
      </Button>
    );
  }

  return (
    <Card data-testid="custom-prompt-form">
      <CardHeader>
        <CardTitle>Add custom prompt</CardTitle>
        <CardDescription>Saved as a draft. Approve and freeze before any scan uses it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="custom-text">Text</Label>
          <textarea
            id="custom-text"
            className="mt-1 w-full rounded border border-scout-border bg-white p-2 text-sm"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="custom-prompt-text"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="custom-intent">Intent</Label>
            <select
              id="custom-intent"
              className="mt-1 w-full rounded border border-scout-border bg-white px-2 py-1.5 text-sm"
              value={intent}
              onChange={(e) => setIntent(e.target.value as Intent)}
            >
              {intentValues.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="custom-persona">Persona</Label>
            <select
              id="custom-persona"
              className="mt-1 w-full rounded border border-scout-border bg-white px-2 py-1.5 text-sm"
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
            >
              <option value="">None</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={branded} onChange={(e) => setBranded(e.target.checked)} />
              Branded
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void submit()} data-testid="custom-prompt-save">
            Save draft
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

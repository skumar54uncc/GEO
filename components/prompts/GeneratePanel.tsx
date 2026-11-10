"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { intentValues, type Intent } from "@/lib/prompts/generate";

type PersonaOpt = { id: string; key: string | null; name: string; group: string | null };

const ALL_INTENTS = [...intentValues] as Intent[];

export function GeneratePanel({
  campaignId,
  personas,
  onDone,
}: {
  campaignId: string;
  personas: PersonaOpt[];
  onDone: () => Promise<void>;
}) {
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());
  const [intents, setIntents] = useState<Set<Intent>>(new Set(ALL_INTENTS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaigns/${campaignId}/prompts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "estimate", request: {} }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setLiveConnected(Boolean(json.liveConnected ?? json.estimate?.liveConnected));
      })
      .catch(() => {
        if (!cancelled) setLiveConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function togglePersona(id: string) {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleIntent(intent: Intent) {
    setIntents((prev) => {
      const next = new Set(prev);
      if (next.has(intent)) next.delete(intent);
      else next.add(intent);
      return next;
    });
  }

  async function run(mode: "fixture" | "live") {
    if (selectedPersonas.size < 3 || selectedPersonas.size > 5) {
      setError("Pick 3 to 5 personas.");
      return;
    }
    if (!intents.size) {
      setError("Pick at least one intent.");
      return;
    }
    if (mode === "live" && !liveConnected) {
      setError("not connected");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const request = {
        personaIds: [...selectedPersonas],
        intents: [...intents],
      };
      const estRes = await fetch(`/api/campaigns/${campaignId}/prompts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "estimate", request }),
      });
      const estJson = await estRes.json();
      if (!estRes.ok) throw new Error(typeof estJson.error === "string" ? estJson.error : `HTTP ${estRes.status}`);
      const estimate = estJson.estimate;
      setLiveConnected(Boolean(estJson.liveConnected ?? estimate?.liveConnected));
      const runRes = await fetch(`/api/campaigns/${campaignId}/prompts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          request,
          useBuiltinFixture: mode === "fixture",
          useLive: mode === "live",
          approval: {
            paramsHash: estimate.paramsHash,
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        }),
      });
      const runJson = await runRes.json();
      if (!runRes.ok) throw new Error(typeof runJson.error === "string" ? runJson.error : `HTTP ${runRes.status}`);
      const similar = runJson.similar ?? runJson.dropped ?? 0;
      setMessage(
        `Added ${runJson.prompts?.length ?? 0} draft prompt(s)` +
          (similar ? ` · ${similar} marked similar to an existing prompt` : "") +
          (mode === "fixture" ? " · fixture" : " · live") +
          ". Nothing runs until approved and frozen.",
      );
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="prompt-generate-panel">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Generate prompts
          <Badge tone="gold" data-testid="fixture-label">
            fixture
          </Badge>
          {!liveConnected ? (
            <Badge tone="muted" data-testid="live-not-connected">
              not connected
            </Badge>
          ) : (
            <Badge tone="green" data-testid="live-connected">
              live connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Pick 3–5 personas and intents. Fixture pack stays available and labeled. Live generation uses Fireworks behind
          the cost guard when a key is connected (writer model ≠ judge). Results land as drafts; nothing is scanned until
          approved and frozen. Near-duplicates stay in the queue as “similar to: …”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Personas ({selectedPersonas.size} selected)</Label>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {personas.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPersonas.has(p.id)}
                    onChange={() => togglePersona(p.id)}
                    data-testid={`gen-persona-${p.key ?? p.id}`}
                  />
                  {p.name}
                  {p.group ? <span className="text-xs text-uncc-ink/50">({p.group})</span> : null}
                </label>
              </li>
            ))}
          </ul>
          {personas.length === 0 ? <p className="mt-1 text-sm text-uncc-ink/60">No personas available.</p> : null}
        </div>
        <div>
          <Label>Intents</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {ALL_INTENTS.map((intent) => (
              <label key={intent} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={intents.has(intent)} onChange={() => toggleIntent(intent)} />
                {intent}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void run("fixture")} data-testid="prompt-generate-run">
            {busy ? "Generating…" : "Run generation (fixture)"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !liveConnected}
            onClick={() => void run("live")}
            data-testid="prompt-generate-live"
            title={liveConnected ? "Run live Fireworks writer" : "not connected"}
          >
            {liveConnected ? "Run live generation" : "not connected"}
          </Button>
        </div>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        {message ? <p className="text-sm text-uncc-green">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

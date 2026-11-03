"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Message, SafeLink } from "@/components/site/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type RouteOpt = { engine: string; runner: string; provider: string; fidelity: string; role: string };
type Options = {
  campaign: { id: string; name: string };
  prompts: Array<{ id: string; seq: number; text: string; status: string }>;
  regions: Array<{ id: string; label: string }>;
  default_region_id: string;
  routes: RouteOpt[];
  recent: Array<{ id: string; engine: string; runner: string; provider: string; status: string; capturedAt: string; costUsd: string | null }>;
};
type Estimate = { usd: number | null; units: number; note: string | null; missing_config: string[]; fidelity: string; experimental: boolean };
type Draw = {
  id: string;
  engine: string;
  runner: string;
  provider: string;
  fidelity: string;
  modelBuild: string;
  regionHonored: string;
  status: string;
  answerText: string;
  costUsd: string | null;
  latencyMs: number | null;
  capturedAt: string;
  error: string | null;
  experimental: boolean;
  raw_payload: string | null;
  citations: Array<{ id: string; url: string; domain: string; position: number | null; linked: boolean | null; sourceClass: string; title: string | null }>;
  fanout_queries: string[];
};

const routeKey = (r: { engine: string; runner: string; provider: string }) => `${r.engine}|${r.runner}|${r.provider}`;
const select = "h-9 w-full rounded border border-uncc-rule bg-white px-2 text-sm";

export default function CaptureTestPage() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [promptId, setPromptId] = useState("");
  const [route, setRoute] = useState("");
  const [regionId, setRegionId] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = async () => {
    const o = await api<Options>("/api/capture/test");
    setOpts(o);
    setPromptId((p) => p || o.prompts[0]?.id || "");
    setRoute((r) => r || (o.routes[0] ? routeKey(o.routes[0]) : ""));
    setRegionId((r) => r || o.default_region_id || o.regions[0]?.id || "");
  };

  useEffect(() => {
    void load().catch((err) => setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) }));
  }, []);

  useEffect(() => setEstimate(null), [promptId, route, regionId]);

  const body = useMemo(() => {
    const [engine, runner, provider] = route.split("|");
    return { campaign_id: opts?.campaign.id, prompt_id: promptId, region_id: regionId, engine, runner, provider };
  }, [opts, promptId, route, regionId]);

  const doEstimate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ estimate: Estimate }>("/api/capture/test", { method: "POST", body: JSON.stringify(body) });
      setEstimate(r.estimate);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const doRun = async () => {
    if (!estimate) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ draw: Draw | null }>("/api/capture/test", { method: "POST", body: JSON.stringify({ ...body, approved_usd: estimate.usd }) });
      setDraw(r.draw);
      setEstimate(null);
      await load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const openDraw = async (id: string) => {
    try {
      setDraw((await api<{ draw: Draw }>(`/api/capture/test?draw_id=${id}`)).draw);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const blocked = estimate && (estimate.missing_config.length > 0 || estimate.usd === null);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-1">
        <h2 className="font-serif text-2xl font-semibold text-uncc-ink">Capture test</h2>
        <p className="text-sm leading-6 text-uncc-ink/75">
          One draw from one engine through one provider. You see the estimate first; a paid call runs only after you approve that exact amount. The raw
          provider payload is stored unchanged. A test draw is not part of any scan series.
        </p>
      </div>
      <Message msg={msg} />
      {opts ? (
        <Card>
          <CardHeader>
            <CardTitle>{opts.campaign.name}</CardTitle>
            <CardDescription>Routes are the approved providers per engine. Fidelity: UI, SERP and manual are high; API with search is medium; API without browsing is low.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            <div className="space-y-1 md:col-span-3">
              <Label htmlFor="ct-prompt">Prompt</Label>
              <select id="ct-prompt" className={select} value={promptId} onChange={(e) => setPromptId(e.target.value)}>
                {opts.prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.seq} {p.text}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="ct-route">Engine and route</Label>
              <select id="ct-route" className={select} value={route} onChange={(e) => setRoute(e.target.value)}>
                {opts.routes.map((r) => (
                  <option key={routeKey(r)} value={routeKey(r)}>
                    {r.engine} via {r.provider} ({r.runner}, {r.role}, {r.fidelity} fidelity)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-region">Region</Label>
              <select id="ct-region" className={select} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                {opts.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-3">
              <Button variant="outline" onClick={doEstimate} disabled={busy || !promptId || !route || !regionId}>
                Estimate
              </Button>
              {estimate ? (
                <>
                  <span>
                    Estimate: {estimate.usd === null ? "unknown price" : `$${estimate.usd.toFixed(4)}`}
                    {estimate.units ? `, provider units: ${estimate.units}` : ""}
                    {estimate.note ? ` (${estimate.note})` : ""}
                  </span>
                  {estimate.experimental ? <Badge tone="gold">experimental</Badge> : null}
                  {estimate.missing_config.length ? <Badge tone="gold">missing {estimate.missing_config.join(", ")}</Badge> : null}
                  <Button onClick={doRun} disabled={busy || Boolean(blocked)}>
                    {busy ? "Running…" : `Approve and run${estimate.usd !== null ? ` ($${estimate.usd.toFixed(4)})` : ""}`}
                  </Button>
                </>
              ) : null}
            </div>
            {blocked ? (
              <p className="text-xs text-uncc-ink/70 md:col-span-3">
                This route cannot run: {estimate?.missing_config.length ? "add the missing settings to .env.local and restart the server" : "its price is unknown, so the cost guard refuses it"}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {draw ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {draw.engine} via {draw.provider}
              <Badge tone={draw.status === "ok" ? "green" : "gold"}>{draw.status}</Badge>
              <Badge>{draw.runner}</Badge>
              <Badge>{draw.fidelity} fidelity</Badge>
              {draw.experimental ? <Badge tone="gold">experimental</Badge> : null}
            </CardTitle>
            <CardDescription>
              Model build: {draw.modelBuild}. Region honored: {draw.regionHonored}. Cost: {draw.costUsd === null ? "unknown" : `$${Number(draw.costUsd).toFixed(4)}`}. Latency:{" "}
              {draw.latencyMs === null ? "unknown" : `${(draw.latencyMs / 1000).toFixed(1)} s`}. Captured {new Date(draw.capturedAt).toLocaleString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {draw.error ? <p className="text-red-700">Error: {draw.error}</p> : null}
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">Answer text</h3>
              <p className="whitespace-pre-wrap rounded border border-uncc-rule bg-uncc-paper p-3">{draw.answerText || "(empty)"}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">Citations ({draw.citations.length})</h3>
              {draw.citations.length ? (
                <table className="w-full text-left">
                  <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                    <tr>
                      <th className="py-1">#</th>
                      <th>Domain</th>
                      <th>Class</th>
                      <th>Linked</th>
                      <th>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draw.citations.map((c) => (
                      <tr key={c.id} className="border-t border-uncc-rule/60 align-top">
                        <td className="py-1">{c.position ?? ""}</td>
                        <td>{c.domain}</td>
                        <td>{c.sourceClass.replace(/_/g, " ")}</td>
                        <td>{c.linked === null ? "unknown" : c.linked ? "yes" : "no"}</td>
                        <td>
                          <SafeLink href={c.url}>{c.title || c.url}</SafeLink>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-uncc-ink/60">None returned.</p>
              )}
            </div>
            {draw.fanout_queries.length ? (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">Search queries the engine reported</h3>
                <ul className="list-disc pl-5">
                  {draw.fanout_queries.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <details>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-uncc-ink/60">Raw provider payload</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-uncc-rule bg-white p-3 text-xs">{draw.raw_payload ?? "(none stored)"}</pre>
            </details>
          </CardContent>
        </Card>
      ) : null}

      {opts?.recent.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent test draws</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                <tr>
                  <th className="py-1">Captured</th>
                  <th>Engine</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {opts.recent.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-t border-uncc-rule/60 hover:bg-uncc-paper" onClick={() => void openDraw(d.id)}>
                    <td className="py-1">{new Date(d.capturedAt).toLocaleString()}</td>
                    <td>
                      {d.engine} ({d.runner})
                    </td>
                    <td>{d.provider}</td>
                    <td>{d.status}</td>
                    <td className="text-right">{d.costUsd === null ? "unknown" : `$${Number(d.costUsd).toFixed(4)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

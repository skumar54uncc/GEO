"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Message } from "@/components/site/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Canary = { ok: boolean; reason: string | null; at: string } | null;
type Provider = {
  provider: string;
  missing_config: string[];
  routes: Array<{ engine: string; runner: string; fidelity: string; role: string; last_canary: Canary }>;
  account: { monthly_budget_usd: string | null; per_scan_cap_usd: string | null; credits_remaining: number | null; per_run_cap_units: number | null; credit_unit_usd: string | null } | null;
  ledger_month: { usd: number; calls: number; calls_with_unknown_usd: number; since: string };
  parity: { passed: boolean; fresh: boolean; date: string | null; reason: string | null; path: string } | null;
};

const usd = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === "") return "none";
  const n = Number(v);
  return `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;
};

function CanaryBadge({ c }: { c: Canary }) {
  if (!c) return <span className="text-xs text-uncc-ink/50">never run</span>;
  return (
    <span title={c.reason ?? ""}>
      <Badge tone={c.ok ? "green" : "gold"}>{c.ok ? "ok" : "failed"}</Badge> <span className="text-xs text-uncc-ink/60">{new Date(c.at).toLocaleString()}</span>
    </span>
  );
}

function LimitEditor({ p, onSaved }: { p: Provider; onSaved: (msg: string, ok: boolean) => void }) {
  const [budget, setBudget] = useState(p.account?.monthly_budget_usd ?? "");
  const [cap, setCap] = useState(p.account?.per_scan_cap_usd ?? "");
  const [unit, setUnit] = useState(p.account?.credit_unit_usd ?? "");
  const save = async () => {
    try {
      await api("/api/providers", { method: "PATCH", body: JSON.stringify({ provider: p.provider, monthly_budget_usd: budget, per_scan_cap_usd: cap, credit_unit_usd: unit }) });
      onSaved(`${p.provider} limits saved.`, true);
    } catch (err) {
      onSaved(err instanceof Error ? err.message : String(err), false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="space-y-1">
        <span className="block text-uncc-ink/60">Monthly budget USD</span>
        <Input className="h-8 w-24" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="block text-uncc-ink/60">Per scan cap USD</span>
        <Input className="h-8 w-24" value={cap} onChange={(e) => setCap(e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="block text-uncc-ink/60">USD per credit</span>
        <Input className="h-8 w-24" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </label>
      <Button size="sm" variant="outline" onClick={save}>
        Save
      </Button>
    </div>
  );
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [me, setMe] = useState<{ role: string } | null>(null);

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([api<{ providers: Provider[] }>("/api/providers"), api<{ user: { role: string } | null }>("/api/auth/me")]);
    setProviders(p.providers);
    setMe(m.user);
  }, []);

  useEffect(() => {
    void load().catch((err) => setMsg({ tone: "error", text: String(err) }));
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-1">
        <h2 className="font-serif text-2xl font-semibold text-uncc-ink">Capture providers</h2>
        <p className="text-sm leading-6 text-uncc-ink/75">
          Which provider captures each engine, whether its keys are set, the last canary, and spend this month from the cost ledger. Keys are read from{" "}
          <code>.env.local</code> and are never shown here. UI, SERP and manual series are high fidelity; API with search is medium; API without browsing is
          low. These series are never averaged together.
        </p>
      </div>
      <Message msg={msg} />
      {providers?.map((p) => (
        <Card key={p.provider}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {p.provider}
              {p.missing_config.length ? <Badge tone="gold">missing {p.missing_config.join(", ")}</Badge> : <Badge tone="green">configured</Badge>}
              {p.parity ? <Badge tone={p.parity.passed && p.parity.fresh ? "green" : "muted"}>{p.parity.passed && p.parity.fresh ? `parity passed ${p.parity.date}` : "experimental"}</Badge> : null}
            </CardTitle>
            <CardDescription>
              Spent this month: {usd(p.ledger_month.usd)} over {p.ledger_month.calls} ledger rows
              {p.ledger_month.calls_with_unknown_usd ? `, ${p.ledger_month.calls_with_unknown_usd} with unknown cost` : ""}. Monthly budget: {usd(p.account?.monthly_budget_usd)}. Per scan cap:{" "}
              {usd(p.account?.per_scan_cap_usd)}.
              {p.account?.credits_remaining !== null && p.account?.credits_remaining !== undefined ? ` Credits remaining: ${p.account.credits_remaining}.` : ""}
              {p.parity && p.parity.reason ? ` ${p.parity.reason}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                <tr>
                  <th className="py-1">Engine</th>
                  <th>Runner</th>
                  <th>Role</th>
                  <th>Fidelity</th>
                  <th>Last canary</th>
                </tr>
              </thead>
              <tbody>
                {p.routes.map((r) => (
                  <tr key={`${r.engine}-${r.runner}`} className="border-t border-uncc-rule/60">
                    <td className="py-1 font-medium">{r.engine}</td>
                    <td>{r.runner}</td>
                    <td>{r.role}</td>
                    <td>{r.fidelity}</td>
                    <td>
                      <CanaryBadge c={r.last_canary} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {me?.role === "admin" ? (
              <LimitEditor
                p={p}
                onSaved={(text, ok) => {
                  setMsg({ tone: ok ? "ok" : "error", text });
                  if (ok) void load();
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { canMutate } from "@/lib/ui/rbac";
import type { Role } from "@/lib/auth/roles";

type Campaign = { id: string; name: string };
type FrozenSet = { id: string; version: number; label: string | null; frozenAt: string | null; sha256: string | null };
type ScheduleRow = {
  id: string;
  campaignId: string;
  promptSetId: string;
  cadence: "biweekly" | "monthly" | "manual";
  nextRunAt: string | null;
  next_run_ny: string | null;
  budgetCapUsd: string | null;
  enabled: boolean;
  monthly_projection_usd: number | null;
};
type Preview = {
  perRunUsd: number | null;
  monthlyProjectionUsd: number | null;
  cadence: "biweekly" | "monthly";
  estimate: {
    totalUsd: number | null;
    refusals: string[];
    totalDraws: number;
    regionCount?: number;
    usdPerRegion?: number | null;
  };
  providerCaps: Array<{
    provider: string;
    monthlyBudgetUsd: number | null;
    perScanCapUsd: number | null;
    exceedsMonthlyCap: boolean | null;
    exceedsPerScanCap: boolean | null;
  }>;
};

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "unknown";
  return `$${n.toFixed(2)}`;
}

export function SchedulesPanel({ role }: { role: Role | null | undefined }) {
  const editor = canMutate(role);
  const isAdmin = role === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [frozenSets, setFrozenSets] = useState<FrozenSet[]>([]);
  const [promptSetId, setPromptSetId] = useState("");
  const [cadence, setCadence] = useState<"biweekly" | "monthly">("biweekly");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [estimateApproved, setEstimateApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const list = (json.campaigns ?? []) as Campaign[];
    setCampaigns(list);
    if (!campaignId && list[0]) setCampaignId(list[0].id);
  }, [campaignId]);

  const loadSchedules = useCallback(async (cid: string) => {
    if (!cid) {
      setSchedules([]);
      setFrozenSets([]);
      return;
    }
    const res = await fetch(`/api/schedules?campaign_id=${cid}&include=form`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    setSchedules(json.schedules ?? []);
    setFrozenSets(json.frozen_prompt_sets ?? []);
  }, []);

  useEffect(() => {
    void loadCampaigns().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [loadCampaigns]);

  useEffect(() => {
    if (!campaignId) return;
    setPromptSetId("");
    setPreview(null);
    setEstimateApproved(false);
    void loadSchedules(campaignId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [campaignId, loadSchedules]);

  useEffect(() => {
    if (promptSetId && !frozenSets.some((s) => s.id === promptSetId)) setPromptSetId("");
    if (!promptSetId && frozenSets[0]) setPromptSetId(frozenSets[0].id);
  }, [frozenSets, promptSetId]);

  async function runEstimate() {
    if (!campaignId || !promptSetId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setEstimateApproved(false);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estimate",
          campaign_id: campaignId,
          prompt_set_id: promptSetId,
          cadence,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPreview(json.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!preview || !estimateApproved) {
      setError("Estimate the run and approve the estimate before creating a schedule.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          prompt_set_id: promptSetId,
          cadence,
          budget_cap_usd: preview.perRunUsd,
          estimate_approved: true,
          approved_estimate_usd: preview.perRunUsd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage("Schedule created. Next run will not spend until the worker tick and cost guard allow it.");
      setPreview(null);
      setEstimateApproved(false);
      await loadSchedules(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await loadSchedules(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this schedule? Past scans stay; future runs stop.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await loadSchedules(campaignId);
      setMessage("Schedule deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pauseAll() {
    if (!window.confirm("Pause every schedule in this organization?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause_all" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage(`Paused ${json.paused ?? 0} schedule(s).`);
      if (campaignId) await loadSchedules(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="schedules-panel">
      <h2 id="schedules-title" className="font-serif text-xl font-semibold">
        Schedules
      </h2>
      <p className="mt-2 text-sm text-uncc-ink/75">
        Biweekly or monthly scans locked to a frozen prompt set. Next run times are America/New_York. Creating a
        schedule requires an explicit estimate approval — no schedule auto-runs a paid scan without it.
      </p>

      {!editor ? (
        <p className="mt-3 text-sm text-uncc-ink/60">Leadership access is read-only. Ask an editor to change schedules.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-uncc-ink/60">Campaign</span>
          <select
            className="mt-1 rounded border border-scout-border bg-white px-2 py-1.5"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            data-testid="schedule-campaign"
          >
            {campaigns.length === 0 ? <option value="">No campaigns</option> : null}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void pauseAll()}
            data-testid="schedule-pause-all"
          >
            Pause all schedules
          </Button>
        ) : null}
      </div>

      {schedules.length === 0 ? (
        <p className="mt-4 text-sm text-uncc-ink/60">No schedules for this campaign yet.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm" data-testid="schedules-table">
          <caption className="sr-only">Scheduled scans for the selected campaign</caption>
          <thead className="bg-scout-page text-xs uppercase text-scout-muted">
            <tr>
              <th className="py-1 pr-2">Cadence</th>
              <th className="pr-2">Next run (ET)</th>
              <th className="pr-2">Per-run cap</th>
              <th className="pr-2">Monthly projection</th>
              <th className="pr-2">Status</th>
              {editor ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="border-t border-uncc-rule/60" data-testid="schedule-row">
                <td className="py-1.5 pr-2">{s.cadence}</td>
                <td className="pr-2">{s.next_run_ny ?? "—"}</td>
                <td className="pr-2">{s.budgetCapUsd == null ? "none" : money(Number(s.budgetCapUsd))}</td>
                <td className="pr-2">{money(s.monthly_projection_usd)}</td>
                <td className="pr-2">
                  <Badge tone={s.enabled ? "green" : "muted"}>{s.enabled ? "Active" : "Paused"}</Badge>
                </td>
                {editor ? (
                  <td className="space-x-2 py-1.5">
                    {s.enabled ? (
                      <button
                        type="button"
                        className="underline"
                        disabled={busy}
                        onClick={() => void patch(s.id, { enabled: false })}
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="underline"
                        disabled={busy}
                        onClick={() => void patch(s.id, { enabled: true })}
                      >
                        Resume
                      </button>
                    )}
                    <button type="button" className="underline text-red-800" disabled={busy} onClick={() => void remove(s.id)}>
                      Delete
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editor ? (
        <div className="mt-6 space-y-3 rounded border border-scout-border bg-scout-page/40 p-4" data-testid="schedule-create">
          <h3 className="font-serif text-lg font-semibold">Create schedule</h3>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-uncc-ink/60">Frozen prompt set</span>
              <select
                className="mt-1 min-w-[14rem] rounded border border-scout-border bg-white px-2 py-1.5"
                value={promptSetId}
                onChange={(e) => {
                  setPromptSetId(e.target.value);
                  setPreview(null);
                  setEstimateApproved(false);
                }}
                data-testid="schedule-prompt-set"
              >
                {frozenSets.length === 0 ? <option value="">No frozen sets</option> : null}
                {frozenSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label ? `${s.label} · ` : ""}v{s.version}
                    {s.sha256 ? ` · ${s.sha256.slice(0, 8)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-uncc-ink/60">Cadence</span>
              <select
                className="mt-1 rounded border border-scout-border bg-white px-2 py-1.5"
                value={cadence}
                onChange={(e) => {
                  setCadence(e.target.value as "biweekly" | "monthly");
                  setPreview(null);
                  setEstimateApproved(false);
                }}
                data-testid="schedule-cadence"
              >
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy || !promptSetId} onClick={() => void runEstimate()}>
              Estimate per-run cost
            </Button>
          </div>

          {preview ? (
            <div className="space-y-2 text-sm" data-testid="schedule-estimate">
              <p>
                Per-run estimate: <strong>{money(preview.perRunUsd)}</strong> · Monthly projection:{" "}
                <strong>{money(preview.monthlyProjectionUsd)}</strong> · Draws: {preview.estimate.totalDraws}
                {preview.estimate.regionCount != null ? (
                  <>
                    {" "}
                    · Regions: {preview.estimate.regionCount} · Cost per region:{" "}
                    <strong>{money(preview.estimate.usdPerRegion)}</strong>
                  </>
                ) : null}
              </p>
              {preview.estimate.refusals.length ? (
                <p className="text-red-800">Refusals: {preview.estimate.refusals.join("; ")}</p>
              ) : null}
              {preview.providerCaps.length ? (
                <ul className="list-disc pl-5 text-xs text-uncc-ink/70">
                  {preview.providerCaps.map((p) => (
                    <li key={p.provider}>
                      {p.provider}: monthly cap {money(p.monthlyBudgetUsd)}, per-scan cap {money(p.perScanCapUsd)}
                      {p.exceedsMonthlyCap ? " · exceeds monthly" : ""}
                      {p.exceedsPerScanCap ? " · exceeds per-scan" : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={estimateApproved}
                  onChange={(e) => setEstimateApproved(e.target.checked)}
                  data-testid="schedule-estimate-approve"
                />
                I approve this estimate. Create the schedule only after this box is checked.
              </label>
              <Button
                type="button"
                size="sm"
                disabled={busy || !estimateApproved || preview.estimate.refusals.length > 0}
                onClick={() => void create()}
                data-testid="schedule-create-submit"
              >
                Create schedule
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-uncc-green">{message}</p> : null}
    </div>
  );
}

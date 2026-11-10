"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { SchedulesPanel } from "@/components/settings/SchedulesPanel";
import { PageTitle, ScoutCard } from "@/components/scout/primitives";
import { Badge } from "@/components/ui/card";
import type { Role } from "@/lib/auth";

type ProviderRow = {
  provider: string;
  status?: string;
  routes?: string[];
  monthlyBudgetUsd?: number | null;
  perScanCapUsd?: number | null;
  spentThisMonthUsd?: number | null;
  creditsRemaining?: number | null;
  missingKeys?: string[];
};

type Me = {
  user: { email: string; name: string | null; role: Role } | null;
  organizations: Array<{ id: string; name: string; role: Role; isDemo: boolean }>;
  activeOrganization: { id: string; name: string; role: Role; isDemo: boolean };
};

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminHome, setAdminHome] = useState<"overview" | "visibility">("overview");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [meRes, provRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      if (!meRes.ok) throw new Error(meJson.error ?? `HTTP ${meRes.status}`);
      setMe(meJson);
      const provJson = await provRes.json();
      if (!provRes.ok) throw new Error(provJson.error ?? `HTTP ${provRes.status}`);
      setProviders(provJson.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = "Settings · Scout";
  }, []);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("scout_admin_home");
      if (v === "visibility" || v === "overview") setAdminHome(v);
    } catch {
      /* ignore */
    }
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!me || !providers) return <LoadingState label="Loading settings…" />;

  const audience = me.user?.role === "viewer" ? "Leadership" : "Operator";

  return (
    <div className="space-y-6">
      <header>
        <PageTitle
          title="Settings"
          subtitle={`Platform settings — providers, budgets, schedules, evaluation quality, and users. Signed in as ${audience} (${me.user?.role}).`}
        />
      </header>

      {me.user?.role === "admin" ? (
        <ScoutCard data-testid="admin-home-preference">
          <h2 className="font-serif text-xl font-semibold">Default home after sign-in</h2>
          <p className="mt-1 text-sm text-scout-muted">
            Viewers land on Overview. Editors land on Visibility. Admins can choose.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`min-h-11 rounded border px-3 py-2 text-sm ${
                adminHome === "overview" ? "border-scout-brand bg-scout-page" : "border-scout-border"
              }`}
              onClick={() => {
                setAdminHome("overview");
                try {
                  window.localStorage.setItem("scout_admin_home", "overview");
                } catch {
                  /* ignore */
                }
              }}
            >
              Overview
            </button>
            <button
              type="button"
              className={`min-h-11 rounded border px-3 py-2 text-sm ${
                adminHome === "visibility" ? "border-scout-brand bg-scout-page" : "border-scout-border"
              }`}
              onClick={() => {
                setAdminHome("visibility");
                try {
                  window.localStorage.setItem("scout_admin_home", "visibility");
                } catch {
                  /* ignore */
                }
              }}
            >
              Visibility
            </button>
          </div>
        </ScoutCard>
      ) : null}

      <ScoutCard>
        <h2 id="tokens-title" className="font-serif text-xl font-semibold">
          API tokens
        </h2>
        <p className="mt-2 text-sm text-scout-muted">Deferred. The local pilot does not need them.</p>
      </ScoutCard>

      <ScoutCard>
        <h2 id="providers-title" className="font-serif text-xl font-semibold">
          Providers
        </h2>
        <p className="mt-1 text-sm text-uncc-ink/70">
          Connection state and caps. Secret values are never shown.{" "}
          <Link href="/settings/providers" className="font-medium text-scout-brand underline">
            Provider detail
          </Link>
        </p>
        {providers.length === 0 ? (
          <EmptyState title="No provider accounts yet">
            <p>Provider rows appear after accounts are configured for this organization.</p>
          </EmptyState>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Provider connection status</caption>
            <thead className="bg-scout-page text-xs uppercase text-scout-muted">
              <tr>
                <th className="py-1">Provider</th>
                <th>Status</th>
                <th>Monthly cap</th>
                <th>Spent this month</th>
                <th>Missing keys</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider} className="border-t border-uncc-rule/60">
                  <td className="py-1.5">{p.provider}</td>
                  <td>{p.status ?? "unknown"}</td>
                  <td>{p.monthlyBudgetUsd == null ? "unknown" : `$${p.monthlyBudgetUsd}`}</td>
                  <td>{p.spentThisMonthUsd == null ? "unknown" : `$${p.spentThisMonthUsd}`}</td>
                  <td>{p.missingKeys?.length ? p.missingKeys.join(", ") : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScoutCard>

      <ScoutCard>
        <h2 id="demand-title" className="font-serif text-xl font-semibold">
          Demand sources
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Trends, Search Console, PAA, autocomplete, Exa, keywords, and LLM Mentions. Missing keys show as not connected.
        </p>
        <Link href="/settings/demand" className="mt-4 inline-block font-medium text-scout-brand underline">
          View demand connection status
        </Link>
      </ScoutCard>

      <ScoutCard>
        <h2 id="budget-title" className="font-serif text-xl font-semibold">
          Budgets &amp; funding
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Pilot and steady-state estimates, spend, caps, and stop-loss live on the Budget page.
        </p>
        <Link href="/budget" className="mt-4 inline-block font-medium text-scout-brand underline" data-testid="settings-budget-link">
          Open Budget &amp; Funding
        </Link>
      </ScoutCard>

      <ScoutCard>
        <SchedulesPanel role={me.user?.role ?? me.activeOrganization.role} />
      </ScoutCard>

      <ScoutCard>
        <h2 id="users-title" className="font-serif text-xl font-semibold">
          Users &amp; roles
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          You: {me.user?.name || me.user?.email} · {audience} ({me.user?.role}). Organizations you can access:
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {me.organizations.map((o) => (
            <li key={o.id}>
              {o.name} · {o.role === "viewer" ? "Leadership" : "Operator"} ({o.role})
              {o.isDemo ? (
                <Badge tone="gold" className="ml-2">
                  Demo
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
        {me.user?.role === "viewer" ? (
          <p className="mt-3 text-sm text-uncc-ink/60">Leadership access is read-only. User management is an admin action.</p>
        ) : null}
      </ScoutCard>

      <ScoutCard>
        <h2 id="eval-title" className="font-serif text-xl font-semibold">
          Evaluation quality
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Judge agreement scores against the gold set will appear here after evaluation runs. See docs/EVALS.md.
        </p>
        <Link href="/settings/gold-labels" className="mt-4 inline-block font-medium text-scout-brand underline">
          Pull gold-label sample (50 random draws)
        </Link>
      </ScoutCard>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
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

  if (error) return <ErrorState message={error} />;
  if (!me || !providers) return <LoadingState label="Loading settings…" />;

  const audience = me.user?.role === "viewer" ? "Leadership" : "Operator";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Settings</p>
        <h1 className="font-serif text-3xl font-semibold">Platform settings</h1>
        <p className="mt-2 max-w-2xl text-uncc-ink/75">
          Providers, budgets, schedules, evaluation quality, and users. Signed in as {audience} ({me.user?.role}).
        </p>
      </header>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="tokens-title">
        <h2 id="tokens-title" className="font-serif text-xl font-semibold">
          API tokens
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">Deferred — the local pilot does not need them.</p>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="providers-title">
        <h2 id="providers-title" className="font-serif text-xl font-semibold">
          Providers
        </h2>
        <p className="mt-1 text-sm text-uncc-ink/70">
          Connection state and caps. Secret values are never shown.{" "}
          <Link href="/settings/providers" className="text-uncc-green underline">
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
            <thead className="text-xs uppercase text-uncc-ink/60">
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
      </section>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="demand-title">
        <h2 id="demand-title" className="font-serif text-xl font-semibold">
          Demand sources
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Trends, Search Console, PAA, autocomplete, Exa, keywords, and LLM Mentions. Missing keys show as not connected.
        </p>
        <Link href="/settings/demand" className="mt-4 inline-block text-uncc-green underline">
          View demand connection status
        </Link>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="budget-title">
        <h2 id="budget-title" className="font-serif text-xl font-semibold">
          Budgets &amp; funding
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Pilot and steady-state estimates, spend, caps, and stop-loss live on the Budget page.
        </p>
        <Link href="/budget" className="mt-4 inline-block text-uncc-green underline" data-testid="settings-budget-link">
          Open Budget &amp; Funding
        </Link>
      </section>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="users-title">
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
      </section>

      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="eval-title">
        <h2 id="eval-title" className="font-serif text-xl font-semibold">
          Evaluation quality
        </h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          Judge agreement scores against the gold set will appear here after evaluation runs. See docs/EVALS.md.
        </p>
      </section>
    </div>
  );
}

"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import type { OrganizationAccess, SessionUser } from "@/lib/auth";

type SessionState = {
  user: SessionUser;
  organizations: OrganizationAccess[];
  activeOrganization: OrganizationAccess;
};

type CampaignOption = { id: string; name: string; status: string };

const WORKSPACE_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/sites", label: "Site Audit" },
  { href: "/budget", label: "Budget" },
  { href: "/settings", label: "Settings" },
] as const;

const LEGACY_OPERATOR_PREFIXES = [
  "/capture",
  "/serpapi",
  "/config",
  "/analyze",
  "/recommend",
  "/bots",
  "/demand",
  "/legacy",
  "/settings/providers",
  "/settings/demand",
] as const;

function campaignLinks(campaignId: string) {
  return [
    { href: `/campaigns/${campaignId}/prompts`, label: "Prompts" },
    { href: `/campaigns/${campaignId}/answers`, label: "Answers" },
    { href: `/campaigns/${campaignId}/citations`, label: "Citations" },
    { href: `/campaigns/${campaignId}/gaps`, label: "Gaps" },
    { href: `/campaigns/${campaignId}/strategy`, label: "Strategy" },
    { href: `/campaigns/${campaignId}/dashboard`, label: "Dashboard" },
  ] as const;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/overview";
  // Campaigns list only — not /campaigns/:id/*
  if (href === "/campaigns") return pathname === "/campaigns";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function campaignIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/campaigns\/([0-9a-f-]{36})(?:\/|$)/i);
  return m?.[1] ?? null;
}

function isLegacyOperatorPath(pathname: string): boolean {
  return LEGACY_OPERATOR_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [session, setSession] = useState<SessionState | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(pathname !== "/login");
  const pathCampaignId = campaignIdFromPath(pathname) ?? params.id ?? null;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(pathCampaignId);

  useEffect(() => {
    setSelectedCampaignId(pathCampaignId);
  }, [pathCampaignId]);

  useEffect(() => {
    if (pathname === "/login") return;
    setLoading(true);
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace(`/login?expired=1&next=${encodeURIComponent(pathname)}`);
          return null;
        }
        if (!res.ok) throw new Error("Unable to load session.");
        return (await res.json()) as SessionState;
      })
      .then(async (state) => {
        setSession(state);
        if (state) {
          if (state.user.role === "viewer" && isLegacyOperatorPath(pathname)) {
            router.replace("/");
            return;
          }
          const list = await fetch("/api/campaigns", { cache: "no-store" }).then((r) => r.json());
          const opts = ((list.campaigns ?? []) as Array<{ id: string; name: string; status: string }>).map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
          }));
          setCampaigns(opts);
          if (!pathCampaignId && !selectedCampaignId) {
            const firstActive = opts.find((c) => c.status === "active") ?? opts[0];
            if (firstActive) setSelectedCampaignId(firstActive.id);
          }
        }
      })
      .finally(() => setLoading(false));
    // intentionally omit selectedCampaignId to avoid re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, pathCampaignId]);

  if (pathname === "/login") {
    return (
      <main id="main-content" className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    );
  }

  async function switchOrganization(organizationId: string) {
    const res = await fetch("/api/auth/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (res.ok) window.location.assign("/");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function onCampaignChange(id: string) {
    setSelectedCampaignId(id || null);
    if (!id) {
      router.push("/campaigns");
      return;
    }
    if (pathname.includes("/prompts")) router.push(`/campaigns/${id}/prompts`);
    else if (pathname.includes("/answers")) router.push(`/campaigns/${id}/answers`);
    else if (pathname.includes("/citations")) router.push(`/campaigns/${id}/citations`);
    else if (pathname.includes("/gaps")) router.push(`/campaigns/${id}/gaps`);
    else if (pathname.includes("/strategy")) router.push(`/campaigns/${id}/strategy`);
    else router.push(`/campaigns/${id}/dashboard`);
  }

  if (loading || !session) {
    return (
      <main id="main-content" className="mx-auto max-w-7xl px-6 py-8" aria-live="polite">
        Loading your organization…
      </main>
    );
  }

  const { activeOrganization, organizations, user } = session;
  const themeStyle = {
    "--org-primary": activeOrganization.theme.primary,
    "--org-accent": activeOrganization.theme.accent,
    "--font-sans": activeOrganization.theme.sansFont,
    "--font-serif": activeOrganization.theme.serifFont,
  } as CSSProperties;
  const audience = user.role === "viewer" ? "Leadership" : "Operator";
  const links = selectedCampaignId ? campaignLinks(selectedCampaignId) : [];

  return (
    <div className="min-h-screen" style={themeStyle}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="global-header">
        <Link href="/" className="product-name">
          GEO
        </Link>
        <label className="context-control">
          <span>Organization</span>
          <select value={activeOrganization.id} onChange={(event) => switchOrganization(event.target.value)}>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
                {organization.isDemo ? " — Demo" : ""} · {organization.role}
              </option>
            ))}
          </select>
        </label>
        <label className="context-control" aria-label="Campaign context">
          <span>Campaign</span>
          <select
            value={selectedCampaignId ?? ""}
            onChange={(e) => onCampaignChange(e.target.value)}
            data-testid="campaign-switcher"
          >
            {!selectedCampaignId ? <option value="">Select campaign</option> : null}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        </label>
        <div className="user-context">
          <span>
            {user.name || user.email} · {audience} ({user.role})
          </span>
          {user.role === "viewer" ? <span>Read-only</span> : null}
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <DemoBanner isDemo={activeOrganization.isDemo} />
      <div className="shell-grid">
        <nav className="primary-nav" aria-label="Primary">
          <p className="nav-heading">Workspace</p>
          {WORKSPACE_LINKS.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
          {selectedCampaignId ? (
            <>
              <p className="nav-heading">Campaign</p>
              {links.map((link) => (
                <Link key={link.label} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
                  {link.label}
                </Link>
              ))}
            </>
          ) : null}
          {WORKSPACE_LINKS.slice(2).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <main id="main-content" className="main-content">
          {user.role === "viewer" ? (
            <p className="read-only-notice" data-testid="leadership-readonly">
              Leadership access is read-only.
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

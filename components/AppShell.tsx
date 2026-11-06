"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import type { OrganizationAccess, SessionUser } from "@/lib/auth";

type SessionState = {
  user: SessionUser;
  organizations: OrganizationAccess[];
  activeOrganization: OrganizationAccess;
};

const PRIMARY_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/audit", label: "Audit" },
  { href: "/budget", label: "Budget" },
  { href: "/settings", label: "Settings" },
] as const;

const CAMPAIGN_LINKS = ["Prompts", "Scans", "Answers", "Citations", "Gaps", "Strategy"] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" || pathname === "/overview" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(pathname !== "/login");

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
      .then((state) => setSession(state))
      .finally(() => setLoading(false));
  }, [pathname, router]);

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
                {organization.name}{organization.isDemo ? " — Demo" : ""} · {organization.role}
              </option>
            ))}
          </select>
        </label>
        <div className="campaign-context" aria-label="Campaign context">
          Campaign: <button type="button" disabled>Select campaign</button>
        </div>
        <div className="user-context">
          <span>{user.name || user.email} · {audience} ({user.role})</span>
          {user.role === "viewer" ? <span>Read-only</span> : null}
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <DemoBanner isDemo={activeOrganization.isDemo} />
      <div className="shell-grid">
        <nav className="primary-nav" aria-label="Primary">
          <p className="nav-heading">Workspace</p>
          {PRIMARY_LINKS.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
          {CAMPAIGN_LINKS.map((label) => (
            <span key={label} aria-disabled="true" title="Select a campaign to open this destination">
              {label} <small>Unavailable</small>
            </span>
          ))}
          {PRIMARY_LINKS.slice(2).map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <main id="main-content" className="main-content">
          {user.role === "viewer" ? (
            <p className="read-only-notice">Leadership access is read-only.</p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

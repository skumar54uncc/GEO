"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
import {
  BarChart3,
  Bell,
  Calendar,
  CircleHelp,
  Download,
  Globe,
  House,
  Layers,
  Lightbulb,
  Link2,
  List,
  MessageSquare,
  PanelLeft,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { DemoBanner } from "@/components/DemoBanner";
import { MetricShowRawProvider } from "@/components/metrics/ShowRawContext";
import { SessionRoleProvider } from "@/components/SessionRoleContext";
import type { Role } from "@/lib/auth/roles";
import type { OrganizationTheme } from "@/lib/contracts/shell";
import { cn } from "@/lib/utils";

/** Client-safe session shapes (do not import server `lib/auth` into the shell). */
type SessionUser = { userId: string; email: string; name: string | null; orgId: string; role: Role };
type OrganizationAccess = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  isDemo: boolean;
  theme: OrganizationTheme;
};

type SessionState = {
  user: SessionUser;
  organizations: OrganizationAccess[];
  activeOrganization: OrganizationAccess;
};

type CampaignOption = { id: string; name: string; status: string };

type SpendBar = { provider: string; spent: number; cap: number | null; tone: "amber" | "blue" };

const LEGACY_OPERATOR_PREFIXES = [
  "/capture",
  "/serpapi",
  "/config",
  "/analyze",
  "/recommend",
  "/bots",
  "/legacy",
  "/settings/providers",
  "/settings/demand",
] as const;

const ICON = { size: 19, strokeWidth: 1.8 } as const;

function campaignIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/campaigns\/([0-9a-f-]{36})(?:\/|$)/i);
  return m?.[1] ?? null;
}

function isLegacyOperatorPath(pathname: string): boolean {
  return LEGACY_OPERATOR_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  return `Good ${part}, ${first}.`;
}

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/overview";
  if (href === "/campaigns") return pathname === "/campaigns";
  if (href === "/how-we-measure") return pathname === "/how-we-measure";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [session, setSession] = useState<SessionState | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [spend, setSpend] = useState<SpendBar[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(pathname !== "/login");
  const [headerAlertCount, setHeaderAlertCount] = useState<number | null>(null);
  const pathCampaignId = campaignIdFromPath(pathname) ?? params.id ?? null;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(pathCampaignId);
  /** Below 1280px the rail is icons-only; below 1024px it becomes a drawer. */
  const [autoIconRail, setAutoIconRail] = useState(false);

  useEffect(() => {
    setSelectedCampaignId(pathCampaignId);
  }, [pathCampaignId]);

  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1280px)");
    const lg = window.matchMedia("(min-width: 1024px)");
    function sync() {
      if (!lg.matches) {
        setAutoIconRail(false);
        setCollapsed(false);
        return;
      }
      if (!xl.matches) {
        setAutoIconRail(true);
        setCollapsed(true);
        return;
      }
      setAutoIconRail(false);
      setCollapsed(false);
    }
    sync();
    xl.addEventListener("change", sync);
    lg.addEventListener("change", sync);
    return () => {
      xl.removeEventListener("change", sync);
      lg.removeEventListener("change", sync);
    };
  }, []);

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
        // Show shell (and demo banner) as soon as session is known — do not wait on campaigns/budget.
        setLoading(false);
        if (state) {
          if (state.user.role === "viewer" && isLegacyOperatorPath(pathname)) {
            // Hard navigate so Playwright waitForURL and leadership RBAC always leave legacy routes.
            window.location.replace("/");
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
          try {
            const budget = await fetch("/api/budget", { cache: "no-store" }).then((r) => r.json());
            const bars: SpendBar[] = [];
            for (const p of budget.providers ?? []) {
              if (p.role !== "active") continue;
              const name = p.displayName ?? p.provider;
              bars.push({
                provider: `${name} this month`,
                spent: Number(p.spentThisMonthUsd ?? 0),
                cap: p.monthlyBudgetUsd == null ? null : Number(p.monthlyBudgetUsd),
                tone: p.provider === "dataforseo" ? "amber" : "blue",
              });
            }
            setSpend(bars.slice(0, 2));
          } catch {
            setSpend([]);
          }
        }
      })
      .catch(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, pathCampaignId]);

  useEffect(() => {
    if (!session || pathname === "/login" || !selectedCampaignId) {
      setHeaderAlertCount(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/campaigns/${selectedCampaignId}/dashboard`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { alerts?: unknown[] } | null) => {
        if (cancelled || !j) return;
        const n = Array.isArray(j.alerts) ? j.alerts.length : 0;
        setHeaderAlertCount(n);
      })
      .catch(() => {
        if (!cancelled) setHeaderAlertCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session, pathname, selectedCampaignId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.getElementById("scout-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navGroups = useMemo(() => {
    const cid = selectedCampaignId;
    return [
      {
        label: "Insight & performance",
        items: [
          { href: "/", label: "Overview", icon: House },
          { href: cid ? `/campaigns/${cid}/dashboard` : "/campaigns", label: "Visibility", icon: BarChart3 },
          { href: cid ? `/campaigns/${cid}/answers` : "/campaigns", label: "Answers", icon: MessageSquare },
          { href: cid ? `/campaigns/${cid}/prompts` : "/campaigns", label: "Prompts", icon: List },
          { href: cid ? `/campaigns/${cid}/competitors` : "/campaigns", label: "Competitors", icon: Users, note: "Peers via citations" },
        ],
      },
      {
        label: "Content intelligence",
        items: [
          { href: cid ? `/campaigns/${cid}/demand` : "/campaigns", label: "Demand", icon: Search },
          { href: cid ? `/campaigns/${cid}/citations` : "/campaigns", label: "Citations", icon: Link2 },
          { href: cid ? `/campaigns/${cid}/gaps` : "/campaigns", label: "Gaps & recommendations", icon: ShieldCheck },
          { href: cid ? `/campaigns/${cid}/strategy` : "/campaigns", label: "Strategy", icon: Lightbulb },
          { href: "/sites", label: "Site audit", icon: Globe },
        ],
      },
      {
        label: "Settings",
        items: [
          { href: "/budget", label: "Budget", icon: Wallet },
          { href: "/settings", label: "Settings", icon: SlidersHorizontal },
          { href: "/how-we-measure", label: "How we measure", icon: CircleHelp },
        ],
      },
    ] as const;
  }, [selectedCampaignId]);

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
    else if (pathname.includes("/competitors")) router.push(`/campaigns/${id}/competitors`);
    else if (pathname.includes("/citations")) router.push(`/campaigns/${id}/citations`);
    else if (pathname.includes("/gaps")) router.push(`/campaigns/${id}/gaps`);
    else if (pathname.includes("/strategy")) router.push(`/campaigns/${id}/strategy`);
    else if (pathname.includes("/demand")) router.push(`/campaigns/${id}/demand`);
    else if (pathname === "/" || pathname === "/overview") router.push("/");
    else router.push(`/campaigns/${id}/dashboard`);
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q || !selectedCampaignId) return;
    router.push(`/campaigns/${selectedCampaignId}/prompts?q=${encodeURIComponent(q)}`);
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
    "--org-primary": activeOrganization.theme.primary || "var(--brand)",
    "--org-accent": activeOrganization.theme.accent || "var(--brand-accent)",
  } as CSSProperties;
  const audience = user.role === "viewer" ? "Leadership" : "Operator";
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const orgName = activeOrganization.name;
  const iconRail = collapsed || autoIconRail;

  function goToAlertsSection() {
    const onOverview = pathname === "/" || pathname === "/overview";
    if (!onOverview) {
      router.push("/#alerts");
      return;
    }
    document.getElementById("alerts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const sidebar = (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-[var(--border-nav)] transition-[width] duration-200",
        iconRail ? "w-[72px] px-2 py-4" : "w-scout-sidebar px-4 py-[18px]",
      )}
      style={{
        background: "linear-gradient(180deg, var(--bg-sidebar-from) 0%, var(--bg-sidebar-via) 60%, var(--bg-sidebar-to) 100%)",
      }}
      aria-label="Primary"
    >
      <div className={cn("mb-2 flex items-center", iconRail ? "justify-center" : "justify-between px-1")}>
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <Image src="/brand/mark.svg" alt="" width={30} height={30} priority />
          {!iconRail ? (
            <div>
              <div className="text-[19px] font-bold tracking-tight text-scout-brand">Scout</div>
              <div className="text-[10.5px] font-medium text-scout-muted">Scouting what AI says about us</div>
            </div>
          ) : null}
        </Link>
        {!iconRail ? (
          <button
            type="button"
            className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-scout-input bg-scout-card text-scout-muted"
            aria-label="Collapse sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeft size={16} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      {!iconRail ? (
        <form onSubmit={onSearchSubmit} className="mb-2 mt-4">
          <label className="flex h-10 items-center gap-2 rounded-scout-control border border-scout-input bg-scout-card px-2.5 text-scout-body text-scout-muted">
            <Search size={18} strokeWidth={1.8} aria-hidden />
            <input
              id="scout-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-scout-text outline-none placeholder:text-scout-muted"
            />
            <kbd className="text-xs text-[var(--text-nav)]">/</kbd>
          </label>
        </form>
      ) : (
        <button
          type="button"
          className="mx-auto mb-2 mt-4 grid h-10 w-10 place-items-center rounded-scout-control border border-scout-input"
          aria-label="Expand sidebar"
          onClick={() => {
            setCollapsed(false);
            setAutoIconRail(false);
          }}
        >
          <PanelLeft size={16} strokeWidth={1.8} />
        </button>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!iconRail ? (
              <p className="mb-1.5 ml-2 mt-4 text-[11px] font-medium uppercase tracking-[0.6px] text-scout-muted">
                {group.label}
              </p>
            ) : (
              <div className="my-2 border-t border-scout-border" />
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={`${group.label}-${item.label}`}
                  href={item.href}
                  title={iconRail ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "my-px flex h-[38px] items-center gap-[11px] rounded-[10px] px-2.5 text-sm no-underline transition-colors duration-150",
                    active ? "bg-scout-nav-active font-semibold text-[var(--text-nav)]" : "text-[var(--text-nav)]",
                    iconRail && "justify-center px-0",
                  )}
                  onClick={() => setDrawerOpen(false)}
                >
                  <Icon
                    {...ICON}
                    className={cn(active ? "text-scout-brand" : "text-[var(--text-nav-icon)]")}
                    aria-hidden
                  />
                  {!iconRail ? <span>{item.label}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!iconRail ? (
        <div className="mt-auto rounded-[14px] border border-scout-border bg-scout-card p-3.5 shadow-scout">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[var(--tile-green-bg)]">
              <Image src="/brand/mark.svg" alt="" width={24} height={24} />
            </div>
            <div className="min-w-0">
              <b className="block truncate text-sm font-medium text-scout-text">{orgName}</b>
              <span className="text-xs text-scout-muted">
                {audience} · {user.role === "viewer" ? "read only" : user.role}
              </span>
            </div>
          </div>
          {spend.map((s) => {
            const pct = s.cap && s.cap > 0 ? Math.min(100, Math.round((s.spent / s.cap) * 100)) : 0;
            return (
              <div key={s.provider} className="mt-2">
                <div className="flex justify-between text-[12.5px] text-[var(--text-nav)]">
                  <span>{s.provider}</span>
                  <b>
                    ${s.spent.toFixed(0)}
                    {s.cap != null ? ` / $${s.cap.toFixed(0)}` : ""}
                  </b>
                </div>
                <div className="my-1 h-1.5 rounded bg-scout-nav-active">
                  <i
                    className="block h-1.5 rounded"
                    style={{
                      width: `${pct}%`,
                      background: s.tone === "amber" ? "var(--spend-amber)" : "var(--chart)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <Link
            href="/budget"
            className="mt-3 block rounded-[9px] bg-[var(--ink-button)] py-2 text-center text-[13px] font-medium text-[var(--ink-button-fg)] no-underline"
          >
            Open budget
          </Link>
          <button type="button" className="mt-2 w-full text-center text-xs text-scout-muted underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      ) : null}
    </aside>
  );

  return (
    <div className="min-h-screen bg-scout-app p-0 md:p-[22px]" style={themeStyle}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="scout-window mx-auto flex min-h-[calc(100vh-44px)] max-w-[1600px] overflow-hidden rounded-[22px] bg-scout-card shadow-scout-window">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">{sidebar}</div>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
            <div className="absolute bottom-0 left-0 top-0 z-50 flex shadow-scout-window">{sidebar}</div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col bg-scout-page">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-nav)] bg-scout-card px-4 py-[18px] md:px-scout-gutter">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className="mt-1 grid h-10 w-10 place-items-center rounded-scout-control border border-scout-input lg:hidden"
                aria-label="Open menu"
                onClick={() => {
                  setCollapsed(false);
                  setDrawerOpen(true);
                }}
              >
                <PanelLeft size={18} strokeWidth={1.8} />
              </button>
              <div>
                <p className="text-scout-title text-scout-text" data-testid="scout-greeting">
                  {greeting(user.name)}
                </p>
                <p className="mt-[3px] text-scout-body text-scout-muted">
                  Here is what AI said about {orgName} in the latest scan
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label
                className="relative inline-flex h-10 min-w-[12rem] items-center gap-2 rounded-scout-control border border-scout-input bg-scout-card px-3 text-scout-body text-scout-text"
                title={`${activeOrganization.name}${activeOrganization.isDemo ? " (Demo)" : ""} · ${activeOrganization.role}`}
              >
                <span className="sr-only">Organization</span>
                <select
                  data-testid="org-switcher"
                  className="min-w-[11rem] appearance-none bg-transparent pr-5 outline-none"
                  value={activeOrganization.id}
                  onChange={(e) => void switchOrganization(e.target.value)}
                  aria-label="Organization"
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                      {organization.isDemo ? ", Demo" : ""} · {organization.role}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} strokeWidth={1.8} className="pointer-events-none absolute right-2 text-scout-muted" aria-hidden />
              </label>
              <label
                className="relative inline-flex h-10 min-w-[12rem] items-center gap-2 rounded-scout-control border border-scout-input bg-scout-card px-3 text-scout-body text-scout-text"
                title={selectedCampaign?.name ?? "Campaign"}
              >
                <Layers size={17} strokeWidth={1.8} aria-hidden />
                <span className="sr-only">Campaign</span>
                <select
                  className="min-w-[10rem] appearance-none bg-transparent pr-5 outline-none"
                  value={selectedCampaignId ?? ""}
                  onChange={(e) => onCampaignChange(e.target.value)}
                  data-testid="campaign-switcher"
                >
                  {!selectedCampaignId ? <option value="">Select campaign</option> : null}
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} strokeWidth={1.8} className="pointer-events-none absolute right-2 text-scout-muted" aria-hidden />
              </label>
              <button
                type="button"
                className="relative grid h-10 w-10 place-items-center rounded-scout-control border border-scout-input bg-scout-card"
                title={
                  headerAlertCount != null
                    ? `Open alerts on Overview (${headerAlertCount} open)`
                    : "Open alerts on Overview"
                }
                aria-label={
                  headerAlertCount != null
                    ? `Alerts: ${headerAlertCount} open. Go to Overview alerts section`
                    : "Alerts: go to Overview alerts section"
                }
                onClick={() => goToAlertsSection()}
              >
                <Bell size={18} strokeWidth={1.8} />
                <span className="absolute right-2 top-[7px] h-2 w-2 rounded-full border-2 border-white bg-[var(--alert-red)]" />
              </button>
              <div className="inline-flex h-10 items-center gap-2 rounded-scout-control border border-scout-input bg-scout-card px-3 text-scout-body">
                <Calendar size={17} strokeWidth={1.8} aria-hidden />
                <span>{selectedCampaign ? "Latest scan" : "No scan"}</span>
                <ChevronDown size={15} strokeWidth={1.8} className="text-scout-muted" aria-hidden />
              </div>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-scout-control border border-scout-input bg-scout-card"
                title="Open printable budget summary"
                aria-label="Download: open printable budget summary in this tab"
                onClick={() => {
                  window.location.assign("/api/budget/pdf");
                }}
              >
                <Download size={18} strokeWidth={1.8} />
              </button>
            </div>
          </header>

          <div className="px-4 md:px-scout-gutter">
            <DemoBanner isDemo={activeOrganization.isDemo} />
          </div>

          <main id="main-content" className="flex-1 px-4 py-3.5 pb-6 md:px-scout-gutter">
            {user.role === "viewer" ? (
              <p className="read-only-notice" data-testid="leadership-readonly">
                Leadership access is read-only.
              </p>
            ) : null}
            <SessionRoleProvider role={user.role}>
              <MetricShowRawProvider>{children}</MetricShowRawProvider>
            </SessionRoleProvider>
          </main>
        </div>
      </div>
    </div>
  );
}

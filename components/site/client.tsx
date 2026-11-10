"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/card";
import { safeHref } from "@/lib/url/safeHref";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? json.result?.error ?? `HTTP ${res.status}`);
  return json as T;
}

export type SiteSummary = { id: string; rootUrl: string; status: string; discoveredAt: string | null; brandName: string };

/** Site picker shared by the onboarding, audit and bot screens. Remembers the choice in the URL. */
export function useSites() {
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [siteId, setSiteIdState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async (select?: string) => {
    try {
      const { sites: list } = await api<{ sites: SiteSummary[] }>("/api/sites");
      setSites(list);
      const fromUrl = new URLSearchParams(window.location.search).get("site");
      const next = select ?? siteId ?? fromUrl ?? list[0]?.id ?? null;
      setSiteIdState(next && list.some((s) => s.id === next) ? next : (list[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSiteId = (id: string) => {
    setSiteIdState(id);
    const u = new URL(window.location.href);
    u.searchParams.set("site", id);
    window.history.replaceState(null, "", u.toString());
  };

  return { sites, siteId, setSiteId, reload, error };
}

export function SitePicker({ sites, siteId, onChange }: { sites: SiteSummary[]; siteId: string | null; onChange: (id: string) => void }) {
  if (!sites.length) return null;
  return (
    <select
      aria-label="Site"
      className="h-9 rounded border border-uncc-rule bg-white px-2 text-sm"
      value={siteId ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.rootUrl} · {s.status}
        </option>
      ))}
    </select>
  );
}

const SEVERITY_TONE: Record<string, "neutral" | "green" | "gold" | "muted"> = {
  critical: "gold",
  high: "gold",
  medium: "neutral",
  low: "muted",
  info: "muted",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const strong = severity === "critical" || severity === "high";
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? "neutral"} className={strong ? "font-semibold" : ""}>
      {severity}
    </Badge>
  );
}

export function EvidenceBadge({ strength }: { strength: string }) {
  const label = strength === "speculative" ? "speculative evidence" : `${strength} evidence`;
  return <Badge tone={strength === "strong" ? "green" : strength === "speculative" ? "muted" : "neutral"}>{label}</Badge>;
}

export function Message({ msg }: { msg: { tone: "ok" | "error"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={`text-sm ${msg.tone === "error" ? "text-red-700" : "text-uncc-green"}`}>
      {msg.text}
    </p>
  );
}

/** Untrusted page values (URLs, extracted text) are shown as text only. */
export function SafeLink({
  href,
  children,
  className = "break-all text-uncc-green underline-offset-2 hover:underline",
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const ok = safeHref(href);
  if (!ok) return <span className="break-all">{children ?? href}</span>;
  const external = /^https?:\/\//i.test(ok);
  return (
    <a
      href={ok}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      className={className}
    >
      {children ?? href}
    </a>
  );
}

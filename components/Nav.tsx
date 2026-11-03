"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/capture", label: "Capture" },
  { href: "/serpapi", label: "SerpAPI" },
  { href: "/demand", label: "Demand" },
  { href: "/analyze", label: "Analyze" },
  { href: "/recommend", label: "Recommend" },
  { href: "/config", label: "Config" },
];

type Me = { email: string; role: string } | null;

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    if (path === "/login") return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((j) => setMe(j.user))
      .catch(() => setMe(null));
  }, [path]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/login");
  }

  return (
    <header className="border-b border-uncc-rule bg-white">
      <div className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-uncc-green">
            Measurement instrument
          </p>
          <h1 className="font-serif text-xl font-semibold text-uncc-ink">
            UNC Charlotte AI Visibility Platform
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          {me ? (
            <p className="text-xs text-uncc-ink/60">
              {me.email} · {me.role}{" "}
              <button type="button" onClick={signOut} className="ml-2 underline hover:text-uncc-ink">
                Sign out
              </button>
            </p>
          ) : null}
          {path === "/login" ? null : (
            <nav className="flex flex-wrap gap-1">
              {LINKS.map((l) => {
                const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`px-3 py-1.5 text-sm ${
                      active
                        ? "border-b-2 border-uncc-green font-medium text-uncc-green"
                        : "text-uncc-ink/70 hover:text-uncc-ink"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}

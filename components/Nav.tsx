"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/capture", label: "Capture" },
  { href: "/serpapi", label: "SerpAPI" },
  { href: "/demand", label: "Demand" },
  { href: "/analyze", label: "Analyze" },
  { href: "/recommend", label: "Recommend" },
  { href: "/config", label: "Config" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-uncc-rule bg-white">
      <div className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-uncc-green">
            Measurement instrument
          </p>
          <h1 className="font-serif text-xl font-semibold text-uncc-ink">
            UNC Charlotte Energy AI Visibility Tracker
          </h1>
        </div>
        <nav className="flex flex-wrap gap-1">
          {LINKS.map((l) => {
            const active = path === l.href;
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
      </div>
    </header>
  );
}

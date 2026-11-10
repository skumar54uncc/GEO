"use client";

import { type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ScoutCard({
  children,
  className,
  hover,
  delayMs = 0,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  delayMs?: number;
  padded?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "rounded-scout border border-scout-border bg-scout-card shadow-scout",
        padded && "p-[18px] px-5",
        hover && "scout-hover-lift",
        className,
      )}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.45, delay: delayMs / 1000, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "gain" | "noise" | "decline" | "warn" | "none";
  children: ReactNode;
}) {
  const style: CSSProperties =
    tone === "gain"
      ? { background: "var(--status-gain-bg)", color: "var(--status-gain-fg)" }
      : tone === "decline" || tone === "warn"
        ? { background: "var(--status-decline-bg)", color: "var(--status-decline-fg)" }
        : { background: "var(--status-noise-bg)", color: "var(--status-noise-fg)" };
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold" style={style}>
      {children}
    </span>
  );
}

export function IntentPill({ intent }: { intent: "comparison" | "discovery" | "evaluation" | "decision" | "untagged" | string }) {
  const map: Record<string, CSSProperties> = {
    comparison: { background: "var(--intent-comparison-bg)", color: "var(--intent-comparison-fg)" },
    discovery: { background: "var(--intent-discovery-bg)", color: "var(--intent-discovery-fg)" },
    evaluation: { background: "var(--intent-evaluation-bg)", color: "var(--intent-evaluation-fg)" },
    decision: { background: "var(--intent-decision-bg)", color: "var(--intent-decision-fg)" },
    untagged: { background: "var(--status-noise-bg)", color: "var(--status-noise-fg)" },
  };
  const style = map[intent] ?? map.untagged;
  const label = intent === "untagged" ? "Untagged" : intent.charAt(0).toUpperCase() + intent.slice(1);
  return (
    <span className="inline-block rounded-scout-pill px-3 py-1 text-xs font-medium" style={style}>
      {label}
    </span>
  );
}

export function TileIcon({
  tone,
  children,
}: {
  tone: "blue" | "green" | "amber" | "purple";
  children: ReactNode;
}) {
  const style: CSSProperties =
    tone === "blue"
      ? { background: "var(--tile-blue-bg)", color: "var(--tile-blue-fg)" }
      : tone === "green"
        ? { background: "var(--tile-green-bg)", color: "var(--tile-green-fg)" }
        : tone === "amber"
          ? { background: "var(--tile-amber-bg)", color: "var(--tile-amber-fg)" }
          : { background: "var(--tile-purple-bg)", color: "var(--tile-purple-fg)" };
  return (
    <div className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl" style={style}>
      {children}
    </div>
  );
}

export function EngineChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-[30px] items-center rounded-scout-pill border px-3 text-[12.5px] transition-[background,color,border] duration-150",
        active
          ? "border-[var(--ink-button)] bg-[var(--ink-button)] text-[var(--ink-button-fg)]"
          : "border-scout-input bg-scout-card text-scout-muted hover:border-scout-text/30",
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="relative inline-flex gap-0.5 rounded-[10px] border border-scout-border p-[3px] text-[12.5px]">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded-[7px] px-[11px] py-[5px] transition-transform duration-150 active:scale-[0.98]",
              // intent-comparison-fg (#2F5FD0) passes WCAG AA on white; tile-blue-fg does not at 12.5px.
              active ? "font-semibold text-[var(--intent-comparison-fg)]" : "text-scout-muted",
            )}
          >
            {active ? (
              <motion.span
                layoutId={reduce ? undefined : "scout-segmented-pill"}
                className="absolute inset-0 rounded-[7px] border border-scout-input bg-scout-card shadow-sm"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="relative z-[1]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-scout-title text-scout-text">{title}</h1>
      {subtitle ? <p className="mt-[3px] text-scout-body text-scout-muted">{subtitle}</p> : null}
    </div>
  );
}

export function CountUp({ value, durationMs = 600 }: { value: number; durationMs?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className="tabular">{value}</span>;
  return (
    <motion.span
      className="tabular"
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durationMs / 1000 }}
    >
      {value}
    </motion.span>
  );
}

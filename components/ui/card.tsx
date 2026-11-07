import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-scout border border-scout-border bg-scout-card shadow-scout", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-uncc-rule px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  // h2 under page h1 — keeps Lighthouse heading-order sequential (no h1→h3 skip).
  return <h2 className={cn("text-scout-card text-scout-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-uncc-ink/80", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "green" | "gold" | "muted" }) {
  const tones = {
    neutral: "border-scout-border bg-scout-page text-scout-text",
    green: "border-scout-border bg-[var(--tile-green-bg)] text-[var(--status-gain-fg)]",
    gold: "border-scout-border bg-[var(--status-noise-bg)] text-scout-muted",
    muted: "border-scout-border bg-scout-card text-scout-muted",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded border border-uncc-rule bg-white", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-uncc-rule px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  // h2 under page h1 — keeps Lighthouse heading-order sequential (no h1→h3 skip).
  return <h2 className={cn("font-serif text-lg font-semibold text-uncc-ink", className)} {...props} />;
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
    neutral: "border-uncc-rule bg-uncc-paper text-uncc-ink",
    green: "border-uncc-green/30 bg-uncc-mist text-uncc-green",
    gold: "border-uncc-gold/40 bg-[#f4f0e3] text-[#6b5f35]",
    muted: "border-uncc-rule bg-white text-uncc-ink/75",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

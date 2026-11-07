import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="rounded-scout border border-scout-border bg-scout-card p-6 shadow-scout"
      aria-live="polite"
      role="status"
    >
      <div className="space-y-2.5" aria-hidden>
        <div className="h-3 w-44 skeleton-shimmer" />
        <div className="h-2 max-w-md skeleton-shimmer" />
        <div className="h-2 max-w-lg skeleton-shimmer" style={{ width: "82%" }} />
      </div>
      <p className="mt-4 text-sm text-scout-muted">{label}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section
      className="rounded-scout border border-scout-border bg-scout-card p-6 shadow-scout"
      aria-labelledby="empty-title"
    >
      <h2 id="empty-title" className="text-scout-card text-scout-text">
        {title}
      </h2>
      {children ? <div className="mt-2 text-sm text-scout-muted">{children}</div> : null}
    </section>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p
      className="rounded-scout border p-4 text-sm shadow-scout"
      style={{
        background: "var(--status-decline-bg)",
        borderColor: "color-mix(in srgb, var(--status-decline-fg) 28%, var(--border))",
        color: "var(--status-decline-fg)",
      }}
      role="alert"
    >
      {message}
    </p>
  );
}

export function PartialDataNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-scout border px-3 py-2 text-sm shadow-scout"
      style={{
        background: "var(--tile-amber-bg)",
        borderColor: "color-mix(in srgb, var(--tile-amber-fg) 35%, var(--border))",
        color: "var(--intent-evaluation-fg)",
      }}
      role="status"
    >
      {children}
    </p>
  );
}

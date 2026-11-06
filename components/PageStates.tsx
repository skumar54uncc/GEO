import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="rounded border border-uncc-rule bg-white p-6 text-sm text-uncc-ink/70" aria-live="polite" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="empty-title">
      <h2 id="empty-title" className="font-serif text-xl font-semibold text-uncc-ink">
        {title}
      </h2>
      {children ? <div className="mt-2 text-sm text-uncc-ink/75">{children}</div> : null}
    </section>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}

export function PartialDataNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
      {children}
    </p>
  );
}

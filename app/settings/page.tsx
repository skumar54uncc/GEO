import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Settings</p>
        <h1 className="font-serif text-3xl font-semibold">Platform settings</h1>
        <p className="mt-2 max-w-2xl text-uncc-ink/75">
          Provider status, budgets, schedules, evaluation quality, and users will be managed here according to role.
        </p>
      </header>
      <section className="rounded border border-uncc-rule bg-white p-6">
        <h2 className="font-serif text-xl font-semibold">API tokens</h2>
        <p className="mt-2 text-sm text-uncc-ink/75">Deferred — the local pilot does not need them.</p>
        <Link href="/settings/providers" className="mt-4 inline-block text-uncc-green underline">
          View provider status
        </Link>
      </section>
    </div>
  );
}

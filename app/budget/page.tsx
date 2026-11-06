export default function BudgetPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Budget</p>
        <h1 className="font-serif text-3xl font-semibold">Budget &amp; Funding</h1>
        <p className="mt-2 max-w-2xl text-uncc-ink/75">
          Approved estimates, actual recorded spend, caps, assumptions, sources, and verification dates will appear
          here. Unknown prices remain unknown and are never treated as zero.
        </p>
      </header>
      <section className="rounded border border-uncc-rule bg-white p-6">
        <h2 className="font-serif text-xl font-semibold">No approved estimate</h2>
        <p className="mt-2 text-sm text-uncc-ink/75">
          This Wave 1 shell does not invent pilot or steady-state costs. Generate an estimate through the cost guard
          after campaign scope and verified provider prices are available.
        </p>
      </section>
    </div>
  );
}

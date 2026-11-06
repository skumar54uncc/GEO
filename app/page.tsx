import Link from "next/link";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-uncc-green">Overview</p>
        <h1 className="font-serif text-3xl font-semibold">AI search visibility</h1>
        <p className="mt-2 max-w-2xl text-uncc-ink/75">
          Campaign summaries will appear here after a campaign has a completed, compatible scan. No legacy pooled
          metrics are shown on this leadership route.
        </p>
      </header>
      <section className="rounded border border-uncc-rule bg-white p-6" aria-labelledby="overview-empty-title">
        <h2 id="overview-empty-title" className="font-serif text-xl font-semibold">No campaign summary selected</h2>
        <p className="mt-2 max-w-2xl text-sm text-uncc-ink/75">
          Open Campaigns to choose a campaign dashboard. Each future summary will keep engines, runners, prompt-set
          versions, and branded status separate and will include its sample size and 95% interval.
        </p>
        <Link className="mt-4 inline-block font-semibold text-uncc-green underline" href="/campaigns">
          Open Campaigns
        </Link>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { HowMeasured } from "@/components/HowMeasured";
import { ScoutCard, PageTitle } from "@/components/scout/primitives";

const METRICS = "docs/METRICS.md";

export default function HowWeMeasurePage() {
  return (
    <div className="space-y-scout-gap">
      <PageTitle
        title="How we measure"
        subtitle="Every rate comes from stored draws, judges, and citations. Runners and indexes are never averaged together."
      />
      <ScoutCard>
        <HowMeasured
          context={{
            extra:
              "Prompts won uses Wilson intervals on prompt counts. Cluster bootstrap needs at least 10 prompts. Location-biased prompts are excluded from headlines. Significant change requires McNemar at alpha 0.05.",
            n: 0,
          }}
        />
        <ul className="mt-4 list-disc space-y-2 pl-5 text-scout-body text-scout-text">
          <li>n is the number of AI answers checked in the cell, never a mention count.</li>
          <li>Cells under 30 answers show “too few answers” instead of a precise rate.</li>
          <li>Fewer than 10 prompts uses an approximate Wilson interval, not a cluster bootstrap.</li>
          <li>Green “significant” badges appear only when McNemar is significant. Noise stays gray.</li>
          <li>Chat engines and Google surfaces stay in separate series.</li>
        </ul>
      </ScoutCard>

      <ScoutCard>
        <h2 className="font-serif text-xl text-scout-text">Wave 6 metrics</h2>
        <p className="mt-1 text-sm text-scout-muted">
          Each item links to the rule in <code>{METRICS}</code> (repo path). Product code never invents thresholds.
        </p>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-scout-body text-scout-text">
          <li>
            <strong>Coverage matrix thresholds</strong> — strong ≥60%, partial ≥20%, invisible &lt;20%; displayable rule
            still suppresses thin cells (needs 10+ prompts). See{" "}
            <Link className="underline" href="/campaigns">
              Visibility
            </Link>{" "}
            intent × engine matrix · METRICS.md §6.
          </li>
          <li>
            <strong>Share of voice trend</strong> — us vs peers over scans inside one index only; indexes are never
            pooled. METRICS.md §7 / Competitors SoV trend.
          </li>
          <li>
            <strong>Peer-average benchmark</strong> — mean mention-share of the top 3 peers (excluding us) within one
            index. Null when no peers are named. METRICS.md §7.
          </li>
          <li>
            <strong>Cited-pages share rule</strong> — structured “What cited pages share” needs enough cited pages;
            thin samples show “Too few cited pages” (n{" < "}3). Correlation, not cause. See METRICS.md §8.
          </li>
          <li>
            <strong>Region comparison</strong> — cells use <code>region_honored</code> yes/unknown only; honored /
            unknown / no mix is shown; regions are never pooled into one number; engines that ignore location show
            “region not supported”. METRICS.md § region cells + ARCHITECTURE 5.4.
          </li>
          <li>
            <strong>Strict majority won rule</strong> — a prompt is won when brand mentions ≥ floor(n/2)+1 valid draws
            (n=2 → 2 of 2). METRICS.md row 1.
          </li>
        </ul>
      </ScoutCard>
    </div>
  );
}

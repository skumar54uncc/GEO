"use client";

import { HowMeasured } from "@/components/HowMeasured";
import { ScoutCard, PageTitle } from "@/components/scout/primitives";

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
    </div>
  );
}

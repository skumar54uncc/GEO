/**
 * Bannered demo_seed:v1 demand fixtures for the Demo org Demand page.
 * Never used for UNC Charlotte org.
 */
import { DEMO_SEED_MARKER } from "@/lib/contracts/demoSeed";
import type { Db } from "@/lib/db/pg/client";
import { demandSignals } from "@/lib/db/pg/schema";
import type { DemandSource } from "./types";

type SeedRow = {
  source: DemandSource;
  term: string;
  value: Record<string, unknown>;
};

function mark(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, seedMarker: DEMO_SEED_MARKER, provenance: DEMO_SEED_MARKER };
}

/** Rich per-source fixtures for one demo campaign (Energy-style). */
export function demoDemandSeedRows(campaignTopic: string): SeedRow[] {
  const topic = campaignTopic || "energy";
  return [
    {
      source: "google_trends",
      term: `${topic} degree programs`,
      value: mark({
        kind: "timeseries",
        label: "interest_over_time",
        geo: "US",
        points: [
          { date: "2025-08", interest: 54 },
          { date: "2025-09", interest: 58 },
          { date: "2025-10", interest: 61 },
          { date: "2025-11", interest: 67 },
        ],
        byRegion: [
          { geo: "US-NC", interest: 72 },
          { geo: "US-SC", interest: 48 },
          { geo: "US-VA", interest: 41 },
        ],
        relatedRising: [
          { query: `${topic} undergraduate research`, value: "Breakout" },
          { query: `best ${topic} masters`, value: "+120%" },
        ],
        relatedQueries: [`${topic} jobs`, `${topic} certificate online`],
      }),
    },
    {
      source: "keyword_volume",
      term: `${topic} bachelor`,
      value: mark({
        kind: "keyword_volume",
        volume: 880,
        volumeKind: "modeled",
        sourceLabel: "dataforseo_demo_fixture",
      }),
    },
    {
      source: "paa",
      term: `best ${topic} programs`,
      value: mark({
        kind: "paa",
        questions: [
          `What universities have strong ${topic} programs?`,
          `How much do ${topic} graduates earn?`,
          `Is a ${topic} degree worth it?`,
        ],
      }),
    },
    {
      source: "autocomplete",
      term: `${topic} university`,
      value: mark({
        kind: "autocomplete",
        suggestions: [`${topic} university rankings`, `${topic} university near me`, `${topic} university scholarships`],
      }),
    },
    {
      source: "related_search",
      term: `${topic} masters`,
      value: mark({
        kind: "related_search",
        related: [`online ${topic} masters`, `${topic} vs engineering`, `${topic} graduate assistantship`],
      }),
    },
    {
      source: "exa",
      term: `university ${topic} research partnership`,
      value: mark({
        kind: "exa_discussion",
        results: [
          {
            title: "Industry–university energy labs thread",
            url: "https://www.reddit.com/r/gradadmissions/comments/demo-energy-labs",
            venue: "reddit",
          },
          {
            title: "Forum: applied energy research partnerships",
            url: "https://example.test/forum/energy-labs",
            venue: "forum",
          },
        ],
      }),
    },
    {
      source: "search_console",
      term: `demo university ${topic}`,
      value: mark({
        kind: "search_console_query",
        clicks: 36,
        impressions: 820,
        ctr: 0.0439,
        position: 9.1,
        label: "fixture_owned_query",
      }),
    },
    {
      source: "llm_mentions",
      term: `Demo University ${topic}`,
      value: mark({
        kind: "llm_mentions",
        mentionEstimate: null,
        capability: "unknown",
        note: "Fixture only; not observed AI search volume.",
        discoveries: [{ query: `which schools excel at ${topic}`, surface: "fixture" }],
      }),
    },
  ];
}

/** Insert demo demand signals for a campaign. Append-only; caller should only run on demo org. */
export async function seedDemoDemandSignals(
  db: Db,
  campaignId: string,
  campaignTopic: string,
): Promise<{ inserted: number }> {
  const rows = demoDemandSeedRows(campaignTopic).map((r) => ({
    campaignId,
    source: r.source,
    term: r.term,
    regionId: null,
    value: r.value,
    fetchedAt: new Date(),
  }));
  if (!rows.length) return { inserted: 0 };
  await db.insert(demandSignals).values(rows);
  return { inserted: rows.length };
}

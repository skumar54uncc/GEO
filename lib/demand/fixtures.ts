import type { DemandFixture, DemandSource } from "./types";

const FIXTURES: Record<DemandSource, DemandFixture> = {
  google_trends: {
    signals: [
      {
        term: "artificial intelligence degree",
        value: {
          kind: "timeseries",
          geo: "US",
          points: [
            { date: "2026-01", interest: 62 },
            { date: "2026-02", interest: 68 },
          ],
          relatedRising: [{ query: "ai undergraduate programs", value: "Breakout" }],
          label: "fixture_interest_over_time",
        },
      },
    ],
  },
  search_console: {
    signals: [
      {
        term: "unc charlotte computer science",
        value: {
          kind: "search_console_query",
          clicks: 42,
          impressions: 900,
          ctr: 0.0467,
          position: 8.2,
          label: "fixture_owned_query",
        },
      },
    ],
  },
  paa: {
    signals: [
      {
        term: "best energy engineering programs",
        value: {
          kind: "paa",
          questions: [
            "What universities have strong energy engineering programs?",
            "How much do energy engineering graduates earn?",
          ],
        },
      },
    ],
  },
  autocomplete: {
    signals: [
      {
        term: "university internships",
        value: {
          kind: "autocomplete",
          suggestions: ["university internships near me", "university internships for credit"],
        },
      },
    ],
  },
  related_search: {
    signals: [
      {
        term: "data science masters",
        value: { kind: "related_search", related: ["online data science masters", "data science vs analytics"] },
      },
    ],
  },
  exa: {
    signals: [
      {
        term: "university research partnership energy",
        value: {
          kind: "exa_discussion",
          results: [
            {
              title: "Industry-university energy labs",
              url: "https://example.test/forum/energy-labs",
              venue: "forum",
            },
          ],
        },
      },
    ],
  },
  keyword_volume: {
    signals: [
      {
        term: "artificial intelligence bachelor",
        value: {
          kind: "keyword_volume",
          volume: 720,
          volumeKind: "modeled",
          sourceLabel: "dataforseo_fixture",
        },
      },
    ],
  },
  llm_mentions: {
    signals: [
      {
        term: "UNC Charlotte AI",
        value: {
          kind: "llm_mentions",
          mentionEstimate: null,
          capability: "unknown",
          note: "Fixture only; not observed AI search volume.",
        },
      },
    ],
  },
};

export function demandFixtureFor(source: DemandSource): DemandFixture {
  const fixture = FIXTURES[source];
  return {
    signals: fixture.signals.map((signal) => ({
      term: signal.term,
      value: { ...signal.value },
    })),
  };
}

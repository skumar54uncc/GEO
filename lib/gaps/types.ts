import type { Engine, Runner } from "@/lib/capture/types";
import { CORRELATION_LABEL, MIN_CITED_PAGES_PER_COHORT, type GapLeverType } from "@/lib/contracts/gaps";

export { CORRELATION_LABEL, MIN_CITED_PAGES_PER_COHORT };

/** Jeffreys informative prior for binomial rates (shrinks rare-term log-odds). */
export const DIRICHLET_ALPHA = 0.5;

/** Cosine floor for matching a prompt to an owned crawl page. Below this → new page. */
export const GAP_PAGE_SIMILARITY_THRESHOLD = 0.7;

export const NO_MATCHING_PAGE_MESSAGE = "no matching page, consider a new page" as const;
export const EMBEDDINGS_DISABLED_MESSAGE =
  "Local embedding model is unavailable; nearest owned page matching is disabled." as const;
export const NOT_ENOUGH_PAGES_MESSAGE = "Not enough pages for a comparison." as const;

/** One engine × runner series. Never pooled across runners or indexes. */
export type GapSeriesKey = {
  engine: Engine;
  runner: Runner;
};

export type PromptCohortRow = {
  promptId: string;
  mentions: number;
  validDraws: number;
  won: boolean;
  drawIds: string[];
};

export type GapSeriesCohort = {
  key: GapSeriesKey;
  /** Unbranded prompts with ≥1 valid draw that are not won. */
  lost: PromptCohortRow[];
  /** Unbranded prompts with ≥1 valid draw that are won. */
  won: PromptCohortRow[];
  /** Valid draws belonging to lost prompts in this series. */
  lostDrawIds: string[];
  /** Valid draws belonging to won prompts in this series. */
  wonDrawIds: string[];
};

export type GapCitation = {
  id: string;
  drawId: string;
  url: string;
  canonicalUrl: string | null;
  domain: string;
  sourceClass: string;
  position: number | null;
  title: string | null;
};

export type GapCitedPage = {
  id: string;
  canonicalUrl: string;
  title: string | null;
  h1: string | null;
  h2s: string[];
  contentType: string | null;
  wordCount: number | null;
};

export type GapFanoutQuery = {
  id: string;
  drawId: string;
  query: string;
  source: string;
};

export type LostEvidence = {
  citations: GapCitation[];
  citedPages: GapCitedPage[];
  fanoutQueries: GapFanoutQuery[];
};

export type OrganicRankRow = {
  position: number;
  url: string;
  domain: string;
  title: string | null;
};

export type SerpSnapshotFixture = {
  query: string;
  regionId?: string | null;
  engine: string;
  organic: OrganicRankRow[];
};

export type FanoutRankHit = {
  query: string;
  url: string;
  domain: string;
  position: number;
  kind: "cited" | "owned";
};

export type FanoutRankJoinResult = {
  mode: "fixture_only";
  label: typeof CORRELATION_LABEL;
  /** Fan-out queries that had a matching serp_snapshots row. */
  nQueries: number;
  /** Queries with no snapshot in the fixture set. */
  missingSnapshots: number;
  citedHits: FanoutRankHit[];
  ownedHits: FanoutRankHit[];
  /** Distinct cited URLs that ranked in at least one fan-out SERP. */
  citedRankedN: number;
  /** Distinct owned domains/URLs that ranked in at least one fan-out SERP. */
  ownedRankedN: number;
};

export type PageTermSource = {
  id: string;
  title?: string | null;
  h1?: string | null;
  h2s?: readonly string[] | null;
};

export type TermLiftRow = {
  term: string;
  won: { matches: number; n: number };
  lost: { matches: number; n: number };
  /** log-odds(lost) − log-odds(won) with Dirichlet prior; positive ⇒ enriched when we lose. */
  logOddsLift: number;
  label: typeof CORRELATION_LABEL;
};

export type TermLiftResult =
  | {
      status: "ok";
      label: typeof CORRELATION_LABEL;
      terms: TermLiftRow[];
      wonN: number;
      lostN: number;
    }
  | {
      status: "insufficient";
      message: typeof NOT_ENOUGH_PAGES_MESSAGE;
      wonN: number;
      lostN: number;
      terms: [];
    };

export type NearestPageMatch =
  | {
      status: "disabled";
      message: typeof EMBEDDINGS_DISABLED_MESSAGE;
    }
  | {
      status: "no_match";
      message: typeof NO_MATCHING_PAGE_MESSAGE;
      bestSimilarity: number | null;
      bestPageId: string | null;
      bestUrl: string | null;
    }
  | {
      status: "matched";
      pageId: string;
      url: string;
      similarity: number;
      threshold: number;
    };

export type BrandFactInput = {
  id: string;
  text: string;
  /** Stable key for value comparison (e.g. "enrollment", "carnegie"). */
  key: string;
  /** Canonical brand value for this key. */
  value: string;
};

export type CitedValueInput = {
  key: string;
  value: string;
  sourceUrl: string;
  excerpt?: string;
};

export type TruthConflict = {
  factId: string;
  ourFact: string;
  conflictingValue: string;
  sourceUrl: string;
};

/** Compact view for recommendation cards / writer. */
export type ClosestOwnedPage = {
  crawlPageId: string | null;
  similarity: number | null;
  /** True when similarity is below the configured threshold (or no page exists). */
  noMatchingPage: boolean;
  embeddingsDisabled?: boolean;
  message?: string;
};

export type LostPromptCell = {
  scanId: string;
  engine: Engine;
  runner: Runner;
  regionId: string | null;
  personaId: string | null;
  branded: boolean;
  /** Prompts not won in this cell (never pooled across indexes or runners). */
  promptIds: string[];
};

/**
 * Inputs the recommendation card / writer need from gap analysis.
 */
export type GapEvidenceBundle = {
  campaignId: string;
  scanId: string;
  leverType: GapLeverType;
  lost: LostPromptCell;
  termLifts: TermLiftRow[];
  citedPageIds: string[];
  closestOwnedPage: ClosestOwnedPage;
  /** Opaque evidence row ids already persisted or ready to attach. */
  evidenceIds: string[];
};

export type LostCohortSelectOpts = {
  engine: Engine;
  runner: Runner;
  regionId?: string | null;
  personaId?: string | null;
  branded?: boolean;
};

/** Implemented by cohort selection: prompts not won for one series cell. */
export interface LostCohortSelector {
  select(scanId: string, opts: LostCohortSelectOpts): Promise<LostPromptCell>;
}

export type TermLiftPage = {
  citedPageId: string;
  /** Tokenized headline / H1 / H2 terms already extracted. */
  terms: string[];
};

/** Implemented by term-lift: log-odds lifts between cohorts. */
export interface TermLiftComputer {
  compute(won: readonly TermLiftPage[], lost: readonly TermLiftPage[]): TermLiftRow[];
}

/**
 * Fan-out query → organic SERP rank join (ARCHITECTURE §9 step 2–3).
 *
 * Default mode is fixture-only (same pattern as content-analysis adapter):
 * estimate first, refuse live lookup, run only with an explicit fixture + matching approval.
 * Reports always carry n (queries joined).
 */
import crypto from "crypto";
import type { Db } from "@/lib/db/pg/client";
import { checkBudget } from "@/lib/cost/guard";
import { canonicalizeCitationUrl } from "@/lib/citations/canonical";
import { domainIsOwned } from "@/lib/metrics/rollup";
import { CORRELATION_LABEL } from "./types";
import type {
  FanoutRankHit,
  FanoutRankJoinResult,
  GapFanoutQuery,
  OrganicRankRow,
  SerpSnapshotFixture,
} from "./types";

export const FANOUT_RANK_JOIN_PROVIDER = "fanout_rank_join";

export type FanoutRankJoinRequest = {
  campaignId: string;
  scanId: string;
  /** Distinct fan-out query strings to join. */
  queries: string[];
  ownedDomains: string[];
  citedUrls: string[];
};

export type FanoutRankJoinEstimate = {
  provider: typeof FANOUT_RANK_JOIN_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
};

export type FanoutRankJoinApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export class FanoutRankJoinUnavailableError extends Error {}
export class FanoutRankJoinApprovalError extends Error {}

function normalized(request: FanoutRankJoinRequest): FanoutRankJoinRequest {
  return {
    ...request,
    queries: [...new Set(request.queries.map((q) => q.trim()).filter(Boolean))].sort(),
    ownedDomains: [...new Set(request.ownedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))].sort(),
    citedUrls: [...new Set(request.citedUrls.map((u) => u.trim()).filter(Boolean))].sort(),
  };
}

export function estimateFanoutRankJoin(request: FanoutRankJoinRequest): FanoutRankJoinEstimate {
  const norm = normalized(request);
  const paramsHash = crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
  return {
    provider: FANOUT_RANK_JOIN_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    units: Math.max(1, norm.queries.length),
    paramsHash,
    available: true,
  };
}

function normUrl(raw: string): string | null {
  return canonicalizeCitationUrl(raw) ?? (raw.trim() ? raw.trim().toLowerCase() : null);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Pure join of fan-out queries against serp_snapshots organic rows.
 * Matching is case-insensitive on the query string.
 */
export function joinFanoutToOrganic(input: {
  fanoutQueries: Array<Pick<GapFanoutQuery, "query"> | string>;
  snapshots: SerpSnapshotFixture[];
  citedUrls: string[];
  ownedDomains: string[];
}): FanoutRankJoinResult {
  const queries = [
    ...new Set(
      input.fanoutQueries.map((q) => (typeof q === "string" ? q : q.query).trim()).filter(Boolean),
    ),
  ];
  const snapByQuery = new Map<string, SerpSnapshotFixture>();
  for (const s of input.snapshots) {
    const k = s.query.trim().toLowerCase();
    if (!snapByQuery.has(k)) snapByQuery.set(k, s);
  }

  const citedNorm = new Set(
    input.citedUrls.map(normUrl).filter((u): u is string => Boolean(u)).map((u) => u.toLowerCase()),
  );
  const owned = input.ownedDomains;

  const citedHits: FanoutRankHit[] = [];
  const ownedHits: FanoutRankHit[] = [];
  let nQueries = 0;
  let missingSnapshots = 0;
  const citedRanked = new Set<string>();
  const ownedRanked = new Set<string>();

  for (const query of queries) {
    const snap = snapByQuery.get(query.toLowerCase());
    if (!snap) {
      missingSnapshots++;
      continue;
    }
    nQueries++;
    const organic: OrganicRankRow[] = snap.organic ?? [];
    for (const row of organic) {
      const urlNorm = normUrl(row.url);
      if (!urlNorm) continue;
      const domain = (row.domain || domainOf(row.url)).replace(/^www\./, "").toLowerCase();
      if (citedNorm.has(urlNorm.toLowerCase())) {
        citedHits.push({
          query,
          url: row.url,
          domain,
          position: row.position,
          kind: "cited",
        });
        citedRanked.add(urlNorm.toLowerCase());
      }
      if (domain && domainIsOwned(domain, owned)) {
        ownedHits.push({
          query,
          url: row.url,
          domain,
          position: row.position,
          kind: "owned",
        });
        ownedRanked.add(domain);
      }
    }
  }

  return {
    mode: "fixture_only",
    label: CORRELATION_LABEL,
    nQueries,
    missingSnapshots,
    citedHits,
    ownedHits,
    citedRankedN: citedRanked.size,
    ownedRankedN: ownedRanked.size,
  };
}

/**
 * Fixture execution still uses the cost guard. Live SERP lookup is intentionally
 * unavailable (no HTTP transport); only an explicit fixture may run.
 */
export async function runFanoutRankJoin(
  db: Db,
  input: {
    orgId: string;
    request: FanoutRankJoinRequest;
    approval?: FanoutRankJoinApproval;
    fixture?: { snapshots: SerpSnapshotFixture[] };
  },
): Promise<FanoutRankJoinResult> {
  const estimate = estimateFanoutRankJoin(input.request);
  if (!input.fixture) {
    throw new FanoutRankJoinUnavailableError(
      "Fan-out rank join live capability is unavailable; only an explicitly supplied serp_snapshots fixture can run.",
    );
  }
  const approval = input.approval;
  if (
    !approval ||
    approval.paramsHash !== estimate.paramsHash ||
    approval.units !== estimate.units ||
    approval.priceUsd !== null ||
    approval.acknowledgedUnknownPrice !== true
  ) {
    throw new FanoutRankJoinApprovalError("Explicit approval must exactly match the current estimate.");
  }
  const budget = await checkBudget(db, input.orgId, FANOUT_RANK_JOIN_PROVIDER, {
    units: estimate.units,
    uncachedUnits: estimate.units,
    usd: null,
  });
  if (!budget.allowed) throw new FanoutRankJoinApprovalError(budget.reason ?? "Cost guard refused the fixture run.");

  const norm = normalized(input.request);
  return joinFanoutToOrganic({
    fanoutQueries: norm.queries,
    snapshots: input.fixture.snapshots,
    citedUrls: norm.citedUrls,
    ownedDomains: norm.ownedDomains,
  });
}

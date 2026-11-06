import { beforeEach, describe, expect, it } from "vitest";
import {
  estimateFanoutRankJoin,
  FanoutRankJoinUnavailableError,
  FanoutRankJoinApprovalError,
  joinFanoutToOrganic,
  runFanoutRankJoin,
} from "@/lib/gaps/fanoutJoin";
import { CORRELATION_LABEL } from "@/lib/gaps/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { providerAccounts } from "@/lib/db/pg/schema";
import { eq } from "drizzle-orm";
import { resetDatabase } from "../helpers";

const snapshots = [
  {
    query: "best energy engineering programs southeast",
    engine: "google:dataforseo:fanout",
    organic: [
      {
        position: 1,
        url: "https://www.usnews.com/best-colleges/energy",
        domain: "usnews.com",
        title: "Best energy programs",
      },
      {
        position: 3,
        url: "https://engineering.charlotte.edu/energy",
        domain: "charlotte.edu",
        title: "UNC Charlotte Energy",
      },
      {
        position: 5,
        url: "https://peer.edu/programs/energy",
        domain: "peer.edu",
        title: "Peer Energy",
      },
    ],
  },
  {
    query: "unused query",
    engine: "google:dataforseo:fanout",
    organic: [],
  },
];

describe("fan-out to organic rank join", () => {
  it("joins fan-out queries to serp_snapshots fixtures and reports n", () => {
    const result = joinFanoutToOrganic({
      fanoutQueries: ["best energy engineering programs southeast", "missing query"],
      snapshots,
      citedUrls: ["https://www.usnews.com/best-colleges/energy", "https://peer.edu/programs/energy"],
      ownedDomains: ["charlotte.edu"],
    });

    expect(result.mode).toBe("fixture_only");
    expect(result.label).toBe(CORRELATION_LABEL);
    expect(result.nQueries).toBe(1);
    expect(result.missingSnapshots).toBe(1);
    expect(result.citedRankedN).toBe(2);
    expect(result.ownedRankedN).toBe(1);
    expect(result.citedHits.map((h) => h.position).sort()).toEqual([1, 5]);
    expect(result.ownedHits).toEqual([
      expect.objectContaining({
        kind: "owned",
        position: 3,
        domain: "charlotte.edu",
      }),
    ]);
  });

  it("estimate is fixture_only with unknown price and stable params hash", () => {
    const request = {
      campaignId: "00000000-0000-4000-8000-000000000001",
      scanId: "00000000-0000-4000-8000-000000000002",
      queries: ["b query", "a query"],
      ownedDomains: ["Charlotte.EDU", "charlotte.edu"],
      citedUrls: ["https://example.com/x"],
    };
    const a = estimateFanoutRankJoin(request);
    const b = estimateFanoutRankJoin({
      ...request,
      queries: ["a query", "b query", "b query"],
      ownedDomains: ["charlotte.edu"],
    });
    expect(a).toMatchObject({
      mode: "fixture_only",
      capability: "unknown",
      priceUsd: null,
      units: 2,
      available: true,
    });
    expect(a.paramsHash).toBe(b.paramsHash);
  });
});

describe("fan-out rank join gated runner", () => {
  beforeEach(resetDatabase);

  it("refuses live lookup without a fixture", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const request = {
      campaignId: ctx.campaignId,
      scanId: "00000000-0000-4000-8000-000000000099",
      queries: ["q"],
      ownedDomains: ["charlotte.edu"],
      citedUrls: [],
    };
    await expect(
      runFanoutRankJoin(db, { orgId: ctx.orgId, request }),
    ).rejects.toBeInstanceOf(FanoutRankJoinUnavailableError);
  });

  it("runs fixture path only with matching approval and a provider account", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const request = {
      campaignId: ctx.campaignId,
      scanId: "00000000-0000-4000-8000-000000000099",
      queries: ["best energy engineering programs southeast"],
      ownedDomains: ["charlotte.edu"],
      citedUrls: ["https://www.usnews.com/best-colleges/energy"],
    };
    const estimate = estimateFanoutRankJoin(request);

    await expect(
      runFanoutRankJoin(db, {
        orgId: ctx.orgId,
        request,
        approval: {
          paramsHash: estimate.paramsHash,
          units: estimate.units,
          priceUsd: null,
          acknowledgedUnknownPrice: true,
        },
        fixture: { snapshots },
      }),
    ).rejects.toBeInstanceOf(FanoutRankJoinApprovalError);

    await db.insert(providerAccounts).values({
      orgId: ctx.orgId,
      provider: "fanout_rank_join",
      perRunCapUnits: 100,
      creditsRemaining: 100,
      creditUnitUsd: null,
    });

    await expect(
      runFanoutRankJoin(db, {
        orgId: ctx.orgId,
        request,
        approval: {
          paramsHash: "wrong",
          units: estimate.units,
          priceUsd: null,
          acknowledgedUnknownPrice: true,
        },
        fixture: { snapshots },
      }),
    ).rejects.toBeInstanceOf(FanoutRankJoinApprovalError);

    const result = await runFanoutRankJoin(db, {
      orgId: ctx.orgId,
      request,
      approval: {
        paramsHash: estimate.paramsHash,
        units: estimate.units,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      fixture: { snapshots },
    });
    expect(result.nQueries).toBe(1);
    expect(result.citedRankedN).toBe(1);
    expect(result.ownedRankedN).toBe(1);

    const accounts = await db
      .select()
      .from(providerAccounts)
      .where(eq(providerAccounts.provider, "fanout_rank_join"));
    expect(accounts).toHaveLength(1);
  });
});

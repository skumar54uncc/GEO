import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as connectionsGet } from "@/app/api/demand/connections/route";
import {
  DEMAND_ADAPTERS,
  demandAdapterFor,
  demandFixtureFor,
  ensureSeasonalEvents,
  listDemandConnections,
  storeDemandSignals,
  DemandApprovalError,
  DemandUnavailableError,
  type DemandSource,
} from "@/lib/demand";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { demandSignals, providerAccounts, seasonalEvents } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "../helpers";

const EMPTY_ENV: Record<string, string | undefined> = {
  GOOGLE_TRENDS_API_KEY: "",
  SERPAPI_API_KEY: "",
  GOOGLE_SEARCH_CONSOLE_PROPERTY: "",
  EXA_API_KEY: "",
  DATAFORSEO_LOGIN: "",
  DATAFORSEO_PASSWORD: "",
};

const CONNECTED_ENV: Record<string, string | undefined> = {
  GOOGLE_TRENDS_API_KEY: "trends-key",
  SERPAPI_API_KEY: "serp-key",
  GOOGLE_SEARCH_CONSOLE_PROPERTY: "sc-domain:charlotte.edu",
  EXA_API_KEY: "exa-key",
  DATAFORSEO_LOGIN: "login",
  DATAFORSEO_PASSWORD: "password",
};

const SOURCES: DemandSource[] = [
  "google_trends",
  "search_console",
  "paa",
  "autocomplete",
  "related_search",
  "exa",
  "keyword_volume",
  "llm_mentions",
];

describe("Phase 4 demand adapters", () => {
  beforeEach(resetDatabase);

  it("reports not_connected for every adapter when keys or access are missing", () => {
    const connections = listDemandConnections(EMPTY_ENV);
    expect(connections).toHaveLength(8);
    for (const c of connections) {
      expect(c.connected).toBe(false);
      expect(c.status).toBe("not_connected");
      expect(c.missing.length).toBeGreaterThan(0);
      expect(c.mode).toBe("fixture_only");
    }
    for (const source of SOURCES) {
      const adapter = demandAdapterFor(source);
      const status = adapter.connectionStatus(EMPTY_ENV);
      expect(status).toMatchObject({ connected: false, status: "not_connected", source });
    }
  });

  it("runs fixture path with estimate approval and stores demand_signals without network", async () => {
    const db = getDb();
    const context = await legacyContext(db);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = { campaignId: context.campaignId, term: "artificial intelligence", regionLabel: "US" };

    for (const source of SOURCES) {
      const adapter = demandAdapterFor(source);
      const provider = adapter.config.provider;
      const existing = await db
        .select({ id: providerAccounts.id })
        .from(providerAccounts)
        .where(eq(providerAccounts.provider, provider));
      if (!existing.length) {
        await db.insert(providerAccounts).values({
          orgId: context.orgId,
          provider,
          perRunCapUnits: 10,
          creditsRemaining: 10,
          creditUnitUsd: null,
        });
      }

      const disconnected = await adapter.run(db, {
        orgId: context.orgId,
        request,
        env: EMPTY_ENV,
        fixture: demandFixtureFor(source),
      });
      expect(disconnected).toMatchObject({ connected: false, status: "not_connected", source, signals: [] });

      const estimate = adapter.estimate(request, CONNECTED_ENV);
      expect(estimate).toMatchObject({
        connected: true,
        status: "connected",
        mode: "fixture_only",
        priceUsd: null,
        source,
      });

      await expect(
        adapter.run(db, {
          orgId: context.orgId,
          request,
          env: CONNECTED_ENV,
          approval: {
            paramsHash: estimate.paramsHash,
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        }),
      ).rejects.toBeInstanceOf(DemandUnavailableError);

      await expect(
        adapter.run(db, {
          orgId: context.orgId,
          request,
          env: CONNECTED_ENV,
          fixture: demandFixtureFor(source),
          approval: {
            paramsHash: "0".repeat(64),
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        }),
      ).rejects.toBeInstanceOf(DemandApprovalError);

      const result = await adapter.run(db, {
        orgId: context.orgId,
        request,
        env: CONNECTED_ENV,
        fixture: demandFixtureFor(source),
        approval: {
          paramsHash: estimate.paramsHash,
          units: estimate.units,
          priceUsd: null,
          acknowledgedUnknownPrice: true,
        },
      });
      expect(result).toMatchObject({ connected: true, status: "ok", source, mode: "fixture_only" });
      if (result.connected) expect(result.signals.length).toBeGreaterThan(0);

      const stored = await storeDemandSignals(db, { campaignId: context.campaignId, result });
      expect(stored.inserted).toBeGreaterThan(0);
    }

    expect(DEMAND_ADAPTERS).toHaveLength(8);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const rows = await db.select({ source: demandSignals.source }).from(demandSignals);
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(SOURCES));
  });

  it("exposes not connected via the thin connections API", async () => {
    await legacyContext(getDb());
    const cookie = await cookieFor("viewer@charlotte.edu", "viewer");
    const previous = { ...CONNECTED_ENV };
    for (const key of Object.keys(EMPTY_ENV)) {
      previous[key] = process.env[key];
      process.env[key] = "";
    }
    try {
      const response = await connectionsGet(req("/api/demand/connections", { cookie }));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { connections: Array<{ status: string; connected: boolean }> };
      expect(body.connections).toHaveLength(8);
      expect(body.connections.every((c) => c.status === "not_connected" && c.connected === false)).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("seeds seasonal events with required source_url", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    const first = await ensureSeasonalEvents(db, orgId);
    expect(first).toHaveLength(7);
    expect(new Set(first.map((r) => r.kind))).toEqual(
      new Set(["admissions_deadline", "aid_deadline", "commencement", "orientation", "term_start", "custom"]),
    );
    expect(first.some((r) => r.name === "FAFSA opens")).toBe(true);
    const second = await ensureSeasonalEvents(db, orgId);
    expect(second.every((r) => r.created === false)).toBe(true);
    const rows = await db.select().from(seasonalEvents).where(eq(seasonalEvents.orgId, orgId));
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => Boolean(r.sourceUrl))).toBe(true);

    await expect(
      ensureSeasonalEvents(db, orgId, [
        {
          name: "Broken",
          kind: "admissions_deadline",
          startsOn: "2026-01-01",
          sourceUrl: "   ",
        },
      ]),
    ).rejects.toThrow(/source_url is required/);
  });
});

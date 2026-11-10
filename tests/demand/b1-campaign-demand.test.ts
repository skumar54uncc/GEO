import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as demandPost } from "@/app/api/campaigns/[id]/demand/route";
import { POST as promptsPost } from "@/app/api/campaigns/[id]/prompts/route";
import { DEMO_SEED_MARKER } from "@/lib/contracts/demoSeed";
import { DEMAND_ADAPTERS } from "@/lib/demand/adapters";
import {
  demandStatusLabel,
  enrichConnectionStatus,
  isFixtureOrDemoSignal,
  listDemandSourceCards,
  loadCampaignDemand,
} from "@/lib/demand/campaignView";
import { seedDemoDemandSignals } from "@/lib/demand/demoSeedSignals";
import { demandFixtureFor } from "@/lib/demand/fixtures";
import { storeDemandSignals } from "@/lib/demand/store";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { brands, campaigns, demandSignals, organizations } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "../helpers";

const EMPTY_ENV: Record<string, string | undefined> = {
  GOOGLE_TRENDS_API_KEY: "",
  SERPAPI_API_KEY: "",
  GOOGLE_SEARCH_CONSOLE_PROPERTY: "",
  EXA_API_KEY: "",
  DATAFORSEO_LOGIN: "",
  DATAFORSEO_PASSWORD: "",
  GOOGLE_TRENDS_LIVE_APPROVED: "",
};

describe("P2 B1 campaign Demand", () => {
  beforeEach(resetDatabase);

  it("lists not_connected / approval_pending / connected; estimated is for modeled values only", () => {
    const cards = listDemandSourceCards(EMPTY_ENV);
    expect(cards).toHaveLength(DEMAND_ADAPTERS.length);
    for (const c of cards) {
      expect(c.status).toBe("not_connected");
      expect(c.connected).toBe(false);
    }

    const withKeys = listDemandSourceCards({
      ...EMPTY_ENV,
      EXA_API_KEY: "exa",
      SERPAPI_API_KEY: "serp",
      DATAFORSEO_LOGIN: "u",
      DATAFORSEO_PASSWORD: "p",
      GOOGLE_TRENDS_API_KEY: "t",
      GOOGLE_SEARCH_CONSOLE_PROPERTY: "sc-domain:example.test",
    });
    const by = Object.fromEntries(withKeys.map((c) => [c.source, c.status]));
    expect(by.exa).toBe("connected");
    expect(by.search_console).toBe("connected");
    expect(by.paa).toBe("connected");
    expect(by.autocomplete).toBe("connected");
    expect(by.related_search).toBe("connected");
    expect(by.keyword_volume).toBe("connected"); // estimate-gated at fetch; status is not "estimated"
    expect(by.llm_mentions).toBe("connected");
    expect(by.google_trends).toBe("approval_pending");
  });

  it("Trends with key but no approval is Not connected (approval pending)", () => {
    const trends = enrichConnectionStatus(
      DEMAND_ADAPTERS.find((a) => a.config.source === "google_trends")!.connectionStatus({
        GOOGLE_TRENDS_API_KEY: "t",
      }),
      { GOOGLE_TRENDS_API_KEY: "t", GOOGLE_TRENDS_LIVE_APPROVED: "" },
    );
    expect(trends.status).toBe("approval_pending");
    expect(trends.connected).toBe(false);
    expect(demandStatusLabel(trends.status)).toBe("Not connected (approval pending)");

    const live = enrichConnectionStatus(
      DEMAND_ADAPTERS.find((a) => a.config.source === "google_trends")!.connectionStatus({
        GOOGLE_TRENDS_API_KEY: "t",
      }),
      { GOOGLE_TRENDS_API_KEY: "t", GOOGLE_TRENDS_LIVE_APPROVED: "1" },
    );
    expect(live.status).toBe("connected");
  });

  it("UNC / non-demo never surfaces fixture PAA, autocomplete, or related rows", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    // Store fixture-shaped signals as if someone seeded them under UNC — must not appear.
    for (const source of ["paa", "autocomplete", "related_search"] as const) {
      const fixture = demandFixtureFor(source);
      await storeDemandSignals(db, {
        campaignId: ctx.campaignId,
        result: {
          connected: true,
          status: "ok",
          source,
          mode: "fixture_only",
          paramsHash: "test",
          signals: fixture.signals.map((s) => ({ term: s.term, value: s.value, source })),
        },
      });
    }
    const stored = await db.select().from(demandSignals).where(eq(demandSignals.campaignId, ctx.campaignId));
    expect(stored.length).toBeGreaterThan(0);
    // storeDemandSignals stamps fixture provenance for fixture_only runs.
    expect(stored.every((s) => isFixtureOrDemoSignal(s.value as Record<string, unknown>))).toBe(true);
    expect(
      stored.every((s) => {
        const v = s.value as { provenance?: string };
        return v.provenance === "fixture" || isFixtureOrDemoSignal(v);
      }),
    ).toBe(true);

    const unc = await loadCampaignDemand(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      env: {
        ...EMPTY_ENV,
        SERPAPI_API_KEY: "serp",
      },
    });
    expect(unc!.organization.isDemo).toBe(false);
    for (const source of ["paa", "autocomplete", "related_search"] as const) {
      const card = unc!.sources.find((s) => s.source === source)!;
      expect(card.signals).toEqual([]);
      expect(card.notFetchedYet).toBe(true);
      expect(card.status).toBe("connected");
      expect(card.note).toMatch(/Connected, not fetched yet/i);
    }
  });

  it("loads demo fixtures with demo_seed:v1 provenance; UNC empty without real fetch", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const unc = await loadCampaignDemand(db, { orgId: ctx.orgId, campaignId: ctx.campaignId, env: EMPTY_ENV });
    expect(unc!.sources.every((s) => s.signals.length === 0)).toBe(true);

    const [demoOrg] = await db
      .insert(organizations)
      .values({ name: "Demo University", slug: "demo-b1", isDemo: true })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: demoOrg.id, name: "Demo University", rootDomain: "demo.example.test" })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: demoOrg.id, brandId: brand.id, name: "Energy", topic: "Energy", status: "active" })
      .returning();

    await seedDemoDemandSignals(db, campaign.id, "Energy");
    const demo = await loadCampaignDemand(db, { orgId: demoOrg.id, campaignId: campaign.id, env: EMPTY_ENV });
    expect(demo!.organization.isDemo).toBe(true);
    expect(demo!.sources.some((s) => s.signals.length > 0)).toBe(true);
    for (const s of demo!.sources.flatMap((c) => c.signals)) {
      expect(s.provenance).toBe(DEMO_SEED_MARKER);
    }
  });

  it("add-as-custom-prompt stores demand evidence ids linking back to the Demand row", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "B1 Demand campaign", topic: "Energy", status: "active" })
      .returning();
    await seedDemoDemandSignals(db, campaign.id, "Energy");
    const [signal] = await db
      .select({ id: demandSignals.id, term: demandSignals.term })
      .from(demandSignals)
      .where(eq(demandSignals.campaignId, campaign.id))
      .limit(1);

    const cookie = await cookieFor("b1-editor@charlotte.edu", "editor");
    const res = await promptsPost(
      req(`/api/campaigns/${campaign.id}/prompts`, {
        method: "POST",
        cookie,
        body: {
          action: "create_custom",
          text: signal.term,
          intent: "discovery",
          persona_id: null,
          branded: false,
          demand_evidence_ids: [signal.id],
        },
      }),
      { params: { id: campaign.id } },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { prompt: { demandEvidence: { ids: string[] } } };
    expect(body.prompt.demandEvidence.ids).toContain(signal.id);
  });

  it("demo org refuses live demand fetch (fixtures only)", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await db.update(organizations).set({ isDemo: true }).where(eq(organizations.id, ctx.orgId));
    const cookie = await cookieFor("b1-demo-fetch@charlotte.edu", "editor");

    const res = await demandPost(
      req(`/api/campaigns/${ctx.campaignId}/demand`, {
        method: "POST",
        cookie,
        body: { source: "keyword_volume", term: "energy" },
      }),
      { params: { id: ctx.campaignId } },
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { refused?: boolean; error?: string };
    expect(json.refused).toBe(true);
    expect(String(json.error)).toMatch(/demo_seed:v1|Demo org/i);
  });
});

import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/pg/client";
import { brandAliases, brands, competitors, costLedger, entityChecks, organizations, peerSuggestions, sites } from "@/lib/db/pg/schema";
import { cleanWikitext, compareField, parseInfobox, runEntityCheck, type EntityDeps } from "@/lib/site/entityCheck";
import { reviewPeer, scorePeers, suggestPeers, type PeerDeps, type ScorecardSchool } from "@/lib/site/peers";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { resetDatabase, userIdFor } from "../helpers";
import { createSession } from "@/lib/auth";

// Responses stored from the live APIs on 2026-11-03 (trimmed); see tests/fixtures/site/external.
const EXT = path.join(__dirname, "../fixtures/site/external");
const ext = (f: string) => fs.readFileSync(path.join(EXT, f), "utf8");
const scorecard = JSON.parse(ext("scorecard_peers.json")) as { results: ScorecardSchool[] };
const self = scorecard.results.find((r) => r.id === 199139)!;

describe("peer scoring", () => {
  it("ranks Scorecard peers by program overlap with reasons", () => {
    const scored = scorePeers(self, scorecard.results);
    expect(scored.length).toBe(scorecard.results.length - 1);
    expect(scored.every((p) => p.school.id !== 199139)).toBe(true);
    for (let i = 1; i < scored.length; i++) expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    const top = scored[0];
    expect(top.reasons.find((r) => r.kind === "carnegie")?.text).toMatch(/code 16/);
    expect(top.reasons.find((r) => r.kind === "program_overlap")?.text).toMatch(/Program overlap \d+%/);
    // The stored response did not request region or control, so no reason may claim them.
    expect(top.reasons.some((r) => r.kind === "region" || r.kind === "ownership")).toBe(false);
  });

  it("states region and control only when both schools report them", () => {
    const a = { ...self, "school.region_id": 5, "school.ownership": 1 };
    const b = { ...scorecard.results[0], id: 1, "school.region_id": 5, "school.ownership": 1 };
    const [p] = scorePeers(a, [b]);
    expect(p.reasons.find((r) => r.kind === "region")?.text).toBe("Same region: Southeast");
    expect(p.reasons.find((r) => r.kind === "ownership")?.text).toBe("Same control: Public");
  });
});

describe("with the database", () => {
  let orgId: string;
  let brandId: string;
  let siteId: string;
  let userId: string;

  beforeAll(async () => {
    await resetDatabase();
    const db = getDb();
    const { user } = await createSession("peer-test@example.test");
    userId = await userIdFor("peer-test@example.test");
    orgId = user.orgId;
    const [brand] = await db
      .insert(brands)
      .values({ orgId, name: "University of North Carolina at Charlotte", rootDomain: "charlotte.edu" })
      .returning();
    brandId = brand.id;
    const [site] = await db.insert(sites).values({ brandId, rootUrl: "https://charlotte.edu/" }).returning();
    siteId = site.id;
    await ensurePhase2Providers(db, orgId);
  });

  it("suggests peers, stores the unit id, caches calls, and accepting creates a competitor", async () => {
    const db = getDb();
    const calls: string[] = [];
    const deps: PeerDeps = {
      apiKey: "TEST_KEY",
      fetchJson: async (url) => {
        calls.push(url);
        const u = new URL(url);
        if (u.searchParams.get("school.name")) {
          return { ok: true, body: JSON.stringify({ results: [{ ...self, "school.school_url": "https://www.charlotte.edu/" }] }), error: null };
        }
        if (u.searchParams.get("id") === "199139") return { ok: true, body: JSON.stringify({ results: [self] }), error: null };
        return { ok: true, body: JSON.stringify(scorecard), error: null };
      },
    };
    const res = await suggestPeers(db, { siteId, orgId, brandId, deps });
    expect(res.status).toBe("ok");
    expect(res.self?.unitid).toBe("199139");
    const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
    expect(brand.ipedsUnitid).toBe("199139");
    const rows = await db.select().from(peerSuggestions).where(eq(peerSuggestions.siteId, siteId));
    expect(rows.length).toBe(res.suggested);
    expect(rows.every((r) => Array.isArray(r.reasons) && (r.reasons as unknown[]).length >= 3)).toBe(true);
    // The API key is never stored in cached params.
    const ledger = await db.execute(sql`SELECT params::text AS p FROM provider_cache WHERE provider = 'scorecard'`);
    expect(JSON.stringify(ledger.rows)).not.toMatch(/TEST_KEY/);

    const before = calls.length;
    await suggestPeers(db, { siteId, orgId, brandId, deps });
    expect(calls.length).toBe(before);
    const cached = await db.select().from(costLedger).where(eq(costLedger.provider, "scorecard"));
    expect(cached.some((c) => c.cached)).toBe(true);

    const ecu = rows.find((r) => r.ipedsUnitid === "198464")!;
    await reviewPeer(db, { siteId, orgId, peerId: ecu.id, status: "confirmed", userId });
    const [comp] = await db.select().from(competitors).where(eq(competitors.ipedsUnitid, "198464"));
    expect(comp).toMatchObject({ name: "East Carolina University", source: "ipeds_suggested" });
  });

  it("infobox parsing on the stored Wikipedia response", () => {
    const wp = JSON.parse(ext("wikipedia_section0.json"));
    const box = parseInfobox(wp.query.pages[0].revisions[0].slots.main.content);
    expect(cleanWikitext(box.established)).toBe("September 23, 1946");
    expect(cleanWikitext(box.type)).toBe("Public research university");
    expect(cleanWikitext(box.students)).toMatch(/^32,207 \(fall 2025\)/);
  });

  it("compares fields: enrollment tolerance, state names, aliases", () => {
    expect(compareField("enrollment_total", { value: 30448 }, 32207, []).status).toBe("match");
    expect(compareField("enrollment_total", { value: 27599 }, 32207, []).status).toBe("mismatch");
    expect(compareField("state", { value: "North Carolina" }, "NC", []).status).toBe("match");
    expect(compareField("name", { value: "UNC Charlotte" }, "University of North Carolina at Charlotte", ["UNC Charlotte"]).status).toBe("match");
    expect(compareField("founding_year", { value: null }, 1946, []).status).toBe("missing");
    expect(compareField("website", { value: "https://www.charlotte.edu/" }, "charlotte.edu", []).status).toBe("match");
  });

  it("runs the entity check on stored responses and marks Knowledge Graph not checked without a key", async () => {
    const db = getDb();
    await db.insert(brandAliases).values({ brandId, alias: "UNC Charlotte", kind: "short" }).onConflictDoNothing();
    await db
      .update(brands)
      .set({
        profile: {
          name: "University of North Carolina at Charlotte",
          founding_year: 1946,
          city: "Charlotte",
          state: "NC",
          type: "public",
          website: "charlotte.edu",
          enrollment_total: 32207,
          enrollment_undergrad: 24453,
          confirmed_at: "2026-11-03T00:00:00Z",
          confirmed_by: userId,
        },
      })
      .where(eq(brands.id, brandId));
    const responses: Array<[RegExp, string]> = [
      [/wbsearchentities/, ext("wikidata_search.json")],
      [/Special:EntityData\/Q1783178/, ext("wikidata_Q1783178.json")],
      [/wbgetentities/, ext("wikidata_labels.json")],
      [/en\.wikipedia\.org/, ext("wikipedia_section0.json")],
      [/educationdata\.urban\.org.*\/2023\//, JSON.stringify({ results: [] })],
      [/educationdata\.urban\.org.*\/2022\//, ext("urban_ipeds_directory_199139.json")],
      [/collegescorecard/, JSON.stringify({ results: [self] })],
    ];
    const deps: EntityDeps = {
      kgApiKey: null,
      scorecardApiKey: "TEST_KEY",
      fetchJson: async (url) => {
        const hit = responses.find(([re]) => re.test(url));
        return hit ? { ok: true, body: hit[1], error: null } : { ok: false, body: "", error: `unexpected ${url}` };
      },
    };
    const summary = await runEntityCheck(db, { brandId, orgId, deps });
    expect(summary.sources.find((s) => s.source === "knowledge_graph")).toMatchObject({ status: "not_checked", compared: 0 });
    const rows = await db.select().from(entityChecks).where(eq(entityChecks.brandId, brandId));
    const get = (source: string, field: string) => rows.find((r) => r.source === source && r.field === field);
    expect(get("wikidata", "founding_year")?.status).toBe("match");
    expect(get("wikidata", "website")?.status).toBe("match");
    // Wikidata's most recently dated P2196 value is 27,599 (2021-09-01) vs 32,207 confirmed: a real, stale mismatch.
    const wdEnroll = get("wikidata", "enrollment_total");
    expect(wdEnroll?.status).toBe("mismatch");
    expect(wdEnroll?.observed).toMatchObject({ value: 27599, as_of: "2021-09-01" });
    expect(get("wikipedia", "type")?.status).toBe("match");
    expect(get("wikipedia", "enrollment_total")?.status).toBe("match");
    expect(get("ipeds", "city")?.status).toBe("match");
    expect(get("ipeds", "type")?.status).toBe("match");
    expect(get("scorecard", "enrollment_undergrad")?.status).toBe("match");
    expect(rows.some((r) => r.source === "knowledge_graph")).toBe(false);
    expect(rows.every((r) => r.rawPayloadId)).toBe(true);
    const orgRows = await db.select().from(organizations);
    expect(orgRows.length).toBeGreaterThan(0);
  });
});

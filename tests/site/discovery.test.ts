import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/pg/client";
import { siteHosts } from "@/lib/db/pg/schema";
import { createSite } from "@/lib/site/service";
import { defaultFetcher, discoverSite } from "@/lib/site/discovery";
import { crawlerUserAgent } from "@/lib/site/net/userAgent";
import { createSession } from "@/lib/auth";
import { fixturePolicy, startFixtureSite, type FixtureSite } from "../fixtures/site/server";
import { resetDatabase } from "../helpers";

describe("discovery under a host check cap", () => {
  let fx: FixtureSite;
  beforeAll(async () => {
    await resetDatabase();
    fx = await startFixtureSite();
  });
  afterAll(() => fx.close());

  it("always checks the root and the host it redirects to, and lists the rest as not checked", async () => {
    const db = getDb();
    const { user } = await createSession("disc-test@example.test");
    const { site } = await createSite(db, user.orgId, fx.rootUrl);
    const ctHosts = ["aaa.fixture.test", "aab.fixture.test", "nowhere.fixture.test"];
    const summary = await discoverSite(db, site.id, {
      fetch: defaultFetcher(crawlerUserAgent("mailto:t@example.test"), fixturePolicy),
      ctLookup: async () => ({ ok: true, error: null, hosts: ctHosts }),
      maxHostChecks: 1,
      maxSitemapFiles: 10,
      maxSitemapUrls: 1000,
      sitemapPagesToScan: 0,
      concurrency: 2,
    });
    const rows = await db.select().from(siteHosts).where(eq(siteHosts.siteId, site.id));
    const by = Object.fromEntries(rows.map((r) => [r.host, r]));
    expect(by["fixture.test"].excludeReason).toBe("redirects to www.fixture.test");
    expect(by["www.fixture.test"]).toMatchObject({ included: true, excludeReason: null });
    for (const h of ctHosts) expect(by[h].excludeReason).toMatch(/^not checked/);
    expect(summary.hosts_checked).toBe(2);
    // Hosts never checked were never requested.
    expect(fx.requests.some((r) => r.host.startsWith("aa"))).toBe(false);
  });
});

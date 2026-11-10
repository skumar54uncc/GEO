import { readFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GSC_ACCESS_PENDING_LABEL,
  demandStatusLabel,
  isFixtureOrDemoSignal,
  loadCampaignDemand,
} from "@/lib/demand/campaignView";
import { demandFixtureFor } from "@/lib/demand/fixtures";
import { storeDemandSignals } from "@/lib/demand/store";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { demandSignals } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

const EMPTY_ENV: Record<string, string | undefined> = {
  GOOGLE_TRENDS_API_KEY: "",
  SERPAPI_API_KEY: "",
  GOOGLE_SEARCH_CONSOLE_PROPERTY: "",
  EXA_API_KEY: "",
  DATAFORSEO_LOGIN: "",
  DATAFORSEO_PASSWORD: "",
  GOOGLE_TRENDS_LIVE_APPROVED: "",
};

describe("Gate 3 row 19 Search Console (UNC)", () => {
  beforeEach(resetDatabase);

  it("UNC Demand Search Console shows access-pending copy with zero fixture rows", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const fixture = demandFixtureFor("search_console");
    await storeDemandSignals(db, {
      campaignId: ctx.campaignId,
      result: {
        connected: true,
        status: "ok",
        source: "search_console",
        mode: "fixture_only",
        paramsHash: "test-gsc",
        signals: fixture.signals.map((s) => ({ term: s.term, value: s.value, source: "search_console" as const })),
      },
    });
    const stored = await db.select().from(demandSignals).where(eq(demandSignals.campaignId, ctx.campaignId));
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((s) => isFixtureOrDemoSignal(s.value as Record<string, unknown>))).toBe(true);

    const view = await loadCampaignDemand(db, {
      orgId: ctx.orgId,
      campaignId: ctx.campaignId,
      env: EMPTY_ENV,
    });
    expect(view!.organization.isDemo).toBe(false);
    const gsc = view!.sources.find((s) => s.source === "search_console");
    expect(gsc).toBeDefined();
    expect(gsc!.status).toBe("not_connected");
    expect(gsc!.connected).toBe(false);
    expect(gsc!.signals).toHaveLength(0);
    expect(gsc!.note).toBe(GSC_ACCESS_PENDING_LABEL);
    expect(demandStatusLabel(gsc!.status, "search_console")).toBe(GSC_ACCESS_PENDING_LABEL);
  });

  it("Overview GSC panel copy matches access-pending label", () => {
    const page = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    expect(page).toMatch(/data-testid="gsc-panel"/);
    expect(page).toMatch(/data-testid="gsc-status"/);
    expect(page).toContain(GSC_ACCESS_PENDING_LABEL);
    expect(page).toMatch(/Branded search impressions \(Search Console\)/);
  });
});

describe("Gate 3 COVERAGE row confirmation", () => {
  it("lists built rows 9, 12, 15, 18, 22, 25 and deferred 17, 21 in BACKLOG", () => {
    const backlog = readFileSync(path.join(process.cwd(), "docs/BACKLOG.md"), "utf8");
    expect(backlog).toMatch(/\| 17 \|/);
    expect(backlog).toMatch(/\| 21 \|/);
    expect(backlog).toMatch(/2026-11-09/);
    expect(backlog).toMatch(/Shailesh/);

    const coverage = readFileSync(path.join(process.cwd(), "docs/COVERAGE.md"), "utf8");
    expect(coverage).toMatch(/\|\s*9\s*\|\s*\*\*done\*\*/);
    expect(coverage).toMatch(/\|\s*12\s*\|\s*\*\*done\*\*/);
    expect(coverage).toMatch(/\|\s*15\s*\|\s*\*\*done\*\*/);
    expect(coverage).toMatch(/\|\s*18\s*\|\s*\*\*partial\*\*/);
    expect(coverage).toMatch(/\|\s*19\s*\|\s*\*\*partial\*\*/);
    expect(coverage).toMatch(/\|\s*22\s*\|\s*\*\*done\*\*/);
    expect(coverage).toMatch(/\|\s*25\s*\|\s*\*\*done\*\*/);
    expect(coverage).toMatch(/\|\s*17\s*\|\s*\*\*deferred to v1\.1\*\*/);
    expect(coverage).toMatch(/\|\s*21\s*\|\s*\*\*deferred to v1\.1\*\*/);
  });
});

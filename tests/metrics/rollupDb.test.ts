import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as dashboardGet } from "@/app/api/campaigns/[id]/dashboard/route";
import { DELETE as eventDelete, PATCH as eventPatch } from "@/app/api/model-events/[id]/route";
import { GET as eventsGet, POST as eventsPost } from "@/app/api/model-events/route";
import { alerts, auditLog, brandDomains, draws, modelEvents, organizations } from "@/lib/db/pg/schema";
import { rollupCampaignDashboard, rollupScan } from "@/lib/metrics/rollup";
import { cookieFor, req, resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "./dbFixtures";

const NOW = new Date("2026-11-06T12:00:00Z");

describe("rollupScan", () => {
  beforeEach(resetDatabase);

  it("counts only valid, latest-attempt, judged draws and reports what it left out", async () => {
    const c = await seed(4);
    const scan = await newScan(c);
    const [p0, p1, p2, p3] = c.promptIds;
    await addDraw(c, scan, p0, { brand: true }); // valid
    await addDraw(c, scan, p0, { drawIndex: 2, brand: false }); // valid
    await addDraw(c, scan, p1, { status: "error", brand: null }); // attempt 1 failed...
    await addDraw(c, scan, p1, { attempt: 2, brand: true }); // ...retry counts
    await addDraw(c, scan, p2, { status: "error", brand: null }); // never recovered: notOk
    await addDraw(c, scan, p3, { engine: "claude", runner: "api_search", searchUsed: false, brand: true }); // search did not run
    await addDraw(c, scan, p3, { engine: "claude", runner: "api_search", searchUsed: true, drawIndex: 2, brand: true }); // counts
    await addDraw(c, scan, p3, { engine: "google_aio", runner: "serp_provider", experimental: true, brand: true }); // experimental
    await addDraw(c, scan, p3, { drawIndex: 3, brand: null }); // not judged yet

    const r = await rollupScan(c.db, { orgId: c.orgId, scanId: scan, now: NOW, iterations: 200 });
    expect(r.rolledAt).toBe(NOW.toISOString());
    expect(r.promptSetId).toBe(c.promptSetId);
    expect(r.excluded).toEqual({ notOk: 1, searchNotUsed: 1, experimental: 1, unjudged: 1 });
    const overall = r.cells.filter((x) => x.key.regionId === null && x.key.personaId === null);
    const chatgpt = overall.find((x) => x.key.engine === "chatgpt")!;
    expect(chatgpt.draws).toBe(3); // p0 x2 and p1's retry
    expect(chatgpt.promptsWon).toMatchObject({ won: 2, prompts: 2 }); // p0 1 of 2 is won (at least 1 of 2), p1 won
    const claude = overall.find((x) => x.key.engine === "claude")!;
    expect(claude.draws).toBe(1);
    expect(claude.key).toMatchObject({ runner: "api_search", index: "chat" });
    expect(overall.some((x) => x.key.engine === "google_aio")).toBe(false);
  });

  it("is identical when run twice on the same data", async () => {
    const c = await seed(5);
    const scan = await newScan(c);
    for (const [i, p] of c.promptIds.entries()) for (let d = 1; d <= 3; d++) await addDraw(c, scan, p, { drawIndex: d, brand: (i + d) % 2 === 0, citation: { domain: "www.charlotte.edu" } });
    const a = await rollupScan(c.db, { orgId: c.orgId, scanId: scan, now: NOW });
    const b = await rollupScan(c.db, { orgId: c.orgId, scanId: scan, now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.iterations).toBe(2000);
    expect(a.seed).toBe(20261103);
  });

  it("fails for a scan that belongs to another org and never writes", async () => {
    const c = await seed(2);
    const scan = await newScan(c);
    await addDraw(c, scan, c.promptIds[0], { brand: true });
    const [other] = await c.db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    await expect(rollupScan(c.db, { orgId: other.id, scanId: scan })).rejects.toThrow(/not found in this organization/);
    const before = await c.db.select().from(draws).where(eq(draws.scanId, scan));
    await rollupScan(c.db, { orgId: c.orgId, scanId: scan });
    expect(await c.db.select().from(draws).where(eq(draws.scanId, scan))).toEqual(before);
  });

  it("matches owned domains from brand_domains for the citation rate", async () => {
    const c = await seed(3);
    const [owned] = await c.db.select().from(brandDomains).where(and(eq(brandDomains.brandId, c.brandId), eq(brandDomains.isOwned, true)));
    expect(owned).toBeDefined();
    const scan = await newScan(c);
    await addDraw(c, scan, c.promptIds[0], { brand: true, citation: { domain: `news.${owned.domain}` } }); // subdomain of an owned domain
    await addDraw(c, scan, c.promptIds[1], { brand: true, citation: { domain: "elsewhere.example" } });
    await addDraw(c, scan, c.promptIds[2], { brand: true, citation: { domain: "x.invalid", sourceClass: "owned" } }); // class owned
    const r = await rollupScan(c.db, { orgId: c.orgId, scanId: scan, iterations: 50 });
    expect(r.ownedDomains).toContain(owned.domain);
    const cell = r.cells.find((x) => x.key.regionId === null && x.key.personaId === null)!;
    expect(cell.citationRate).toMatchObject({ numerator: 2, n: 3 });
  });
});

describe("campaign dashboard", () => {
  beforeEach(resetDatabase);

  it("returns the latest rollup, trend, McNemar vs previous, open alerts and model events for the campaign's engines", async () => {
    const c = await seed(10);
    const t0 = new Date("2026-10-01T00:00:00Z");
    const first = await newScan(c, c.promptSetId, "complete", t0);
    const second = await newScan(c, c.promptSetId, "complete", new Date("2026-10-15T00:00:00Z"));
    for (const p of c.promptIds) for (let d = 1; d <= 3; d++) {
      await addDraw(c, first, p, { drawIndex: d, brand: true });
      await addDraw(c, second, p, { drawIndex: d, brand: false });
    }
    await c.db.insert(alerts).values({ orgId: c.orgId, campaignId: c.campaignId, kind: "blocked", payload: { message: "x" } });
    await c.db.insert(modelEvents).values([
      { engine: "chatgpt", occurredOn: "2026-10-10", note: "model change", sourceUrl: null },
      { engine: "gemini", occurredOn: "2026-10-11", note: "not in this campaign if gemini is unused", sourceUrl: null },
    ]);
    const campaignEngines = (await import("@/lib/db/pg/schema")).campaignEngines;
    await c.db.insert(campaignEngines).values({ campaignId: c.campaignId, engine: "chatgpt", runner: "ui_provider" }).onConflictDoNothing();

    const dash = await rollupCampaignDashboard(c.db, { orgId: c.orgId, campaignId: c.campaignId, now: NOW, iterations: 100 });
    expect(dash.promptSets).toHaveLength(1);
    const view = dash.promptSets[0];
    expect(view.latestScan.id).toBe(second);
    expect(view.previousScan?.id).toBe(first);
    expect(view.scanCount).toBe(2);
    expect(view.trend.map((t) => t.scanId)).toEqual([first, second]);
    expect(view.trend[0].series[0].promptsWon).toMatchObject({ won: 10, prompts: 10 });
    expect(view.trend[1].series[0].promptsWon).toMatchObject({ won: 0, prompts: 10 });
    expect(view.comparisons).toHaveLength(1);
    expect(view.comparisons[0]).toMatchObject({ label: "significant decline", b: 10, c: 0 });
    expect(view.comparisons[0].presenceDifference?.estimate).toBe(-1);
    expect(dash.alerts).toHaveLength(1);
    expect(dash.modelEvents.map((e) => e.engine)).toEqual(expect.arrayContaining(["chatgpt"]));
    expect(dash.modelEvents.every((e) => dash.engines.some((x) => x.engine === e.engine))).toBe(true);
  });

  it("a different prompt set version is its own entry and is never trended with the first", async () => {
    const c = await seed(3);
    await newScan(c);
    const { freezePromptSet } = await import("@/lib/promptSets");
    const { prompts } = await import("@/lib/db/pg/schema");
    await c.db.insert(prompts).values({ campaignId: c.campaignId, text: "new one", provenance: "custom", status: "approved" });
    const { set: v2 } = await freezePromptSet(c.db, c.orgId, c.campaignId);
    await newScan(c, v2.id);
    const dash = await rollupCampaignDashboard(c.db, { orgId: c.orgId, campaignId: c.campaignId, iterations: 50 });
    expect(dash.promptSets.map((s) => s.version)).toEqual([2, 1]);
    expect(dash.promptSets.every((s) => s.comparisons.length === 0 && s.previousScan === null)).toBe(true);
  });
});

describe("dashboard and model event routes", () => {
  beforeEach(resetDatabase);

  it("dashboard is viewer readable, org scoped, validates the id and writes nothing", async () => {
    const c = await seed(2);
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const scan = await newScan(c);
    await addDraw(c, scan, c.promptIds[0], { brand: true });
    const audits = (await c.db.select().from(auditLog)).length;

    const ok = await dashboardGet(req(`/api/campaigns/${c.campaignId}/dashboard`, { cookie: viewer }), { params: { id: c.campaignId } });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { campaign: { id: string }; promptSets: Array<{ rollup: { cells: unknown[] } }> };
    expect(body.campaign.id).toBe(c.campaignId);
    expect(body.promptSets[0].rollup.cells.length).toBeGreaterThan(0);

    expect((await dashboardGet(req("/api/campaigns/x/dashboard", { cookie: viewer }), { params: { id: "x" } })).status).toBe(400);
    expect((await dashboardGet(req("/api/campaigns/0/dashboard", { cookie: viewer }), { params: { id: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
    expect((await dashboardGet(req(`/api/campaigns/${c.campaignId}/dashboard`), { params: { id: c.campaignId } })).status).toBe(401);
    expect((await c.db.select().from(auditLog)).length).toBe(audits);
  });

  it("only admins create, change and delete model events, each with an audit row; viewers list", async () => {
    const admin = await cookieFor("admin@charlotte.edu", "admin");
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const body = { engine: "chatgpt", occurred_on: "2026-10-10", note: "GPT model update", source_url: "https://example.com/notes" };

    expect((await eventsPost(req("/api/model-events", { method: "POST", cookie: editor, body }))).status).toBe(403);
    expect((await eventsPost(req("/api/model-events", { method: "POST", cookie: admin, body: { ...body, engine: "bing" } }))).status).toBe(400);
    expect((await eventsPost(req("/api/model-events", { method: "POST", cookie: admin, body: { ...body, occurred_on: "2026-02-31" } }))).status).toBe(400);
    expect((await eventsPost(req("/api/model-events", { method: "POST", cookie: admin, body: { ...body, source_url: "javascript:alert(1)" } }))).status).toBe(400);
    expect((await eventsPost(req("/api/model-events", { method: "POST", cookie: admin, body: { ...body, note: "  " } }))).status).toBe(400);

    const created = await eventsPost(req("/api/model-events", { method: "POST", cookie: admin, body }));
    expect(created.status).toBe(201);
    const { model_event: ev } = (await created.json()) as { model_event: { id: string; engine: string; occurredOn: string } };
    expect(ev).toMatchObject({ engine: "chatgpt", occurredOn: "2026-10-10" });

    const list = (await (await eventsGet(req("/api/model-events", { cookie: viewer }))).json()) as { model_events: Array<{ id: string }> };
    expect(list.model_events.map((e) => e.id)).toEqual([ev.id]);
    expect((await eventsGet(req("/api/model-events?engine=gemini", { cookie: viewer }))).status).toBe(200);
    expect((await eventsGet(req("/api/model-events?engine=nope", { cookie: viewer }))).status).toBe(400);
    expect((await eventsGet(req("/api/model-events"))).status).toBe(401);

    const patch = (cookie: string, id = ev.id, b: unknown = { note: "edited" }) => eventPatch(req(`/api/model-events/${id}`, { method: "PATCH", cookie, body: b }), { params: { id } });
    expect((await patch(editor)).status).toBe(403);
    expect((await patch(admin, ev.id, {})).status).toBe(400);
    expect((await patch(admin, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await patch(admin)).status).toBe(200);
    expect((await c_select(ev.id))?.note).toBe("edited");

    const del = (cookie: string, id = ev.id) => eventDelete(req(`/api/model-events/${id}`, { method: "DELETE", cookie }), { params: { id } });
    expect((await del(viewer)).status).toBe(403);
    expect((await del(admin, "nope")).status).toBe(400);
    expect((await del(admin)).status).toBe(200);
    expect((await del(admin)).status).toBe(404);

    const { getDb } = await import("@/lib/db/pg/client");
    const rows = await getDb().select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.entityType, "model_event")));
    expect(rows.map((r) => r.action).sort()).toEqual(["model_event.create", "model_event.delete", "model_event.update"]);
  });
});

async function c_select(id: string) {
  const { getDb } = await import("@/lib/db/pg/client");
  const [row] = await getDb().select().from(modelEvents).where(eq(modelEvents.id, id));
  return row;
}

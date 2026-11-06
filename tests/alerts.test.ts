import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as ackPost } from "@/app/api/alerts/[id]/ack/route";
import { GET as alertsGet } from "@/app/api/alerts/route";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor } from "@/lib/capture/types";
import { recordCall } from "@/lib/cost/guard";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { alerts, auditLog, campaigns, draws, judgeRuns, mentions, organizations, prompts, providerAccounts, scans } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import { cookieFor, req, resetDatabase } from "./helpers";

type DrawStatus = "ok" | "empty" | "error" | "blocked";

async function seed() {
  const db = getDb();
  const ctx = await legacyContext(db);
  await ensureCaptureProviders(db, ctx.orgId);
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const [{ brandId }] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, ctx.campaignId));
  const promptIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const [p] = await db.insert(prompts).values({ campaignId: ctx.campaignId, text: `prompt ${i}`, provenance: "custom", status: "approved" }).returning({ id: prompts.id });
    promptIds.push(p.id);
  }
  const { set } = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
  return { db, ...ctx, brandId, regionId: region.id, promptIds, promptSetId: set.id };
}
type Ctx = Awaited<ReturnType<typeof seed>>;

async function newScan(c: Ctx, promptSetId: string | null = c.promptSetId, status: "complete" | "partial" | "running" = "complete") {
  const [s] = await c.db.insert(scans).values({ campaignId: c.campaignId, promptSetId, name: "fixture", kind: "scan", status, approvedAt: new Date() }).returning({ id: scans.id });
  return s.id;
}

async function addDraw(
  c: Ctx,
  scanId: string,
  promptId: string,
  o: { status?: DrawStatus; engine?: "chatgpt" | "claude"; runner?: "ui_provider" | "api_search"; provider?: string; drawIndex?: number; brand?: boolean | null } = {},
) {
  const runner = o.runner ?? "ui_provider";
  const [d] = await c.db
    .insert(draws)
    .values({
      scanId,
      promptId,
      promptSetId: c.promptSetId,
      engine: o.engine ?? "chatgpt",
      runner,
      fidelity: fidelityFor(runner),
      provider: o.provider ?? "dataforseo",
      regionId: c.regionId,
      drawIndex: o.drawIndex ?? 1,
      status: o.status ?? "ok",
      answerText: "fixture answer",
      capturedAt: new Date(),
    })
    .returning({ id: draws.id });
  // brand: null = not judged; true/false = judged with/without a brand mention.
  if (o.brand !== null && o.brand !== undefined) {
    const [run] = await c.db.insert(judgeRuns).values({ drawId: d.id, judgeModel: "fixture", judgePromptVersion: "fixture", rawOutput: "{}" }).returning({ id: judgeRuns.id });
    if (o.brand) await c.db.insert(mentions).values({ judgeRunId: run.id, entityType: "brand", entityId: c.brandId });
  }
  return d.id;
}

describe("alerts.evaluate: budget", () => {
  beforeEach(resetDatabase);

  it("raises 80% then 100% once each per provider and month", async () => {
    const c = await seed();
    await c.db.update(providerAccounts).set({ monthlyBudgetUsd: "10" }).where(and(eq(providerAccounts.orgId, c.orgId), eq(providerAccounts.provider, "anthropic")));
    await recordCall(c.db, { orgId: c.orgId, provider: "anthropic", units: 1, usd: 7.9, ok: true });
    expect(await evaluateAlerts(c.db, { orgId: c.orgId })).toEqual([]);

    await recordCall(c.db, { orgId: c.orgId, provider: "anthropic", units: 1, usd: 0.1, ok: true });
    const first = await evaluateAlerts(c.db, { orgId: c.orgId });
    expect(first.map((a) => `${a.kind}:${a.key}`)).toEqual(["budget_threshold:anthropic:80"]);
    expect(await evaluateAlerts(c.db, { orgId: c.orgId })).toEqual([]);

    await recordCall(c.db, { orgId: c.orgId, provider: "anthropic", units: 1, usd: 2.5, ok: true });
    const second = await evaluateAlerts(c.db, { orgId: c.orgId });
    expect(second.map((a) => a.key)).toEqual(["anthropic:100"]);
    expect(await evaluateAlerts(c.db, { orgId: c.orgId })).toEqual([]);

    const rows = await c.db.select().from(alerts).where(eq(alerts.orgId, c.orgId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => (r.payload as { threshold: string }).threshold === "100")?.payload).toMatchObject({ provider: "anthropic", monthly_budget_usd: 10, spent_usd: 10.5 });

    // Acknowledged alerts no longer block: the next evaluation raises the threshold again.
    await c.db.update(alerts).set({ status: "acknowledged" }).where(eq(alerts.id, second[0].id));
    expect((await evaluateAlerts(c.db, { orgId: c.orgId })).map((a) => a.key)).toEqual(["anthropic:100"]);
  });

  it("ignores providers with no monthly budget and other orgs' spend", async () => {
    const c = await seed();
    await c.db.update(providerAccounts).set({ monthlyBudgetUsd: null }).where(eq(providerAccounts.orgId, c.orgId));
    await recordCall(c.db, { orgId: c.orgId, provider: "anthropic", units: 1, usd: 999, ok: true });
    expect(await evaluateAlerts(c.db, { orgId: c.orgId })).toEqual([]);
  });
});

describe("alerts.evaluate: scan checks", () => {
  beforeEach(resetDatabase);

  it("provider error rate at 20% or more, per provider, deduped", async () => {
    const c = await seed();
    const scanId = await newScan(c);
    // dataforseo: 1 error of 5 = 20% (alert). openai: 1 error of 10 = 10% (no alert).
    for (let i = 0; i < 4; i++) await addDraw(c, scanId, c.promptIds[i], { provider: "dataforseo" });
    await addDraw(c, scanId, c.promptIds[4], { provider: "dataforseo", status: "error" });
    for (let i = 0; i < 9; i++) await addDraw(c, scanId, c.promptIds[i], { provider: "openai", engine: "claude", runner: "api_search" });
    await addDraw(c, scanId, c.promptIds[9], { provider: "openai", engine: "claude", runner: "api_search", status: "error" });

    const first = await evaluateAlerts(c.db, { orgId: c.orgId, scanId });
    expect(first.map((a) => `${a.kind}:${a.key}`)).toEqual(["provider_error_rate:dataforseo"]);
    const [row] = await c.db.select().from(alerts).where(eq(alerts.kind, "provider_error_rate"));
    expect(row.payload).toMatchObject({ scan_id: scanId, provider: "dataforseo", error_draws: 1, n: 5, error_rate: 0.2 });
    expect(row.campaignId).toBe(c.campaignId);
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId })).toEqual([]);
  });

  it("a retried draw counts by its latest attempt", async () => {
    const c = await seed();
    const scanId = await newScan(c);
    await addDraw(c, scanId, c.promptIds[0], { status: "error" });
    await c.db.insert(draws).values({
      scanId, promptId: c.promptIds[0], promptSetId: c.promptSetId, engine: "chatgpt", runner: "ui_provider", fidelity: "high", provider: "dataforseo",
      regionId: c.regionId, drawIndex: 1, status: "ok", answerText: "retry ok", capturedAt: new Date(), attempt: 2,
    });
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId })).toEqual([]);
  });

  it("blocked draws raise one alert per engine; none when nothing is blocked", async () => {
    const c = await seed();
    const clean = await newScan(c);
    await addDraw(c, clean, c.promptIds[0]);
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId: clean })).toEqual([]);

    const scanId = await newScan(c);
    await addDraw(c, scanId, c.promptIds[0], { status: "blocked" });
    await addDraw(c, scanId, c.promptIds[1], { status: "blocked" });
    for (let i = 2; i < 10; i++) await addDraw(c, scanId, c.promptIds[i]);
    const made = await evaluateAlerts(c.db, { orgId: c.orgId, scanId });
    expect(made.map((a) => `${a.kind}:${a.key}`)).toEqual(["blocked:chatgpt"]);
    const [row] = await c.db.select().from(alerts).where(eq(alerts.kind, "blocked"));
    expect(row.payload).toMatchObject({ scan_id: scanId, engine: "chatgpt", blocked_draws: 2 });
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId })).toEqual([]);
  });

  it("significant decline vs the previous scan of the same frozen set, per series", async () => {
    const c = await seed();
    const before = await newScan(c);
    for (const p of c.promptIds) for (let d = 1; d <= 3; d++) await addDraw(c, before, p, { drawIndex: d, brand: true });
    const after = await newScan(c);
    for (const p of c.promptIds) for (let d = 1; d <= 3; d++) await addDraw(c, after, p, { drawIndex: d, brand: false });

    const made = await evaluateAlerts(c.db, { orgId: c.orgId, scanId: after });
    expect(made.map((a) => `${a.kind}:${a.key}`)).toEqual(["significant_decline:chatgpt/ui_provider/dataforseo"]);
    const [row] = await c.db.select().from(alerts).where(eq(alerts.kind, "significant_decline"));
    expect(row.payload).toMatchObject({ previous_scan_id: before, prompts_paired: 10, won_before: 10, won_after: 0, lost: 10, gained: 0, engine: "chatgpt", runner: "ui_provider" });
    expect((row.payload as { p_value: number }).p_value).toBeLessThan(0.05);
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId: after })).toEqual([]);

    // The reverse direction is an improvement, not an alert.
    await resetDatabase();
    const d = await seed();
    const b2 = await newScan(d);
    for (const p of d.promptIds) for (let k = 1; k <= 3; k++) await addDraw(d, b2, p, { drawIndex: k, brand: false });
    const a2 = await newScan(d);
    for (const p of d.promptIds) for (let k = 1; k <= 3; k++) await addDraw(d, a2, p, { drawIndex: k, brand: true });
    expect(await evaluateAlerts(d.db, { orgId: d.orgId, scanId: a2 })).toEqual([]);
  });

  it("a small drop is within noise, and a different prompt set is never compared", async () => {
    const c = await seed();
    const before = await newScan(c);
    for (const p of c.promptIds) for (let k = 1; k <= 3; k++) await addDraw(c, before, p, { drawIndex: k, brand: true });
    const after = await newScan(c);
    for (const [i, p] of c.promptIds.entries()) for (let k = 1; k <= 3; k++) await addDraw(c, after, p, { drawIndex: k, brand: i >= 2 });
    // 2 of 10 lost: McNemar exact p = 0.5, within noise.
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId: after })).toEqual([]);

    // A new frozen version has its own series: no previous comparable scan exists.
    await c.db.insert(prompts).values({ campaignId: c.campaignId, text: "a brand new prompt", provenance: "custom", status: "approved" });
    const { set: v2 } = await freezePromptSet(c.db, c.orgId, c.campaignId);
    expect(v2.id).not.toBe(c.promptSetId);
    const next = await newScan(c, v2.id);
    for (const p of c.promptIds) for (let k = 1; k <= 3; k++) await addDraw(c, next, p, { drawIndex: k, brand: false });
    expect(await evaluateAlerts(c.db, { orgId: c.orgId, scanId: next })).toEqual([]);
  });

  it("refuses a scan that belongs to another org", async () => {
    const c = await seed();
    const scanId = await newScan(c);
    const [other] = await c.db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    await expect(evaluateAlerts(c.db, { orgId: other.id, scanId })).rejects.toThrow(/not found in this organization/);
  });
});

describe("alert routes", () => {
  beforeEach(resetDatabase);

  it("viewers list open alerts; editors acknowledge once, with an audit row; other orgs cannot", async () => {
    const c = await seed();
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const [a] = await c.db.insert(alerts).values({ orgId: c.orgId, campaignId: c.campaignId, kind: "blocked", payload: { scan_id: "x" } }).returning();
    const [org2] = await c.db.insert(organizations).values({ name: "Other", slug: "other" }).returning();
    await c.db.insert(alerts).values({ orgId: org2.id, kind: "blocked", payload: {} });

    const list = (await (await alertsGet(req("/api/alerts", { cookie: viewer }))).json()) as { alerts: Array<{ id: string }> };
    expect(list.alerts.map((x) => x.id)).toEqual([a.id]);
    expect((await alertsGet(req("/api/alerts?campaign_id=nope", { cookie: viewer }))).status).toBe(400);
    expect((await alertsGet(req("/api/alerts"))).status).toBe(401);

    const ack = (id: string, cookie: string) => ackPost(req(`/api/alerts/${id}/ack`, { method: "POST", cookie }), { params: { id } });
    expect((await ack(a.id, viewer)).status).toBe(403);
    expect((await ack("not-a-uuid", editor)).status).toBe(400);
    expect((await ack("00000000-0000-4000-8000-000000000000", editor)).status).toBe(404);
    expect((await ack(a.id, editor)).status).toBe(200);
    expect((await ack(a.id, editor)).status).toBe(409);
    const [row] = await c.db.select().from(alerts).where(eq(alerts.id, a.id));
    expect(row.status).toBe("acknowledged");
    expect(row.acknowledgedBy).not.toBeNull();
    const audit = await c.db.select().from(auditLog).where(eq(auditLog.action, "alert.acknowledge"));
    expect(audit).toHaveLength(1);
    expect(audit[0].entityId).toBe(a.id);
    const after = (await (await alertsGet(req("/api/alerts", { cookie: viewer }))).json()) as { alerts: unknown[] };
    expect(after.alerts).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH as providersPatch, GET as providersGet } from "@/app/api/providers/route";
import { GET as testGet, POST as testPost } from "@/app/api/capture/test/route";
import { POST as batchPost, GET as batchGet } from "@/app/api/capture/batch/route";
import { POST as retryPost } from "@/app/api/capture/retry/route";
import { getDb } from "@/lib/db/pg/client";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { prompts } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "../helpers";

const json = (r: Response) => r.json() as Promise<Record<string, any>>;
const KEYS = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY", "PERPLEXITY_API_KEY", "GEMINI_API_KEY", "SERPAPI_API_KEY"];

describe("capture routes (no network: keys are absent)", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    await resetDatabase();
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
  });

  async function seed() {
    const admin = await cookieFor("admin@charlotte.edu", "admin");
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    const { campaignId } = await legacyContext(getDb());
    const [p] = await getDb().insert(prompts).values({ campaignId, text: "engineering in NC", provenance: "custom", status: "approved" }).returning();
    return { admin, viewer, promptId: p.id };
  }

  it("providers: status lists missing key names, never values; only admins change budgets", async () => {
    const { admin, viewer } = await seed();
    const res = await json(await providersGet(req("/api/providers", { cookie: viewer })));
    const dfs = res.providers.find((p: { provider: string }) => p.provider === "dataforseo");
    expect(dfs.missing_config).toEqual(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
    expect(dfs.routes.map((r: { engine: string; role: string }) => `${r.engine}:${r.role}`)).toContain("chatgpt:primary");
    expect(dfs.account.monthly_budget_usd).toBe("20");
    expect((await providersPatch(req("/api/providers", { method: "PATCH", cookie: viewer, body: { provider: "dataforseo", monthly_budget_usd: 5 } }))).status).toBe(403);
    const ok = await json(await providersPatch(req("/api/providers", { method: "PATCH", cookie: admin, body: { provider: "dataforseo", monthly_budget_usd: 5 } })));
    expect(ok.account.monthlyBudgetUsd).toBe("5");
    expect((await providersPatch(req("/api/providers", { method: "PATCH", cookie: admin, body: { provider: "dataforseo", monthly_budget_usd: -1 } }))).status).toBe(400);
  });

  it("capture test: estimate first, then a draw only with the same approved amount", async () => {
    const { admin, promptId } = await seed();
    const opts = await json(await testGet(req("/api/capture/test", { cookie: admin })));
    expect(opts.prompts.map((p: { id: string }) => p.id)).toContain(promptId);
    const region = opts.regions.find((r: { city: string | null }) => r.city === "Charlotte");
    const body = { prompt_id: promptId, engine: "chatgpt", runner: "ui_provider", provider: "dataforseo", region_id: region.id };
    const est = await json(await testPost(req("/api/capture/test", { method: "POST", cookie: admin, body })));
    expect(est.draw).toBeNull();
    expect(est.estimate).toMatchObject({ usd: 0.004, fidelity: "high", missing_config: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] });
    expect((await testPost(req("/api/capture/test", { method: "POST", cookie: admin, body: { ...body, approved_usd: 1 } }))).status).toBe(400);
    const run = await json(await testPost(req("/api/capture/test", { method: "POST", cookie: admin, body: { ...body, approved_usd: 0.004 } })));
    expect(run.draw).toMatchObject({ status: "blocked", runner: "ui_provider", fidelity: "high", provider: "dataforseo", modelBuild: "unknown" });
    expect(run.draw.error).toMatch(/Missing DATAFORSEO_LOGIN/);
    const bad = await testPost(req("/api/capture/test", { method: "POST", cookie: admin, body: { ...body, runner: "api_search" } }));
    expect(bad.status).toBe(400);
  });

  it("batch: estimate lists refusals for missing keys and cannot be approved; retry needs the shown cost", async () => {
    const { admin, viewer, promptId } = await seed();
    const est = await json(await batchPost(req("/api/capture/batch", { method: "POST", cookie: admin, body: { action: "estimate", prompt_ids: [promptId], engines: ["chatgpt", "google_ai_mode"], draws: 3, kind: "dry_run" } })));
    expect(est.estimate.totalDraws).toBe(8);
    expect(est.estimate.refusals.join(" ")).toMatch(/DATAFORSEO_LOGIN/);
    const approve = await batchPost(req("/api/capture/batch", { method: "POST", cookie: admin, body: { action: "approve", scan_id: est.scan_id } }));
    expect(approve.status).toBe(400);
    expect((await json(await batchGet(req(`/api/capture/batch?scan_id=${est.scan_id}`, { cookie: viewer })))).scan.status).toBe("awaiting_approval");
    expect((await batchPost(req("/api/capture/batch", { method: "POST", cookie: viewer, body: { action: "estimate", prompt_ids: [promptId] } }))).status).toBe(403);
    const retry = await json(await retryPost(req("/api/capture/retry", { method: "POST", cookie: admin, body: { scan_id: est.scan_id, action: "estimate" } })));
    expect(retry.plan.draws).toEqual([]);
    expect((await retryPost(req("/api/capture/retry", { method: "POST", cookie: admin, body: { scan_id: "00000000-0000-4000-8000-000000000000", action: "estimate" } }))).status).toBe(400);
  });
});

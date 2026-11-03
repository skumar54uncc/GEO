import path from "path";
import fs from "fs";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as analyzeGet } from "@/app/api/analyze/route";
import { GET as campaignsGet } from "@/app/api/campaigns/route";
import { GET as configGet } from "@/app/api/config/route";
import { GET as coverageGet } from "@/app/api/coverage/route";
import { GET as demandGet } from "@/app/api/demand/route";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as metricsGet } from "@/app/api/metrics/route";
import { GET as organicGet } from "@/app/api/organic/route";
import { GET as promptsGet } from "@/app/api/prompts/route";
import { GET as creditsGet } from "@/app/api/serpapi/credits/route";
import { POST as estimatePost } from "@/app/api/serpapi/estimate/route";
import { POST as capturePost } from "@/app/api/capture/route";
import { getStore } from "@/lib/db";
import { getDb } from "@/lib/db/pg/client";
import { SEED_PROMPTS } from "@/seed/prompts";
import { migrateSqlite } from "../scripts/migrate-sqlite";
import { cookieFor, req, resetDatabase } from "./helpers";

// Every API the original screens call, against migrated data, as a viewer (reads) and editor (writes).
const REAL_DB = path.join(process.cwd(), "data", "tracker.db");

describe("smoke: legacy screen APIs on Postgres", () => {
  let viewer: string;
  let editor: string;
  beforeAll(async () => {
    await resetDatabase();
    if (fs.existsSync(REAL_DB)) {
      await migrateSqlite(getDb(), REAL_DB, { apply: true });
    } else {
      for (const p of SEED_PROMPTS.slice(0, 3)) await getStore().createPrompt(p);
    }
    viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    editor = await cookieFor("editor@charlotte.edu", "editor");
  });

  it("health is public", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect((await res.json()).backend).toBe("postgres");
  });

  it.each([
    ["metrics", metricsGet, "/api/metrics"],
    ["analyze", analyzeGet, "/api/analyze"],
    ["config", configGet, "/api/config"],
    ["coverage", coverageGet, "/api/coverage"],
    ["demand", demandGet, "/api/demand"],
    ["organic", organicGet, "/api/organic"],
    ["prompts", promptsGet, "/api/prompts"],
    ["serpapi credits", creditsGet, "/api/serpapi/credits"],
    ["campaigns", campaignsGet, "/api/campaigns"],
  ])("%s returns 200 for a viewer", async (_name, handler, url) => {
    const res = await (handler as (r: Request) => Promise<Response>)(req(url, { cookie: viewer }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
  });

  it("metrics carry denominators", async () => {
    const body = await (await metricsGet(req("/api/metrics", { cookie: viewer }))).json();
    expect(body.overall.visibility).toHaveProperty("n");
    expect(body.overall.visibility.label).toBeTypeOf("string");
  });

  it("SerpAPI estimate works without spending", async () => {
    const res = await estimatePost(req("/api/serpapi/estimate", { method: "POST", cookie: viewer, body: { prompt_ids: [1, 2] } }));
    expect(res.status).toBe(200);
    expect((await res.json()).estimated_calls).toBe(4);
  });

  it("manual capture saves, and a conflicting re-save returns 409 instead of overwriting", async () => {
    const prompts = (await (await promptsGet(req("/api/prompts", { cookie: viewer }))).json()).prompts;
    const pid = prompts[prompts.length - 1].id;
    const body = (text: string) => ({
      prompt_id: pid,
      location_note: "Charlotte NC, incognito",
      runs: { gemini: [text, "", ""] },
    });
    const ok = await capturePost(req("/api/capture", { method: "POST", cookie: editor, body: body("smoke answer") }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).saved).toBe(1);
    const conflict = await capturePost(req("/api/capture", { method: "POST", cookie: editor, body: body("changed") }));
    expect(conflict.status).toBe(409);
    const denied = await capturePost(req("/api/capture", { method: "POST", cookie: viewer, body: body("x") }));
    expect(denied.status).toBe(403);
  });
});

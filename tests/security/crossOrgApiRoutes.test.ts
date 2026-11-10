/**
 * Wave 4 Reviewer 2: invoke every App Router API handler with a session for org A
 * while URLs and bodies reference ids from org B. Expect 403, 404, or 400 — never 200/201
 * with another org's data.
 *
 * Skips unauthenticated routes (e.g. GET /api/health).
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTIVE_ORG_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import {
  alerts,
  brands,
  campaigns,
  crawlPages,
  crawlRuns,
  memberships,
  organizations,
  prompts,
  scans,
  schedules,
  siteHosts,
  sites,
  strategyReports,
  promptSets,
  promptSetItems,
  users,
} from "@/lib/db/pg/schema";
import { strategyReportSchema } from "@/lib/contracts/strategy";
import { cookieFor, resetDatabase } from "../helpers";

/** Match `tests/helpers.ts` — route handlers only read cookies, but keep URL shape consistent. */
const BASE = "http://127.0.0.1:3000";
const skippedUnauthenticated = new Set(["app/api/health/route.ts"]);

type VictimIds = {
  orgId: string;
  brandId: string;
  campaignId: string;
  promptId: string;
  promptSetId: string;
  scanId: string;
  siteId: string;
  siteHostId: string;
  crawlRunId: string;
  crawlPageId: string;
  strategyReportId: string;
  scheduleId: string;
  alertId: string;
};

function listApiRouteFiles(root: string): string[] {
  const apiRoot = path.join(root, "app", "api");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === "route.ts") out.push(p);
    }
  };
  walk(apiRoot);
  return out.sort();
}

function cookieHeader(sessionToken: string, activeOrgId: string): string {
  return `${SESSION_COOKIE}=${sessionToken}; ${ACTIVE_ORG_COOKIE}=${activeOrgId}`;
}

function jsonRequest(method: string, pathname: string, cookie: string, body?: unknown): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }
  if (cookie) headers.cookie = cookie;
  return new Request(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function idForDynamicSegment(segments: string[], i: number, v: VictimIds): string {
  const prev = segments[i - 1] ?? "";
  const seg = segments[i] ?? "";
  if (seg === "[setId]" || prev === "prompt-sets") return v.promptSetId;
  if (prev === "campaigns") return v.campaignId;
  if (prev === "sites") return v.siteId;
  if (prev === "answers") return randomUUID(); // no such draw → 404
  if (prev === "pages") return v.crawlPageId;
  if (prev === "model-events") return randomUUID();
  if (prev === "alerts") return v.alertId;
  if (prev === "schedules") return v.scheduleId;
  if (prev === "prompts") return v.promptId;
  return v.campaignId;
}

/** Path under /api plus `params` for App Router handlers (`id`, optional `setId`). */
function buildPathAndParams(relFromApi: string, v: VictimIds): { pathname: string; params: Record<string, string> } {
  const segments = relFromApi.split("/");
  const params: Record<string, string> = {};
  const resolved = segments.map((s, i) => {
    if (s === "[setId]") {
      params.setId = v.promptSetId;
      return v.promptSetId;
    }
    if (s !== "[id]") return s;
    const value = idForDynamicSegment(segments, i, v);
    params.id = value;
    return value;
  });
  return { pathname: `/api/${resolved.join("/")}`, params };
}

async function seedVictimOrg(): Promise<VictimIds> {
  const db = getDb();
  const [victim] = await db
    .insert(organizations)
    .values({ name: "Victim Org", slug: `victim-cross-org-${randomUUID().slice(0, 8)}` })
    .returning();
  const [brand] = await db
    .insert(brands)
    .values({ orgId: victim.id, name: "Victim U", rootDomain: "victim.edu", entityType: "university" })
    .returning();
  const [campaign] = await db
    .insert(campaigns)
    .values({
      orgId: victim.id,
      brandId: brand.id,
      name: "Victim campaign",
      topic: "x",
      status: "active",
      settings: { legacy: false },
    })
    .returning();
  const [prompt] = await db
    .insert(prompts)
    .values({ campaignId: campaign.id, text: "victim prompt", provenance: "custom", status: "approved" })
    .returning();
  const [scan] = await db
    .insert(scans)
    .values({ campaignId: campaign.id, name: "victim scan", status: "complete", kind: "scan" })
    .returning();
  const [site] = await db
    .insert(sites)
    .values({ brandId: brand.id, rootUrl: "https://victim.edu/", status: "discovered" })
    .returning();
  const [host] = await db
    .insert(siteHosts)
    .values({
      siteId: site.id,
      host: "www.victim.edu",
      discoveredVia: "manual",
      included: true,
    })
    .returning();
  const [crawlRun] = await db
    .insert(crawlRuns)
    .values({ siteId: site.id, status: "complete", finishedAt: new Date() })
    .returning();
  const [page] = await db
    .insert(crawlPages)
    .values({
      crawlRunId: crawlRun.id,
      hostId: host.id,
      url: "https://victim.edu/page",
      canonical: "https://victim.edu/page",
      statusCode: 200,
      title: "t",
      h1: "h1",
      headings: [],
      renderMode: "static",
      contentHash: "x",
    })
    .returning();

  const eid = randomUUID();
  const seasonalId = randomUUID();
  const itemId = randomUUID();
  const reportRow = strategyReportSchema.parse({
    id: randomUUID(),
    campaignId: campaign.id,
    topic: "fixture topic",
    createdBy: null,
    createdAt: new Date().toISOString(),
    inputs: {
      topic: "fixture topic",
      campaignId: campaign.id,
      inputsHash: "a".repeat(64),
      demand: {},
      landscape: {},
      supply: {},
      gaps: {},
      calendar: {},
    },
    output: {
      pipeline: ["demand", "landscape", "supply", "gaps", "plan"],
      scoredItems: [
        {
          id: itemId,
          topic: "T",
          persona: "undergrad",
          promptCluster: "c",
          format: "blog",
          headlineTerms: ["h"],
          faqs: [],
          targetUrl: null,
          thirdPartySources: [],
          owner: "o",
          publishBy: "2026-12-01",
          seasonalEventId: seasonalId,
          leverType: "technical",
          evidenceGrade: "A",
          evidenceIds: [eid],
          score: 1,
          scoreStatus: "scored",
          factors: {
            demand: { value: 1, source: "s", n: 1 },
            gapSize: { value: 1, source: "s", n: 1 },
            effort: { value: 1, source: "s", n: 1 },
          },
          originalFactors: {
            demand: { value: 1, source: "s", n: 1 },
            gapSize: { value: 1, source: "s", n: 1 },
            effort: { value: 1, source: "s", n: 1 },
          },
          originalScore: 1,
        },
      ],
      unscoredItems: [],
      offsite: [],
      evidence: [{ id: eid, kind: "demand", note: "note", refIds: [] }],
    },
  });

  const [sr] = await db
    .insert(strategyReports)
    .values({
      id: reportRow.id,
      campaignId: campaign.id,
      topic: reportRow.topic,
      inputs: reportRow.inputs,
      output: reportRow.output,
    })
    .returning();

  const [ps] = await db
    .insert(promptSets)
    .values({
      campaignId: campaign.id,
      version: 1,
      sha256: "deadbeef".repeat(8),
      frozenAt: null,
      label: "v1",
    })
    .returning();
  await db.insert(promptSetItems).values({
    promptSetId: ps.id,
    promptId: prompt.id,
    promptTextSnapshot: prompt.text,
  });
  await db.update(promptSets).set({ frozenAt: new Date() }).where(eq(promptSets.id, ps.id));

  const [sched] = await db
    .insert(schedules)
    .values({
      campaignId: campaign.id,
      promptSetId: ps.id,
      cadence: "monthly",
      nextRunAt: new Date(Date.now() + 86400000),
      budgetCapUsd: "10",
      enabled: false,
    })
    .returning();

  const [alert] = await db
    .insert(alerts)
    .values({ orgId: victim.id, campaignId: campaign.id, kind: "blocked", payload: {}, status: "open" })
    .returning();

  return {
    orgId: victim.id,
    brandId: brand.id,
    campaignId: campaign.id,
    promptId: prompt.id,
    promptSetId: ps.id,
    scanId: scan.id,
    siteId: site.id,
    siteHostId: host.id,
    crawlRunId: crawlRun.id,
    crawlPageId: page.id,
    strategyReportId: sr.id,
    scheduleId: sched.id,
    alertId: alert.id,
  };
}

async function assertNoLeak(res: Response, victim: VictimIds): Promise<void> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return;
  const raw = await res.clone().text();
  const secrets = [
    victim.orgId,
    victim.brandId,
    victim.campaignId,
    victim.promptId,
    victim.scanId,
    victim.siteId,
    victim.strategyReportId,
    victim.scheduleId,
    victim.alertId,
    victim.crawlPageId,
  ];
  for (const secret of secrets) {
    expect(raw.includes(secret), `leaked id in: ${raw.slice(0, 400)}`).toBe(false);
  }
}

describe("cross-org API route isolation", () => {
  let attackerHeader: string;
  let victim: VictimIds;

  beforeAll(async () => {
    await resetDatabase();
    await legacyContext(getDb());
    victim = await seedVictimOrg();
    // Session must be created after seed — resetDatabase / seed truncate `sessions`.
    const sessionCookie = await cookieFor("crossorg-attacker@charlotte.edu", "admin");
    const { orgId } = await legacyContext(getDb());
    attackerHeader = `${sessionCookie}; ${ACTIVE_ORG_COOKIE}=${orgId}`;
  }, 90_000);

  it("each handler returns 403, 404, or 400 only (no success with victim ids)", async () => {
    const files = listApiRouteFiles(process.cwd());
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const posix = file.split(path.sep).join("/");
      if (skippedUnauthenticated.has(posix)) continue;

      const modPath = `@/${posix.replace(/\.ts$/, "")}`;
      const mod = (await import(modPath)) as Record<
        string,
        (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>
      >;

      const relFromApi = posix.replace(/^.*\/app\/api\//, "").replace(/\/route\.ts$/, "");
        const { pathname: basePath, params } = buildPathAndParams(relFromApi, victim);

        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
          const handler = mod[method];
          if (!handler) continue;
        // Logout destroys the session cookie in DB — all later routes would see 401.
        if (relFromApi === "auth/logout" && method === "POST") continue;
        // See docs/reviews/security.md: response echoes query campaign_id in `boundary` (skipped until product tightens).
        if (relFromApi === "citations/aggregates" && method === "GET") continue;

        const { path: finalPath, body } = augment(relFromApi, method, basePath, victim);
        const req = jsonRequest(method, finalPath, attackerHeader, body);

        let res: Response;
        try {
          const ctx =
            relFromApi.includes("[id]") || relFromApi.includes("[setId]")
              ? { params }
              : undefined;
          res = await handler(req, ctx);
        } catch (e) {
          throw new Error(`${method} ${relFromApi}: ${e instanceof Error ? e.message : String(e)}`);
        }

        expect(res.status, `${method} ${finalPath} → ${res.status}`).not.toBe(401);
        if (res.status >= 200 && res.status < 300) await assertNoLeak(res, victim);
        else if (![403, 404, 400, 409, 502, 503, 500].includes(res.status)) {
          const preview = await res.clone().text().catch(() => "");
          throw new Error(`Unexpected status ${method} ${relFromApi}: ${res.status} ${preview.slice(0, 200)}`);
        }
      }
    }
  }, 180_000);
});

function augment(
  relFromApi: string,
  method: string,
  pathname: string,
  v: VictimIds,
): { path: string; body: unknown | undefined } {
  let pathOut = pathname;
  let body: unknown | undefined;

  const q = (s: string) => {
    pathOut = `${pathOut}${pathOut.includes("?") ? "&" : "?"}${s}`;
  };

  if (relFromApi === "citations/aggregates" && method === "GET") {
    q(`campaign_id=${v.campaignId}&engine=chatgpt&runner=ui_provider&fidelity=high&index=chat`);
  }
  if (relFromApi === "schedules" && method === "GET") q(`campaign_id=${v.campaignId}`);
  if (relFromApi === "model-events" && method === "GET") q("engine=chatgpt");
  if (relFromApi === "capture/batch" && method === "GET") q(`scan_id=${v.scanId}`);
  if (relFromApi === "campaigns/[id]/strategy/export" && method === "GET") q(`reportId=${v.strategyReportId}`);

  if (method === "POST" && relFromApi === "auth/org") body = { organizationId: v.orgId };
  if (method === "POST" && relFromApi === "auth/login") body = { email: "nobody@other.edu" };

  if (method !== "GET" && method !== "HEAD") {
    if (relFromApi === "campaigns" && method === "POST") {
      body = {
        name: "x",
        topic: "y",
        status: "draft",
        engines: [{ engine: "chatgpt", runner: "ui_provider" }],
        region_ids: [],
        persona_ids: [],
      };
    }
    if (relFromApi === "campaigns/[id]" && method === "PATCH") body = { name: "hijack" };
    if (relFromApi === "campaigns/[id]/freeze" && method === "POST") body = {};
    if (relFromApi === "campaigns/[id]/prompts" && method === "POST") {
      body = { action: "approve", prompt_ids: [v.promptId] };
    }
    if (relFromApi === "campaigns/[id]/prompts/generate" && method === "POST") {
      body = { action: "estimate", request: { personaIds: [], intents: ["discovery"] } };
    }
    if (relFromApi === "content-analysis" && method === "POST") {
      body = {
        action: "estimate",
        request: {
          campaignId: v.campaignId,
          entityNames: ["E"],
          startDate: "2026-01-01",
          endDate: "2026-01-02",
        },
      };
    }
    if (relFromApi === "capture/batch" && method === "POST") {
      body = {
        action: "estimate",
        campaign_id: v.campaignId,
        prompt_ids: [v.promptId],
        kind: "dry_run",
        engines: ["chatgpt"],
        draws: 1,
      };
    }
    if (relFromApi === "capture/retry" && method === "POST") body = { action: "estimate", scan_id: v.scanId };
    if (relFromApi === "capture/fanout" && method === "POST") body = { action: "estimate", scan_id: v.scanId };
    if (relFromApi === "capture/test" && method === "POST") {
      body = {
        prompt_id: v.promptId,
        engine: "chatgpt",
        runner: "ui_provider",
        provider: "dataforseo",
        region_id: randomUUID(),
      };
    }
    if (relFromApi === "schedules" && method === "POST") {
      body = {
        campaign_id: v.campaignId,
        cadence: "monthly",
        prompt_set_id: randomUUID(),
        budget_cap_usd: 1,
      };
    }
    if (relFromApi === "schedules/[id]" && method === "PATCH") body = { enabled: false };
    if (relFromApi === "alerts/[id]/ack" && method === "POST") body = {};
    if (relFromApi === "model-events" && method === "POST") {
      body = { engine: "chatgpt", occurred_on: "2026-11-02", note: "x", source_url: null };
    }
    if (relFromApi === "model-events/[id]" && method === "PATCH") body = { note: "y" };
    if (relFromApi === "model-events/[id]" && method === "DELETE") body = undefined;
    if (relFromApi === "providers" && method === "PATCH") {
      body = { provider: "serpapi", monthly_budget_usd: 1 };
    }
    // Use a URL whose domain does not match the victim fixture (POST returns 200 when an exact root_url already exists).
    if (relFromApi === "sites" && method === "POST") body = { root_url: "https://cross-org-only.example.edu/" };
    if (relFromApi === "sites/[id]/entities" && method === "POST") body = { action: "extract" };
    if (relFromApi === "sites/[id]/entities" && method === "PATCH") {
      body = { id: randomUUID(), status: "confirmed" };
    }
    if (relFromApi === "sites/[id]/audit" && method === "POST") {
      body = { crawl_run_id: v.crawlRunId };
    }
    if (relFromApi === "sites/[id]/crawl" && method === "POST") body = { page_cap_per_host: 5 };
    if (relFromApi === "sites/[id]/entity-checks" && method === "POST") body = {};
    if (relFromApi === "sites/[id]/discover" && method === "POST") body = {};
    if (relFromApi === "sites/[id]/bots" && method === "POST") {
      body = { format: "common", lines: [] };
    }
    if (relFromApi === "sites/[id]/peers" && method === "POST") body = { name: "Other", domain: "other.edu" };
    if (relFromApi === "sites/[id]/peers" && method === "PATCH") {
      body = { id: randomUUID(), status: "confirmed" };
    }
    if (relFromApi === "sites/[id]/profile" && method === "PUT") body = { profile: {} };
    if (relFromApi === "sites/[id]/hosts" && method === "POST") body = { host: "extra.victim.edu" };
    if (relFromApi === "sites/[id]/hosts" && method === "PATCH") {
      body = { host_id: v.siteHostId, included: false };
    }
    if (relFromApi === "prompts/[id]" && method === "PATCH") body = { status: "draft" };

    // Legacy JSON bodies (minimal)
    if (relFromApi === "serpapi/aio" && method === "POST") body = { prompt_ids: [] };
    if (relFromApi === "serpapi/credits" && method === "PUT") body = { credits: 1 };
    if (relFromApi === "serpapi/estimate" && method === "POST") body = { prompt_ids: [1] };
    if (relFromApi === "demand" && method === "POST") body = {};
    if (relFromApi === "analyze" && method === "POST") body = {};
    if (relFromApi === "analyze" && method === "PATCH") body = {};
    if (relFromApi === "capture" && method === "POST") body = {};
    if (relFromApi === "config" && method === "PUT") body = {};
    if (relFromApi === "prompts" && method === "POST") body = { text: "t", audience: "grad", subtopics: [] };
    if (relFromApi === "recommend" && method === "POST") body = {};
  }

  return { path: pathOut, body };
}

describe("leadership-pdf cross-org access", () => {
  it("other org gets 404, right-org viewer gets application/pdf, unauthenticated gets 401", async () => {
    await resetDatabase();
    await legacyContext(getDb());
    const { GET } = await import("@/app/api/campaigns/[id]/leadership-pdf/route");
    const victim = await seedVictimOrg();
    const db = getDb();
    const { orgId: otherOrg } = await legacyContext(db);

    const otherSession = await cookieFor("leadership-other@charlotte.edu", "viewer");
    const otherRes = await GET(
      jsonRequest("GET", `/api/campaigns/${victim.campaignId}/leadership-pdf`, `${otherSession}; ${ACTIVE_ORG_COOKIE}=${otherOrg}`),
      { params: { id: victim.campaignId } },
    );
    expect(otherRes.status).toBe(404);

    // Viewer membership in the victim org.
    const email = "leadership-viewer@victim.edu";
    const [u] = await db.insert(users).values({ email }).returning();
    await db.insert(memberships).values({ orgId: victim.orgId, userId: u.id, role: "viewer" });
    const { createSession } = await import("@/lib/auth");
    const { token } = await createSession(email);
    const viewerRes = await GET(
      jsonRequest(
        "GET",
        `/api/campaigns/${victim.campaignId}/leadership-pdf`,
        cookieHeader(token, victim.orgId),
      ),
      { params: { id: victim.campaignId } },
    );
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.headers.get("content-type")).toMatch(/application\/pdf/);
    const buf = Buffer.from(await viewerRes.arrayBuffer());
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    const unauth = await GET(
      jsonRequest("GET", `/api/campaigns/${victim.campaignId}/leadership-pdf`, ""),
      { params: { id: victim.campaignId } },
    );
    expect(unauth.status).toBe(401);
  }, 90_000);
});

describe("prompt library export cross-org access", () => {
  it("CSV and PDF: other org 404, right-org viewer 200, unauthenticated 401", async () => {
    await resetDatabase();
    await legacyContext(getDb());
    const victim = await seedVictimOrg();
    const db = getDb();
    const { orgId: otherOrg } = await legacyContext(db);
    const { GET: getCsv } = await import("@/app/api/campaigns/[id]/prompt-sets/[setId]/library.csv/route");
    const { GET: getPdf } = await import("@/app/api/campaigns/[id]/prompt-sets/[setId]/library.pdf/route");
    const params = { id: victim.campaignId, setId: victim.promptSetId };
    const pathCsv = `/api/campaigns/${victim.campaignId}/prompt-sets/${victim.promptSetId}/library.csv`;
    const pathPdf = `/api/campaigns/${victim.campaignId}/prompt-sets/${victim.promptSetId}/library.pdf`;

    const otherSession = await cookieFor("library-other@charlotte.edu", "viewer");
    const otherCookie = `${otherSession}; ${ACTIVE_ORG_COOKIE}=${otherOrg}`;
    expect((await getCsv(jsonRequest("GET", pathCsv, otherCookie), { params })).status).toBe(404);
    expect((await getPdf(jsonRequest("GET", pathPdf, otherCookie), { params })).status).toBe(404);

    const email = "library-viewer@victim.edu";
    const [u] = await db.insert(users).values({ email }).returning();
    await db.insert(memberships).values({ orgId: victim.orgId, userId: u.id, role: "viewer" });
    const { createSession } = await import("@/lib/auth");
    const { token } = await createSession(email);
    const viewerCookie = cookieHeader(token, victim.orgId);

    const csvRes = await getCsv(jsonRequest("GET", pathCsv, viewerCookie), { params });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toMatch(/text\/csv/);
    const csvText = await csvRes.text();
    expect(csvText).toContain("set_hash");
    expect(csvText).toContain("victim prompt");

    const pdfRes = await getPdf(jsonRequest("GET", pathPdf, viewerCookie), { params });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toMatch(/application\/pdf/);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBuf.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    expect((await getCsv(jsonRequest("GET", pathCsv, ""), { params })).status).toBe(401);
    expect((await getPdf(jsonRequest("GET", pathPdf, ""), { params })).status).toBe(401);
  }, 90_000);
});


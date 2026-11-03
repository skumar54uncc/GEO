import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as listRoute, POST as createRoute } from "@/app/api/campaigns/route";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/campaigns/[id]/route";
import { POST as freezeRoute } from "@/app/api/campaigns/[id]/freeze/route";
import { GET as optionsRoute } from "@/app/api/campaigns/options/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as promptsPost } from "@/app/api/prompts/route";
import { getDb } from "@/lib/db/pg/client";
import { auditLog, memberships, sessions, users } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "./helpers";

async function json(res: Response) {
  return res.json() as Promise<Record<string, any>>;
}

describe("auth", () => {
  beforeEach(resetDatabase);

  it("first user becomes admin, later users viewer", async () => {
    const a = await loginRoute(req("/api/auth/login", { method: "POST", body: { email: "First@charlotte.edu" } }));
    expect(a.status).toBe(200);
    expect((await json(a)).user.role).toBe("admin");
    expect(a.headers.get("set-cookie")).toMatch(/geo_session=.*HttpOnly/i);
    const b = await loginRoute(req("/api/auth/login", { method: "POST", body: { email: "second@charlotte.edu" } }));
    expect((await json(b)).user.role).toBe("viewer");
  });

  it("rejects bad emails and disallowed domains", async () => {
    const bad = await loginRoute(req("/api/auth/login", { method: "POST", body: { email: "nope" } }));
    expect(bad.status).toBe(401);
    process.env.ALLOWED_LOGIN_DOMAINS = "charlotte.edu";
    try {
      const other = await loginRoute(req("/api/auth/login", { method: "POST", body: { email: "x@gmail.com" } }));
      expect(other.status).toBe(403);
    } finally {
      delete process.env.ALLOWED_LOGIN_DOMAINS;
    }
  });

  it("stores only a hash of the session token", async () => {
    const res = await loginRoute(req("/api/auth/login", { method: "POST", body: { email: "a@charlotte.edu" } }));
    const token = /geo_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];
    const hashes = (await getDb().select({ h: sessions.tokenHash }).from(sessions)).map((r) => r.h);
    expect(hashes).not.toContain(token);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("campaign CRUD and roles", () => {
  beforeEach(resetDatabase);

  it("requires sign in", async () => {
    expect((await listRoute(req("/api/campaigns"))).status).toBe(401);
  });

  it("viewer can read but not write", async () => {
    const viewer = await cookieFor("viewer@charlotte.edu", "viewer");
    expect((await listRoute(req("/api/campaigns", { cookie: viewer }))).status).toBe(200);
    const res = await createRoute(req("/api/campaigns", { method: "POST", cookie: viewer, body: { name: "AI" } }));
    expect(res.status).toBe(403);
    const prompt = await promptsPost(req("/api/prompts", { method: "POST", cookie: viewer, body: { text: "x", audience: "grad", subtopics: [] } }));
    expect(prompt.status).toBe(403);
  });

  it("editor creates, edits, freezes, archives; every write is audited", async () => {
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const opts = await json(await optionsRoute(req("/api/campaigns/options", { cookie: editor })));
    expect(opts.engines).toHaveLength(6);
    const persona = opts.personas[0].id as string;

    const created = await createRoute(
      req("/api/campaigns", {
        method: "POST",
        cookie: editor,
        body: {
          name: "AI and Data Science",
          topic: "Graduate programs in AI",
          engines: [
            { engine: "chatgpt", runner: "ui_provider" },
            { engine: "claude", runner: "api_search" },
          ],
          persona_ids: [persona],
        },
      }),
    );
    expect(created.status).toBe(201);
    const campaign = (await json(created)).campaign;
    expect(campaign.engines).toHaveLength(2);
    expect(campaign.personas).toHaveLength(1);
    expect(campaign.status).toBe("draft");

    const bad = await createRoute(req("/api/campaigns", { method: "POST", cookie: editor, body: { name: "" } }));
    expect(bad.status).toBe(400);
    const badEngine = await createRoute(
      req("/api/campaigns", { method: "POST", cookie: editor, body: { name: "x", engines: [{ engine: "bing", runner: "ui_provider" }] } }),
    );
    expect(badEngine.status).toBe(400);

    const params = { params: { id: campaign.id } };
    const patched = await patchRoute(
      req(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        cookie: editor,
        body: { name: "AI & Data Science", status: "active", engines: [{ engine: "google_aio", runner: "serp_provider" }] },
      }),
      params,
    );
    expect(patched.status).toBe(200);
    const after = (await json(patched)).campaign;
    expect(after.name).toBe("AI & Data Science");
    expect(after.engines).toEqual([{ engine: "google_aio", runner: "serp_provider" }]);

    const freezeEmpty = await freezeRoute(req(`/api/campaigns/${campaign.id}/freeze`, { method: "POST", cookie: editor }), params);
    expect(freezeEmpty.status).toBe(400);

    const archived = await patchRoute(
      req(`/api/campaigns/${campaign.id}`, { method: "PATCH", cookie: editor, body: { status: "archived" } }),
      params,
    );
    expect((await json(archived)).campaign.status).toBe("archived");
    const list = await json(await listRoute(req("/api/campaigns", { cookie: editor })));
    expect(list.campaigns.map((c: { id: string }) => c.id)).not.toContain(campaign.id);
    const listAll = await json(await listRoute(req("/api/campaigns?archived=1", { cookie: editor })));
    expect(listAll.campaigns.map((c: { id: string }) => c.id)).toContain(campaign.id);

    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, "editor@charlotte.edu"));
    const actions = (await db.select().from(auditLog).where(eq(auditLog.userId, u.id)).orderBy(desc(auditLog.at))).map(
      (a) => a.action,
    );
    expect(actions).toContain("campaign.create");
    expect(actions).toContain("campaign.update");
    expect(actions).toContain("campaign.archive");
    expect(actions).toContain(`POST /api/campaigns`);
    expect(actions).toContain(`PATCH /api/campaigns/${campaign.id}`);
    const archiveRow = (await db.select().from(auditLog).where(and(eq(auditLog.userId, u.id), eq(auditLog.action, "campaign.archive"))))[0];
    expect((archiveRow.before as { status: string }).status).toBe("active");
    expect((archiveRow.after as { status: string }).status).toBe("archived");
  });

  it("cannot read another organization's campaign", async () => {
    const editor = await cookieFor("editor@charlotte.edu", "editor");
    const res = await getRoute(req(`/api/campaigns/00000000-0000-0000-0000-000000000000`, { cookie: editor }), {
      params: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status).toBe(404);
  });

  it("role changes take effect immediately", async () => {
    const cookie = await cookieFor("someone@charlotte.edu", "editor");
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, "someone@charlotte.edu"));
    await db.update(memberships).set({ role: "viewer" }).where(eq(memberships.userId, u.id));
    const res = await createRoute(req("/api/campaigns", { method: "POST", cookie, body: { name: "x" } }));
    expect(res.status).toBe(403);
  });
});

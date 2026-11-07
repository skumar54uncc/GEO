/**
 * Viewers must get 403 on every write handler that requires editor or admin
 * (including legacy routes). `withRole` checks role before body validation.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { cookieFor, resetDatabase } from "../helpers";

const BASE = "http://127.0.0.1:3000";

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

function listRouteFiles(root: string): string[] {
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

/** Returns eg { POST: "editor", PATCH: "admin" } from a route file's source. */
function writeHandlersByRole(source: string): Record<string, "editor" | "admin"> {
  const out: Record<string, "editor" | "admin"> = {};
  const re =
    /export const (POST|PUT|PATCH|DELETE)\s*=\s*with(?:Legacy)?Role\(\s*"(editor|admin)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out[m[1]!] = m[2] as "editor" | "admin";
  }
  return out;
}

function pathFromRel(rel: string): { pathname: string; params?: Record<string, string> } {
  const id = randomUUID();
  const segments = rel.split("/").map((s) => (s === "[id]" ? id : s));
  const pathname = `/api/${segments.join("/")}`;
  if (rel.includes("[id]")) return { pathname, params: { id } };
  return { pathname };
}

function req(method: string, pathname: string, cookie: string, body?: unknown): Request {
  const h: Record<string, string> = {};
  if (cookie) h.cookie = cookie;
  if (body !== undefined && method !== "GET" && method !== "HEAD") h["Content-Type"] = "application/json";
  return new Request(`${BASE}${pathname}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("viewer cannot call editor/admin write routes", () => {
  let header: string;

  beforeAll(async () => {
    await resetDatabase();
    await legacyContext(getDb());
    const session = await cookieFor("viewer-write-routes@charlotte.edu", "viewer");
    const { orgId } = await legacyContext(getDb());
    header = `${session}; ${ACTIVE_ORG_COOKIE}=${orgId}`;
  });

  it("every withRole(editor|admin) write export returns 403 for viewer", async () => {
    for (const file of listRouteFiles(process.cwd())) {
      const posix = file.split(path.sep).join("/");
      const source = fs.readFileSync(file, "utf8");
      const handlers = writeHandlersByRole(source);
      const rel = posix.replace(/^.*\/app\/api\//, "").replace(/\/route\.ts$/, "");

      for (const method of WRITE_METHODS) {
        const role = handlers[method];
        if (!role) continue;

        const modPath = `@/${posix.replace(/\.ts$/, "")}`;
        const mod = (await import(modPath)) as Record<
          string,
          (r: Request, c?: { params: Record<string, string> }) => Promise<Response>
        >;
        const handler = mod[method];
        if (!handler) continue;

        const { pathname, params } = pathFromRel(rel);
        const res = await handler(req(method, pathname, header, {}), params ? { params } : undefined);
        expect(res.status, `${method} ${rel} (${role})`).toBe(403);
      }
    }
  }, 120_000);
});

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { withRole } from "@/lib/auth";
import { middleware } from "@/middleware";

function reqAt(path: string, init: { method?: string; host?: string; origin?: string; cookie?: string } = {}) {
  const host = init.host ?? "127.0.0.1:3000";
  const headers = new Headers({ host });
  if (init.origin) headers.set("origin", init.origin);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, `http://${host}`), {
    method: init.method ?? "GET",
    headers,
  });
}

describe("middleware Host and Origin allowlist (every path)", () => {
  it("allows loopback Host for GET /api", async () => {
    const res = middleware(reqAt("/api/health"));
    expect(res.status).toBeLessThan(400);
  });

  it("allows localhost Host for GET /api (835c85f)", async () => {
    const res = middleware(reqAt("/api/health", { host: "localhost:3000" }));
    expect(res.status).toBeLessThan(400);
  });

  it("rejects forged Host on /api/*", async () => {
    const res = middleware(reqAt("/api/health", { host: "evil.example:3000" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/loopback/i);
  });

  it("rejects forged Host on /_next/image", async () => {
    const res = middleware(reqAt("/_next/image", { host: "evil.example:3000" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/loopback/i);
  });

  it("allows loopback Host on /_next/image", async () => {
    const res = middleware(reqAt("/_next/image?url=%2Fbrand%2Fmark.svg", { host: "127.0.0.1:3000" }));
    expect(res.status).toBeLessThan(400);
  });

  it("does not redirect-loop when Host is already 127.0.0.1", async () => {
    const res = middleware(reqAt("/login", { host: "127.0.0.1:3150" }));
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(308);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects when client Host header is localhost", async () => {
    const res = middleware(reqAt("/login", { host: "localhost:3150" }));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:3150\/login/);
  });

  it("rejects unsafe method with non-loopback Origin", async () => {
    const res = middleware(
      reqAt("/api/capture/batch", { method: "POST", host: "127.0.0.1:3000", origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Cross-origin/i);
  });

  it("allows unsafe method with loopback Origin", async () => {
    const res = middleware(
      reqAt("/api/capture/batch", { method: "POST", host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }),
    );
    expect(res.status).toBeLessThan(400);
  });
});

describe("withRole second-layer Host/Origin allowlist", () => {
  it("rejects forged Host before role checks", async () => {
    const handler = withRole("viewer", async () => new Response("ok"));
    const res = await handler(
      new Request("http://evil.example:3000/api/health", {
        method: "GET",
        headers: { host: "evil.example:3000" },
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/loopback/i);
  });
});

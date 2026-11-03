import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardedFetch, isPrivateIp, resolvePublic, type NetPolicy } from "@/lib/site/net/ssrf";

describe("isPrivateIp", () => {
  it.each([
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "127.8.9.10",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
    "::ffff:7f00:1",
    "not-an-ip",
  ])("refuses %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "152.15.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("guardedFetch", () => {
  let server: http.Server;
  let port: number;
  const UA = "UNCCGEOAudit/test (+mailto:test@example.test)";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/ok") return res.end("hello");
      if (url === "/to-private-ip") {
        res.writeHead(302, { Location: "http://10.0.0.5/secret" });
        return res.end();
      }
      if (url === "/to-metadata") {
        res.writeHead(301, { Location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      if (url === "/to-internal-name") {
        res.writeHead(302, { Location: `http://internal.fixture.test:${port}/ok` });
        return res.end();
      }
      if (url === "/to-public-name") {
        res.writeHead(302, { Location: `http://public.fixture.test:${port}/ok` });
        return res.end();
      }
      const loop = url.match(/^\/loop\/(\d+)$/);
      if (loop) {
        res.writeHead(302, { Location: `/loop/${Number(loop[1]) + 1}` });
        return res.end();
      }
      if (url === "/big") return res.end("x".repeat(10_000));
      res.statusCode = 404;
      res.end("nope");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // public.fixture.test resolves to the fixture server (trusted); internal.fixture.test resolves to a private IP.
  const policy: NetPolicy = {
    trustedAddresses: ["127.0.0.1"],
    lookup: async (host) => {
      if (host === "public.fixture.test") return [{ address: "127.0.0.1", family: 4 }];
      if (host === "internal.fixture.test") return [{ address: "192.168.10.20", family: 4 }];
      throw new Error(`ENOTFOUND ${host}`);
    },
  };

  it("refuses a loopback URL when nothing is trusted", async () => {
    const res = await guardedFetch(`http://127.0.0.1:${port}/ok`, { userAgent: UA });
    expect(res.ok).toBe(false);
    expect(res.blocked).toMatch(/not public/);
  });

  it("refuses localhost by name", async () => {
    const res = await guardedFetch(`http://localhost:${port}/ok`, { userAgent: UA });
    expect(res.blocked).toMatch(/not public/);
  });

  it("fetches a trusted fixture address", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/ok`, { userAgent: UA, policy });
    expect(res.ok).toBe(true);
    expect(res.body.toString()).toBe("hello");
  });

  it("refuses a redirect to a private IP literal", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/to-private-ip`, { userAgent: UA, policy });
    expect(res.ok).toBe(false);
    expect(res.blocked).toMatch(/10\.0\.0\.5 is not public/);
    expect(res.redirects).toEqual(["http://10.0.0.5/secret"]);
  });

  it("refuses a redirect to the cloud metadata address", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/to-metadata`, { userAgent: UA, policy });
    expect(res.blocked).toMatch(/169\.254\.169\.254/);
  });

  it("refuses a redirect to a name that resolves to a private IP", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/to-internal-name`, { userAgent: UA, policy });
    expect(res.blocked).toMatch(/resolves to non-public address 192\.168\.10\.20/);
  });

  it("follows a redirect to a public name", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/to-public-name`, { userAgent: UA, policy });
    expect(res.ok).toBe(true);
    expect(res.finalUrl).toBe(`http://public.fixture.test:${port}/ok`);
  });

  it("stops after 5 redirects", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/loop/0`, { userAgent: UA, policy });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe("more than 5 redirects");
    expect(res.redirects).toHaveLength(5);
  });

  it("can hand a redirect back unfollowed, for the browser to follow through the guard", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/to-private-ip`, { userAgent: UA, policy, followRedirects: false });
    expect(res.status).toBe(302);
    expect(res.blocked).toBeNull();
    expect(res.headers.location).toBe("http://10.0.0.5/secret");
  });

  it("caps the body", async () => {
    const res = await guardedFetch(`http://public.fixture.test:${port}/big`, { userAgent: UA, policy, maxBytes: 1000 });
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(1000);
  });

  it("refuses non http schemes and credentials", async () => {
    expect((await guardedFetch("file:///etc/passwd", { userAgent: UA })).blocked).toMatch(/scheme/);
    expect((await guardedFetch(`http://user:pw@public.fixture.test:${port}/ok`, { userAgent: UA, policy })).blocked).toMatch(/credentials/);
  });

  it("reports DNS failures as errors, not blocks", async () => {
    const res = await guardedFetch(`http://missing.fixture.test:${port}/`, { userAgent: UA, policy });
    expect(res.blocked).toBeNull();
    expect(res.error).toMatch(/^dns:/);
  });

  it("refuses a host when any of its addresses is private", async () => {
    await expect(
      resolvePublic("mixed.example", { lookup: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.1.1.1", family: 4 }] }),
    ).rejects.toThrow(/10\.1\.1\.1/);
  });
});

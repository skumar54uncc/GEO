import http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchCitationDocument } from "@/lib/citations/fetch";
import type { NetPolicy } from "@/lib/site/net/ssrf";

const UA = "UNCCGEOAudit/0.2 (+https://example.edu/crawler)";

describe("cited page network guard and robots", () => {
  let server: http.Server;
  let port: number;
  let disallowedPageHits = 0;
  const seenUserAgents: string[] = [];
  const policy: NetPolicy = {
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    trustedAddresses: ["127.0.0.1"],
  };
  const deps = { userAgent: UA, policy, minHostDelayMs: 0, wait: async () => {} };

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      seenUserAgents.push(request.headers["user-agent"] ?? "");
      const host = request.headers.host?.split(":")[0];
      if (request.url === "/robots.txt") {
        if (host === "robots-redirect.fixture.test") {
          response.writeHead(302, { Location: "/robots-real.txt" });
          response.end();
          return;
        }
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end(host === "disallow.fixture.test" ? "User-agent: UNCCGEOAudit\nDisallow: /private" : "User-agent: *\nAllow: /");
        return;
      }
      if (request.url === "/robots-real.txt") {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("User-agent: *\nAllow: /");
        return;
      }
      if (request.url === "/private") disallowedPageHits++;
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: `http://localhost:${port}/secret` });
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html><body>safe fixture</body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("blocks private IPs and file URLs before a page fetch", async () => {
    const privateResult = await fetchCitationDocument(`http://127.0.0.1:${port}/secret`, { userAgent: UA, minHostDelayMs: 0, wait: async () => {} });
    expect(privateResult).toMatchObject({ status: "blocked" });
    expect("error" in privateResult ? privateResult.error : "").toMatch(/not public/);

    const fileResult = await fetchCitationDocument("file:///etc/passwd", { userAgent: UA });
    expect(fileResult).toMatchObject({ status: "blocked" });
  });

  it("rechecks redirects and blocks a redirect to localhost", async () => {
    const result = await fetchCitationDocument(`http://public.fixture.test:${port}/redirect`, deps);
    expect(result).toMatchObject({ status: "blocked" });
    expect("error" in result ? result.error : "").toMatch(/localhost|not public/);
  });

  it("honors a robots disallow without requesting the cited page", async () => {
    const result = await fetchCitationDocument(`http://disallow.fixture.test:${port}/private`, deps);
    expect(result).toMatchObject({ status: "blocked", error: expect.stringMatching(/robots\.txt disallows/) });
    expect(disallowedPageHits).toBe(0);
  });

  it("follows a robots.txt redirect through the SSRF guard", async () => {
    const result = await fetchCitationDocument(`http://robots-redirect.fixture.test:${port}/ok`, deps);
    expect(result).toMatchObject({ status: "fetched" });
  });

  it("uses crawlerUserAgent with CRAWLER_CONTACT_URL on both requests", async () => {
    const previous = process.env.CRAWLER_CONTACT_URL;
    process.env.CRAWLER_CONTACT_URL = "https://example.edu/geo-crawler";
    seenUserAgents.length = 0;
    try {
      const result = await fetchCitationDocument(`http://public.fixture.test:${port}/ok`, {
        policy,
        minHostDelayMs: 0,
        wait: async () => {},
      });
      expect(result.status).toBe("fetched");
      expect(seenUserAgents).toHaveLength(2);
      expect(new Set(seenUserAgents)).toEqual(
        new Set(["UNCCGEOAudit/0.2 (+https://example.edu/geo-crawler)"]),
      );
    } finally {
      if (previous === undefined) delete process.env.CRAWLER_CONTACT_URL;
      else process.env.CRAWLER_CONTACT_URL = previous;
    }
  });
});

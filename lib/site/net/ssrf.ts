import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import zlib from "zlib";

export type LookupFn = (host: string) => Promise<Array<{ address: string; family: number }>>;

/**
 * Test seams. Production code sets neither. `trustedAddresses` lets a test treat its own fixture
 * server address as public while every other private address is still refused.
 */
export type NetPolicy = {
  lookup?: LookupFn;
  trustedAddresses?: string[];
};

function refused(ip: string, policy: NetPolicy): boolean {
  return isPrivateIp(ip) && !(policy.trustedAddresses ?? []).includes(ip);
}

export type FetchOptions = {
  method?: "GET" | "HEAD";
  userAgent: string;
  accept?: string;
  maxRedirects?: number;
  /** false: return a 3xx response as is (the browser follows it, and each hop is guarded again). */
  followRedirects?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  policy?: NetPolicy;
  headers?: Record<string, string>;
};

export type FetchResult = {
  ok: boolean;
  status: number | null;
  url: string;
  finalUrl: string;
  redirects: string[];
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  /** Set when the request was refused by the guard (private address, bad scheme, too many redirects). */
  blocked: string | null;
  error: string | null;
};

export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function inV4Block(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** Private, loopback, link local, carrier NAT, multicast, reserved and documentation ranges. */
export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return V4_BLOCKS.some(([base, bits]) => inV4Block(ip, base, bits));
  if (kind !== 6) return true;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) || lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const n = (parseInt(hexMapped[1], 16) << 16) + parseInt(hexMapped[2], 16);
    return isPrivateIp([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
  if (lower === "::" || lower === "::1") return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (lower.startsWith("64:ff9b:")) return true; // NAT64 can reach IPv4 private space
  if (lower.startsWith("2001:db8:")) return true; // documentation
  return false;
}

const defaultLookup: LookupFn = (host) =>
  new Promise((resolve, reject) => {
    // Note: mitigating DNS rebinding also requires connecting only to the validated address
    // (see once() lookup override / pin-on-connect below), not the resolver’s freshest answer per hop.
    dns.lookup(host, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as Array<{ address: string; family: number }>);
    });
  });

export class SsrfBlocked extends Error {}

/**
 * Resolves a host and refuses it if any address is not public. Returns the first address,
 * which is the one we connect to, so a second DNS answer cannot swap in a private IP.
 */
export async function resolvePublic(
  host: string,
  policy: NetPolicy = {},
): Promise<{ address: string; family: number }> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    if (refused(bare, policy)) throw new SsrfBlocked(`address ${bare} is not public`);
    return { address: bare, family: net.isIP(bare) };
  }
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(bare)) throw new SsrfBlocked(`host ${bare} is not public`);
  const addresses = await (policy.lookup ?? defaultLookup)(bare);
  if (!addresses.length) throw new Error(`no addresses for ${bare}`);
  const bad = addresses.find((a) => refused(a.address, policy));
  if (bad) throw new SsrfBlocked(`host ${bare} resolves to non-public address ${bad.address}`);
  return addresses[0];
}

function decode(buf: Buffer, encoding: string | undefined): Buffer {
  try {
    if (encoding === "gzip" || encoding === "x-gzip") return zlib.gunzipSync(buf);
    if (encoding === "deflate") return zlib.inflateSync(buf);
    if (encoding === "br") return zlib.brotliDecompressSync(buf);
  } catch {
    return buf;
  }
  return buf;
}

function once(
  url: URL,
  address: { address: string; family: number },
  opts: FetchOptions,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; truncated: boolean }> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: {
          "User-Agent": opts.userAgent,
          Accept: opts.accept ?? "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          ...(opts.headers ?? {}),
        },
        timeout: opts.timeoutMs ?? 15_000,
        // Connect to the address we already validated, never a fresh DNS answer.
        lookup: ((_host: string, o: { all?: boolean }, cb: (...args: unknown[]) => void) =>
          o?.all ? cb(null, [{ address: address.address, family: address.family }]) : cb(null, address.address, address.family)) as unknown as http.RequestOptions["lookup"],
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          }
          const raw = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: truncated ? raw : decode(raw, headers["content-encoding"]),
            truncated,
          });
        };
        res.on("end", finish);
        res.on("close", () => {
          if (truncated) finish();
        });
        res.on("error", (err) => (truncated ? finish() : reject(err)));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetch that refuses private, loopback and link local addresses after DNS resolution,
 * on the first request and on every redirect. Follows at most 5 redirects, caps the body,
 * and never throws: failures come back as `error` or `blocked`.
 */
export async function guardedFetch(rawUrl: string, opts: FetchOptions): Promise<FetchResult> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const redirects: string[] = [];
  const base: Omit<FetchResult, "ok" | "status" | "finalUrl" | "headers" | "body" | "truncated"> = {
    url: rawUrl,
    redirects,
    blocked: null,
    error: null,
  };
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ...base, ok: false, status: null, finalUrl: rawUrl, headers: {}, body: Buffer.alloc(0), truncated: false, error: "invalid URL" };
  }
  for (let hop = 0; ; hop++) {
    const fail = (patch: Partial<FetchResult>): FetchResult => ({
      ...base,
      ok: false,
      status: null,
      finalUrl: current.toString(),
      headers: {},
      body: Buffer.alloc(0),
      truncated: false,
      ...patch,
    });
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      return fail({ blocked: `scheme ${current.protocol} is not allowed` });
    }
    if (current.username || current.password) return fail({ blocked: "credentials in URL are not allowed" });
    let address: { address: string; family: number };
    try {
      address = await resolvePublic(current.hostname, opts.policy);
    } catch (err) {
      if (err instanceof SsrfBlocked) return fail({ blocked: err.message });
      return fail({ error: `dns: ${err instanceof Error ? err.message : String(err)}` });
    }
    let res: Awaited<ReturnType<typeof once>>;
    try {
      res = await once(current, address, opts);
    } catch (err) {
      return fail({ error: err instanceof Error ? err.message : String(err) });
    }
    const location = res.headers["location"];
    if (res.status >= 300 && res.status < 400 && location && opts.followRedirects !== false) {
      if (hop >= maxRedirects) {
        return fail({ status: res.status, headers: res.headers, blocked: `more than ${maxRedirects} redirects` });
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return fail({ status: res.status, headers: res.headers, error: `bad redirect location ${location}` });
      }
      redirects.push(next.toString());
      current = next;
      continue;
    }
    return {
      ...base,
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      finalUrl: current.toString(),
      headers: res.headers,
      body: res.body,
      truncated: res.truncated,
    };
  }
}

import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { botHits, botLogImports, siteHosts } from "@/lib/db/pg/schema";
import { matchAiBot } from "./aiBots";

export type LogFormat = "common" | "combined" | "cloudflare_json";

/** A parsed access log line. The client IP is read past and never kept. */
export type LogLine = { host: string | null; path: string; status: number | null; at: Date; userAgent: string | null };

// [vhost[:port] ] ip ident user [date] "METHOD target PROTO" status bytes ["referer" "ua"]
const CLF = /^(?:(\S+?)(?::\d+)?\s+)?\S+\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(?:[A-Z]+\s+)?(\S+)(?:\s+[^"]*)?"\s+(\d{3}|-)\s+\S+(?:\s+"[^"]*"\s+"((?:[^"\\]|\\.)*)")?/;

const MONTH: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

export function parseClfDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-])(\d{2})(\d{2})$/);
  if (!m || MONTH[m[2]] === undefined) return null;
  const utc = Date.UTC(Number(m[3]), MONTH[m[2]], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  const offset = (Number(m[8]) * 60 + Number(m[9])) * 60_000 * (m[7] === "+" ? 1 : -1);
  return new Date(utc - offset);
}

/** Path without query string or fragment: queries can carry emails, tokens and other personal data. */
export function pathOnly(target: string): string {
  let p = target;
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep as is */
  }
  return p.split(/[?#]/)[0] || "/";
}

function cfTimestamp(v: unknown): Date | null {
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") {
    // Cloudflare emits unix seconds, milliseconds or nanoseconds depending on timestamp_format.
    const ms = v > 1e17 ? v / 1e6 : v > 1e12 ? v : v * 1000;
    return new Date(ms);
  }
  return null;
}

export function parseLine(line: string, format: LogFormat): LogLine | null {
  const t = line.trim();
  if (!t) return null;
  if (format === "cloudflare_json") {
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(t);
    } catch {
      return null;
    }
    const at = cfTimestamp(j.EdgeStartTimestamp ?? j.EdgeEndTimestamp ?? j.Datetime);
    const uri = (j.ClientRequestURI ?? j.ClientRequestPath) as string | undefined;
    if (!at || typeof uri !== "string") return null;
    const status = Number(j.EdgeResponseStatus ?? j.OriginResponseStatus);
    return {
      host: typeof j.ClientRequestHost === "string" ? j.ClientRequestHost.toLowerCase() : null,
      path: pathOnly(uri),
      status: Number.isFinite(status) && status > 0 ? status : null,
      at,
      userAgent: typeof j.ClientRequestUserAgent === "string" ? j.ClientRequestUserAgent : null,
    };
  }
  const m = t.match(CLF);
  if (!m) return null;
  const at = parseClfDate(m[2]);
  if (!at) return null;
  return {
    host: m[1] && m[1].includes(".") ? m[1].toLowerCase() : null,
    path: pathOnly(m[3]),
    status: m[4] === "-" ? null : Number(m[4]),
    at,
    userAgent: format === "combined" && m[5] !== undefined ? m[5].replace(/\\"/g, '"') : null,
  };
}

export function detectFormat(sample: string[]): LogFormat {
  const lines = sample.map((l) => l.trim()).filter(Boolean).slice(0, 20);
  if (lines.length && lines.every((l) => l.startsWith("{"))) return "cloudflare_json";
  const combined = lines.filter((l) => {
    const m = l.match(CLF);
    return m && m[5] !== undefined;
  }).length;
  return combined > 0 ? "combined" : "common";
}

export type ImportSummary = {
  import_id: string;
  already_imported: boolean;
  format: LogFormat;
  file_sha256: string;
  lines_total: number;
  lines_unparsed: number;
  bot_lines: number;
  note: string | null;
};

export async function importBotLog(
  db: Db,
  opts: { siteId: string; content: Buffer; fileName?: string | null; format?: LogFormat | "auto"; defaultHost?: string | null; userId?: string | null },
): Promise<ImportSummary> {
  const fileSha = crypto.createHash("sha256").update(opts.content).digest("hex");
  const [prior] = await db
    .select()
    .from(botLogImports)
    .where(and(eq(botLogImports.siteId, opts.siteId), eq(botLogImports.fileSha256, fileSha)));
  if (prior) {
    return {
      import_id: prior.id,
      already_imported: true,
      format: prior.format,
      file_sha256: fileSha,
      lines_total: prior.linesTotal,
      lines_unparsed: prior.linesUnparsed,
      bot_lines: prior.botLines,
      note: "This exact file was imported before; nothing was added.",
    };
  }
  const lines = opts.content.toString("utf8").split(/\r?\n/);
  const format = !opts.format || opts.format === "auto" ? detectFormat(lines) : opts.format;
  const hosts = await db.select({ id: siteHosts.id, host: siteHosts.host }).from(siteHosts).where(eq(siteHosts.siteId, opts.siteId));
  const hostIds = new Map(hosts.map((h) => [h.host, h.id]));
  const defaultHost = opts.defaultHost?.toLowerCase() || null;

  let total = 0;
  let unparsed = 0;
  const rows: Array<typeof botHits.$inferInsert> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    total++;
    const parsed = parseLine(line, format);
    if (!parsed) {
      unparsed++;
      continue;
    }
    const bot = parsed.userAgent ? matchAiBot(parsed.userAgent) : null;
    if (!bot || !parsed.userAgent) continue;
    const host = parsed.host ?? defaultHost;
    rows.push({
      siteId: opts.siteId,
      hostId: host ? (hostIds.get(host) ?? null) : null,
      host,
      path: parsed.path.slice(0, 2000),
      userAgent: parsed.userAgent.slice(0, 1000),
      botName: bot,
      statusCode: parsed.status,
      hitAt: parsed.at,
      sourceFileSha256: fileSha,
    });
  }
  const importId = await db.transaction(async (tx) => {
    const [imp] = await tx
      .insert(botLogImports)
      .values({
        siteId: opts.siteId,
        fileSha256: fileSha,
        fileName: opts.fileName ?? null,
        format,
        linesTotal: total,
        linesUnparsed: unparsed,
        botLines: rows.length,
        createdBy: opts.userId ?? null,
      })
      .returning({ id: botLogImports.id });
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(botHits).values(rows.slice(i, i + 1000));
    return imp.id;
  });
  return {
    import_id: importId,
    already_imported: false,
    format,
    file_sha256: fileSha,
    lines_total: total,
    lines_unparsed: unparsed,
    bot_lines: rows.length,
    note: format === "common" ? "Common log format has no user agent field, so no bots can be identified. Export the combined format instead." : null,
  };
}

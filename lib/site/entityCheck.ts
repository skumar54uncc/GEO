import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brandAliases, brands, entityChecks } from "@/lib/db/pg/schema";
import { rootDomainOf } from "./context";
import { guardedFetch } from "./net/ssrf";
import { normalizeValue } from "./entities";
import { providerCall } from "./providerCall";

export const PROFILE_FIELDS = ["name", "founding_year", "city", "state", "type", "website", "enrollment_total", "enrollment_undergrad"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type Profile = Partial<Record<ProfileField, string | number>> & { confirmed_by?: string; confirmed_at?: string };

export type Source = "knowledge_graph" | "wikidata" | "wikipedia" | "ipeds" | "scorecard";
export type Observed = { value: string | number | null; as_of?: string | null; definition?: string | null; raw_field?: string };
export type SourceResult = { source: Source; status: "ok" | "not_checked" | "error"; reason: string | null; rawPayloadId: string | null; fields: Partial<Record<ProfileField, Observed>> };

const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
export function stateAbbr(s: string): string {
  const t = s.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATE_ABBR[t.toLowerCase()] ?? t;
}

export function controlType(s: string | number | null | undefined): "public" | "private" | null {
  if (s === null || s === undefined) return null;
  if (typeof s === "number") return s === 1 ? "public" : s === 2 || s === 3 ? "private" : null;
  if (/\bpublic\b/i.test(s)) return "public";
  if (/\bprivate\b/i.test(s)) return "private";
  return null;
}

function domainOf(v: string): string | null {
  try {
    return rootDomainOf(new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname);
  } catch {
    return null;
  }
}

/** Strips refs, links and simple templates from an infobox value. */
export function cleanWikitext(v: string): string {
  return v
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{(?:start date and age|start date|URL|url|nowrap|plainlist|ubl)\|([^{}]*)\}\}/gi, (_m, inner: string) => inner.split("|").filter((p) => !/=/.test(p)).join(" "))
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseInfobox(wikitext: string): Record<string, string> {
  const start = wikitext.search(/\{\{\s*Infobox/i);
  if (start < 0) return {};
  let depth = 0;
  let end = start;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      depth++;
      i++;
    } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const body = wikitext.slice(start, end);
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*\|\s*([a-z_0-9 ]+?)\s*=\s*(.*)$/i);
    if (m && m[2].trim()) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return out;
}

function firstYear(s: string): number | null {
  const m = s.match(/\b(1[6-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}
function firstNumber(s: string): number | null {
  const m = s.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export type EntityDeps = {
  fetchJson: (url: string) => Promise<{ ok: boolean; body: string; error: string | null }>;
  kgApiKey: string | null;
  scorecardApiKey: string;
};

export function liveEntityDeps(): EntityDeps {
  return {
    fetchJson: async (url) => {
      const r = await guardedFetch(url, { userAgent: "UNCCGEOAudit/0.2 (entity consistency check)", timeoutMs: 60_000, maxBytes: 20 * 1024 * 1024, accept: "application/json" });
      return { ok: r.ok, body: r.body.toString("utf8"), error: r.ok ? null : (r.error ?? r.blocked ?? `HTTP ${r.status}`) };
    },
    kgApiKey: process.env.GOOGLE_KG_API_KEY || null,
    scorecardApiKey: process.env.DATA_GOV_API_KEY || "DEMO_KEY",
  };
}

type Ctx = { db: Db; orgId: string; deps: EntityDeps; name: string; domain: string; unitid: string | null };

async function get(ctx: Ctx, provider: string, url: string, secret = ""): Promise<{ ok: true; json: unknown; raw: string } | { ok: false; error: string }> {
  const res = await providerCall(ctx.db, {
    orgId: ctx.orgId,
    provider,
    engine: "entity_check",
    params: { url },
    units: 1,
    call: () => ctx.deps.fetchJson(url + secret),
  });
  if (!res.ok) return { ok: false, error: res.error };
  try {
    return { ok: true, json: JSON.parse(res.body), raw: res.rawPayloadId };
  } catch {
    return { ok: false, error: "response was not JSON" };
  }
}

async function fromKnowledgeGraph(ctx: Ctx): Promise<SourceResult> {
  const base: SourceResult = { source: "knowledge_graph", status: "not_checked", reason: null, rawPayloadId: null, fields: {} };
  if (!ctx.deps.kgApiKey) return { ...base, reason: "GOOGLE_KG_API_KEY is not set" };
  const q = new URLSearchParams({ query: ctx.name, limit: "5", types: "CollegeOrUniversity" });
  const r = await get(ctx, "google_kg", `https://kgsearch.googleapis.com/v1/entities:search?${q}`, `&key=${encodeURIComponent(ctx.deps.kgApiKey)}`);
  if (!r.ok) return { ...base, status: "error", reason: r.error };
  const items = ((r.json as { itemListElement?: Array<{ result?: Record<string, unknown> }> }).itemListElement ?? []).map((i) => i.result ?? {});
  const hit = items.find((i) => typeof i.url === "string" && domainOf(i.url as string) === ctx.domain) ?? null;
  if (!hit) return { ...base, status: "ok", rawPayloadId: r.raw, reason: "no Knowledge Graph entity with this website", fields: {} };
  const desc = typeof hit.description === "string" ? hit.description : "";
  return {
    ...base,
    status: "ok",
    rawPayloadId: r.raw,
    fields: {
      name: { value: (hit.name as string) ?? null },
      website: { value: (hit.url as string) ?? null },
      type: { value: controlType(desc), raw_field: "description" },
    },
  };
}

async function fromWikidata(ctx: Ctx): Promise<{ result: SourceResult; enwikiTitle: string | null }> {
  const base: SourceResult = { source: "wikidata", status: "error", reason: null, rawPayloadId: null, fields: {} };
  const search = await get(ctx, "wikidata", `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(ctx.name)}&language=en&type=item&limit=5&format=json`);
  if (!search.ok) return { result: { ...base, reason: search.error }, enwikiTitle: null };
  const ids = ((search.json as { search?: Array<{ id: string }> }).search ?? []).map((s) => s.id);
  type Claim = { rank?: string; mainsnak?: { datavalue?: { value?: unknown } }; qualifiers?: Record<string, Array<{ datavalue?: { value?: { time?: string } } }>> };
  type Entity = { id: string; labels?: { en?: { value: string } }; claims?: Record<string, Claim[]>; sitelinks?: { enwiki?: { title: string } } };
  for (const id of ids) {
    const e = await get(ctx, "wikidata", `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
    if (!e.ok) continue;
    const entity = Object.values((e.json as { entities?: Record<string, Entity> }).entities ?? {})[0];
    if (!entity) continue;
    const claims = (p: string) => (entity.claims?.[p] ?? []).filter((c) => c.rank !== "deprecated");
    const websites = claims("P856").map((c) => String(c.mainsnak?.datavalue?.value ?? ""));
    if (!websites.some((w) => domainOf(w) === ctx.domain)) continue;
    const inception = claims("P571")[0]?.mainsnak?.datavalue?.value as { time?: string } | undefined;
    const students = claims("P2196")
      .map((c) => ({
        amount: Number(String((c.mainsnak?.datavalue?.value as { amount?: string })?.amount ?? "").replace("+", "")),
        date: c.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? null,
      }))
      .filter((s) => Number.isFinite(s.amount))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.amount - a.amount);
    const refIds = [...claims("P131"), ...claims("P31")].map((c) => (c.mainsnak?.datavalue?.value as { id?: string })?.id).filter(Boolean) as string[];
    const labels: Record<string, string> = {};
    if (refIds.length) {
      const l = await get(ctx, "wikidata", `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${refIds.join("|")}&props=labels&languages=en&format=json`);
      if (l.ok) for (const [k, v] of Object.entries((l.json as { entities?: Record<string, { labels?: { en?: { value: string } } }> }).entities ?? {})) labels[k] = v.labels?.en?.value ?? k;
    }
    const cityId = (claims("P131")[0]?.mainsnak?.datavalue?.value as { id?: string })?.id;
    const types = claims("P31").map((c) => labels[(c.mainsnak?.datavalue?.value as { id?: string })?.id ?? ""] ?? "").join("; ");
    return {
      result: {
        ...base,
        status: "ok",
        rawPayloadId: e.raw,
        fields: {
          name: { value: entity.labels?.en?.value ?? null, raw_field: `${entity.id} label` },
          founding_year: { value: inception?.time ? firstYear(inception.time) : null, raw_field: "P571" },
          city: { value: cityId ? (labels[cityId] ?? null) : null, raw_field: "P131" },
          type: { value: controlType(types), raw_field: `P31: ${types}` },
          website: { value: websites.find((w) => domainOf(w) === ctx.domain) ?? null, raw_field: "P856" },
          enrollment_total: { value: students[0]?.amount ?? null, as_of: students[0]?.date?.slice(1, 11) ?? null, definition: "students count (P2196)", raw_field: "P2196" },
        },
      },
      enwikiTitle: entity.sitelinks?.enwiki?.title ?? null,
    };
  }
  return { result: { ...base, status: "ok", reason: "no Wikidata item with this official website", fields: {} }, enwikiTitle: null };
}

async function fromWikipedia(ctx: Ctx, title: string | null): Promise<SourceResult> {
  const base: SourceResult = { source: "wikipedia", status: "not_checked", reason: null, rawPayloadId: null, fields: {} };
  if (!title) return { ...base, reason: "no English Wikipedia article linked from Wikidata" };
  const r = await get(ctx, "wikipedia", `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&titles=${encodeURIComponent(title)}&format=json&formatversion=2`);
  if (!r.ok) return { ...base, status: "error", reason: r.error };
  const text = (r.json as { query?: { pages?: Array<{ revisions?: Array<{ slots?: { main?: { content?: string } } }> }> } }).query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
  const box = parseInfobox(text);
  const v = (k: string) => (box[k] ? cleanWikitext(box[k]) : "");
  const city = v("city").split(",")[0].trim();
  const state = v("city").split(",")[1]?.trim() || v("state");
  const students = v("students");
  return {
    ...base,
    status: "ok",
    rawPayloadId: r.raw,
    fields: {
      name: { value: v("name") || null, raw_field: "infobox name" },
      founding_year: { value: firstYear(v("established")), raw_field: "infobox established" },
      city: { value: city || null, raw_field: "infobox city" },
      state: { value: state ? stateAbbr(state) : null, raw_field: "infobox city/state" },
      type: { value: controlType(v("type")), raw_field: `infobox type: ${v("type")}` },
      website: { value: v("website") || null, raw_field: "infobox website" },
      enrollment_total: { value: firstNumber(students), as_of: students.match(/\((?:fall\s)?(\d{4})\)/i)?.[1] ?? null, definition: "infobox students", raw_field: "infobox students" },
    },
  };
}

async function fromIpeds(ctx: Ctx): Promise<SourceResult> {
  const base: SourceResult = { source: "ipeds", status: "not_checked", reason: null, rawPayloadId: null, fields: {} };
  if (!ctx.unitid) return { ...base, reason: "no IPEDS unit id yet (run peer suggestions or set it)" };
  for (const year of [2023, 2022, 2021]) {
    const r = await get(ctx, "urban_ipeds", `https://educationdata.urban.org/api/v1/college-university/ipeds/directory/${year}/?unitid=${ctx.unitid}`);
    if (!r.ok) return { ...base, status: "error", reason: r.error };
    const row = ((r.json as { results?: Array<Record<string, unknown>> }).results ?? [])[0];
    if (!row) continue;
    return {
      ...base,
      status: "ok",
      rawPayloadId: r.raw,
      fields: {
        name: { value: (row.inst_name as string) ?? null, as_of: String(year), raw_field: "inst_name" },
        city: { value: (row.city as string) ?? null, as_of: String(year) },
        state: { value: (row.state_abbr as string) ?? null, as_of: String(year) },
        type: { value: controlType(row.inst_control as number), as_of: String(year), raw_field: `inst_control ${row.inst_control}` },
        website: { value: (row.url_school as string) ?? null, as_of: String(year) },
      },
    };
  }
  return { ...base, status: "ok", reason: "no IPEDS directory row for 2021 to 2023" };
}

async function fromScorecard(ctx: Ctx): Promise<SourceResult> {
  const base: SourceResult = { source: "scorecard", status: "not_checked", reason: null, rawPayloadId: null, fields: {} };
  if (!ctx.unitid) return { ...base, reason: "no IPEDS unit id yet" };
  const fields = "id,school.name,school.city,school.state,school.school_url,school.ownership,latest.student.size";
  const r = await get(ctx, "scorecard", `https://api.data.gov/ed/collegescorecard/v1/schools?id=${ctx.unitid}&fields=${fields}`, `&api_key=${encodeURIComponent(ctx.deps.scorecardApiKey)}`);
  if (!r.ok) return { ...base, status: "error", reason: r.error };
  const s = ((r.json as { results?: Array<Record<string, unknown>> }).results ?? [])[0];
  if (!s) return { ...base, status: "ok", reason: "no Scorecard record" };
  return {
    ...base,
    status: "ok",
    rawPayloadId: r.raw,
    fields: {
      name: { value: (s["school.name"] as string) ?? null },
      city: { value: (s["school.city"] as string) ?? null },
      state: { value: (s["school.state"] as string) ?? null },
      type: { value: controlType(s["school.ownership"] as number), raw_field: `ownership ${s["school.ownership"]}` },
      website: { value: (s["school.school_url"] as string) ?? null },
      enrollment_undergrad: { value: (s["latest.student.size"] as number) ?? null, definition: "undergraduate degree seeking (latest.student.size)" },
    },
  };
}

/** Compares one observed value to the confirmed profile. */
export function compareField(field: ProfileField, observed: Observed | undefined, expected: string | number, aliases: string[]): { status: "match" | "mismatch" | "missing"; note: string | null } {
  const v = observed?.value;
  if (v === null || v === undefined || v === "") return { status: "missing", note: null };
  switch (field) {
    case "name": {
      const names = [String(expected), ...aliases].map(normalizeValue);
      return names.includes(normalizeValue(String(v))) ? { status: "match", note: null } : { status: "mismatch", note: null };
    }
    case "founding_year":
      return Number(v) === Number(expected) ? { status: "match", note: null } : { status: "mismatch", note: null };
    case "city":
      return normalizeValue(String(v)) === normalizeValue(String(expected)) ? { status: "match", note: null } : { status: "mismatch", note: null };
    case "state":
      return stateAbbr(String(v)) === stateAbbr(String(expected)) ? { status: "match", note: null } : { status: "mismatch", note: null };
    case "type": {
      const a = controlType(String(v));
      const b = controlType(String(expected));
      return a && b && a === b ? { status: "match", note: null } : { status: "mismatch", note: null };
    }
    case "website":
      return domainOf(String(v)) === domainOf(String(expected)) ? { status: "match", note: null } : { status: "mismatch", note: null };
    case "enrollment_total":
    case "enrollment_undergrad": {
      const a = Number(v);
      const b = Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return { status: "mismatch", note: null };
      const diff = Math.abs(a - b) / b;
      return diff <= 0.1 ? { status: "match", note: `within 10% (${(diff * 100).toFixed(1)}%)` } : { status: "mismatch", note: `${(diff * 100).toFixed(1)}% apart; counts may be from different years` };
    }
  }
}

/**
 * Fields each source can state. A field outside this list is never compared for that source.
 * When a source has no record of the institution, every listed field is stored as missing.
 */
export const SOURCE_FIELDS: Record<Source, ProfileField[]> = {
  knowledge_graph: ["name", "website", "type"],
  wikidata: ["name", "founding_year", "city", "type", "website", "enrollment_total"],
  wikipedia: ["name", "founding_year", "city", "state", "type", "website", "enrollment_total"],
  ipeds: ["name", "city", "state", "type", "website"],
  scorecard: ["name", "city", "state", "type", "website", "enrollment_undergrad"],
};

export type CheckSummary = { sources: Array<{ source: Source; status: string; reason: string | null; compared: number }>; match: number; mismatch: number; missing: number };

/** entity.check: fetches every source and appends one entity_checks row per compared field. */
export async function runEntityCheck(db: Db, opts: { brandId: string; orgId: string; deps: EntityDeps }): Promise<CheckSummary> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, opts.brandId));
  const profile = (brand.profile ?? {}) as Profile;
  if (!profile.confirmed_at) throw new Error("Confirm the entity profile before running the check.");
  const aliases = (await db.select({ alias: brandAliases.alias }).from(brandAliases).where(eq(brandAliases.brandId, brand.id))).map((a) => a.alias);
  const ctx: Ctx = { db, orgId: opts.orgId, deps: opts.deps, name: String(profile.name ?? brand.name), domain: rootDomainOf(String(profile.website ?? brand.rootDomain).replace(/^https?:\/\//, "").split("/")[0]), unitid: brand.ipedsUnitid };

  const wd = await fromWikidata(ctx);
  const results = [await fromKnowledgeGraph(ctx), wd.result, await fromWikipedia(ctx, wd.enwikiTitle), await fromIpeds(ctx), await fromScorecard(ctx)];
  const checkedAt = new Date();
  const summary: CheckSummary = { sources: [], match: 0, mismatch: 0, missing: 0 };
  for (const r of results) {
    let compared = 0;
    if (r.status === "ok") {
      for (const field of SOURCE_FIELDS[r.source]) {
        const expected = profile[field];
        if (expected === undefined || expected === null || expected === "") continue;
        const cmp = compareField(field, r.fields[field], expected, aliases);
        await db.insert(entityChecks).values({
          brandId: brand.id,
          source: r.source,
          field,
          observed: { ...(r.fields[field] ?? { value: null }), note: cmp.note ?? (r.fields[field] ? null : r.reason) },
          expected: { value: expected },
          status: cmp.status,
          rawPayloadId: r.rawPayloadId,
          checkedAt,
        });
        summary[cmp.status]++;
        compared++;
      }
    }
    summary.sources.push({ source: r.source, status: r.status, reason: r.reason, compared });
  }
  return summary;
}

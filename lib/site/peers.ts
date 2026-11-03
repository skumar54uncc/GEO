import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brands, competitorDomains, competitors, peerSuggestions } from "@/lib/db/pg/schema";
import { rootDomainOf } from "./context";
import { guardedFetch } from "./net/ssrf";
import { providerCall } from "./providerCall";

const SCORECARD = "https://api.data.gov/ed/collegescorecard/v1/schools";

/** Labels from the College Scorecard data dictionary for the codes we show; any other code is shown as a number. */
export const CARNEGIE_BASIC: Record<number, string> = {
  15: "Doctoral Universities: Very High Research Activity",
  16: "Doctoral Universities: High Research Activity",
  17: "Doctoral/Professional Universities",
  18: "Master's Colleges and Universities: Larger Programs",
  19: "Master's Colleges and Universities: Medium Programs",
  20: "Master's Colleges and Universities: Small Programs",
};
export const REGION: Record<number, string> = {
  0: "U.S. Service Schools",
  1: "New England",
  2: "Mid East",
  3: "Great Lakes",
  4: "Plains",
  5: "Southeast",
  6: "Southwest",
  7: "Rocky Mountains",
  8: "Far West",
  9: "Outlying Areas",
};
export const OWNERSHIP: Record<number, string> = { 1: "Public", 2: "Private nonprofit", 3: "Private for-profit" };

export type ScorecardSchool = {
  id: number;
  "school.name": string;
  "school.city"?: string;
  "school.state"?: string;
  "school.school_url"?: string | null;
  "school.carnegie_basic"?: number | null;
  "school.region_id"?: number | null;
  "school.ownership"?: number | null;
  "latest.student.size"?: number | null;
  "latest.programs.cip_4_digit"?: Array<{ code: string; credential?: { level?: number } }> | null;
};

const SELF_FIELDS = "id,school.name,school.city,school.state,school.school_url,school.carnegie_basic,school.region_id,school.ownership,latest.student.size,school.alias";
const PEER_FIELDS = `${SELF_FIELDS},latest.programs.cip_4_digit.code,latest.programs.cip_4_digit.credential.level`;

export function carnegieLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "unknown";
  return CARNEGIE_BASIC[code] ? `${CARNEGIE_BASIC[code]} (code ${code})` : `code ${code}`;
}

function programSet(s: ScorecardSchool): Set<string> {
  return new Set((s["latest.programs.cip_4_digit"] ?? []).map((p) => `${p.code}:${p.credential?.level ?? "?"}`));
}

export type PeerReason = { kind: "carnegie" | "region" | "ownership" | "program_overlap" | "size"; text: string };
export type ScoredPeer = { school: ScorecardSchool; overlap: number; score: number; reasons: PeerReason[] };

/** Ranks candidates by program overlap (Jaccard over CIP 4 digit code and credential level). */
export function scorePeers(self: ScorecardSchool, candidates: ScorecardSchool[], limit = 12): ScoredPeer[] {
  const mine = programSet(self);
  const out: ScoredPeer[] = [];
  for (const c of candidates) {
    if (c.id === self.id) continue;
    const theirs = programSet(c);
    let inter = 0;
    theirs.forEach((p) => {
      if (mine.has(p)) inter++;
    });
    const union = mine.size + theirs.size - inter;
    const overlap = union ? inter / union : 0;
    const reasons: PeerReason[] = [];
    const same = (k: "school.carnegie_basic" | "school.region_id" | "school.ownership") => c[k] != null && c[k] === self[k];
    if (same("school.carnegie_basic")) reasons.push({ kind: "carnegie", text: `Same Carnegie basic class: ${carnegieLabel(c["school.carnegie_basic"])}` });
    if (same("school.region_id")) reasons.push({ kind: "region", text: `Same region: ${REGION[c["school.region_id"]!] ?? `code ${c["school.region_id"]}`}` });
    if (same("school.ownership")) reasons.push({ kind: "ownership", text: `Same control: ${OWNERSHIP[c["school.ownership"]!] ?? `code ${c["school.ownership"]}`}` });
    reasons.push({ kind: "program_overlap", text: `Program overlap ${(overlap * 100).toFixed(0)}% (${inter} shared program and credential pairs of ${union})` });
    const a = self["latest.student.size"];
    const b = c["latest.student.size"];
    if (a && b) reasons.push({ kind: "size", text: `Undergraduate degree seeking enrollment ${b.toLocaleString("en-US")} vs ${a.toLocaleString("en-US")} (Scorecard latest)` });
    out.push({ school: c, overlap, score: Math.round(overlap * 1000) / 1000, reasons });
  }
  return out.sort((x, y) => y.score - x.score || x.school.id - y.school.id).slice(0, limit);
}

export type PeerDeps = {
  apiKey: string;
  fetchJson: (url: string) => Promise<{ ok: boolean; body: string; error: string | null }>;
};

export function livePeerDeps(): PeerDeps {
  return {
    apiKey: process.env.DATA_GOV_API_KEY || "DEMO_KEY",
    fetchJson: async (url) => {
      const r = await guardedFetch(url, { userAgent: "UNCCGEOAudit", timeoutMs: 60_000, maxBytes: 30 * 1024 * 1024, accept: "application/json" });
      return { ok: r.ok, body: r.body.toString("utf8"), error: r.ok ? null : (r.error ?? r.blocked ?? `HTTP ${r.status}`) };
    },
  };
}

async function scorecard(db: Db, orgId: string, deps: PeerDeps, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  const res = await providerCall(db, {
    orgId,
    provider: "scorecard",
    engine: "schools_v1",
    params: query,
    units: 1,
    call: () => deps.fetchJson(`${SCORECARD}?${params}&api_key=${encodeURIComponent(deps.apiKey)}`),
  });
  if (!res.ok) return { ok: false as const, error: res.error };
  try {
    const j = JSON.parse(res.body) as { results?: ScorecardSchool[]; error?: { message?: string } };
    if (!j.results) return { ok: false as const, error: j.error?.message ?? "unexpected Scorecard response" };
    return { ok: true as const, results: j.results, rawPayloadId: res.rawPayloadId };
  } catch {
    return { ok: false as const, error: "Scorecard response was not JSON" };
  }
}

export type SuggestResult = { status: "ok" | "error"; error: string | null; self: { unitid: string; name: string; carnegie: string; region: string } | null; suggested: number };

/**
 * Finds the brand in College Scorecard by name and website, then suggests schools with the same
 * Carnegie class, region and control, ranked by program overlap. Stores ipeds_unitid on the brand.
 */
export async function suggestPeers(db: Db, opts: { siteId: string; orgId: string; brandId: string; deps: PeerDeps }): Promise<SuggestResult> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, opts.brandId));
  const domain = rootDomainOf(brand.rootDomain);
  let self: ScorecardSchool | undefined;
  if (brand.ipedsUnitid) {
    const r = await scorecard(db, opts.orgId, opts.deps, { id: brand.ipedsUnitid, fields: PEER_FIELDS });
    if (!r.ok) return { status: "error", error: r.error, self: null, suggested: 0 };
    self = r.results[0];
  } else {
    const r = await scorecard(db, opts.orgId, opts.deps, { "school.name": brand.name, fields: SELF_FIELDS, per_page: "20" });
    if (!r.ok) return { status: "error", error: r.error, self: null, suggested: 0 };
    self = r.results.find((s) => {
      try {
        return rootDomainOf(new URL(s["school.school_url"]?.startsWith("http") ? s["school.school_url"] : `https://${s["school.school_url"]}`).hostname) === domain;
      } catch {
        return false;
      }
    });
    if (!self) return { status: "error", error: `No Scorecard school named like "${brand.name}" has website ${domain}. Set the IPEDS unit id manually.`, self: null, suggested: 0 };
    await db.update(brands).set({ ipedsUnitid: String(self.id) }).where(eq(brands.id, brand.id));
    const full = await scorecard(db, opts.orgId, opts.deps, { id: String(self.id), fields: PEER_FIELDS });
    if (full.ok && full.results[0]) self = full.results[0];
  }
  if (!self) return { status: "error", error: "Scorecard returned no record for this unit id.", self: null, suggested: 0 };

  const query: Record<string, string> = { fields: PEER_FIELDS, per_page: "100" };
  if (self["school.carnegie_basic"] != null) query["school.carnegie_basic"] = String(self["school.carnegie_basic"]);
  if (self["school.region_id"] != null) query["school.region_id"] = String(self["school.region_id"]);
  if (self["school.ownership"] != null) query["school.ownership"] = String(self["school.ownership"]);
  const peers = await scorecard(db, opts.orgId, opts.deps, query);
  if (!peers.ok) return { status: "error", error: peers.error, self: null, suggested: 0 };
  const scored = scorePeers(self, peers.results);
  for (const p of scored) {
    const s = p.school;
    await db
      .insert(peerSuggestions)
      .values({
        siteId: opts.siteId,
        ipedsUnitid: String(s.id),
        name: s["school.name"],
        city: s["school.city"] ?? null,
        state: s["school.state"] ?? null,
        website: s["school.school_url"] ?? null,
        score: String(p.score),
        reasons: p.reasons,
        rawPayloadId: peers.rawPayloadId,
      })
      .onConflictDoUpdate({
        target: [peerSuggestions.siteId, peerSuggestions.ipedsUnitid],
        set: { score: String(p.score), reasons: p.reasons, rawPayloadId: peers.rawPayloadId },
      });
  }
  return {
    status: "ok",
    error: null,
    self: { unitid: String(self.id), name: self["school.name"], carnegie: carnegieLabel(self["school.carnegie_basic"]), region: REGION[self["school.region_id"] ?? -1] ?? "unknown" },
    suggested: scored.length,
  };
}

/** Accepting a suggestion creates or links a competitor with source ipeds_suggested. */
export async function reviewPeer(db: Db, opts: { siteId: string; orgId: string; peerId: string; status: "confirmed" | "rejected"; userId: string }) {
  const [peer] = await db.select().from(peerSuggestions).where(and(eq(peerSuggestions.id, opts.peerId), eq(peerSuggestions.siteId, opts.siteId)));
  if (!peer) throw new Error("Peer suggestion not found.");
  let competitorId = peer.competitorId;
  if (opts.status === "confirmed" && !competitorId) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(competitors).where(eq(competitors.orgId, opts.orgId));
    const [row] = await db
      .insert(competitors)
      .values({ orgId: opts.orgId, name: peer.name, ipedsUnitid: peer.ipedsUnitid, source: "ipeds_suggested", reasons: peer.reasons, sortOrder: n })
      .onConflictDoUpdate({ target: [competitors.orgId, competitors.name], set: { ipedsUnitid: peer.ipedsUnitid, reasons: peer.reasons } })
      .returning({ id: competitors.id });
    competitorId = row.id;
    if (peer.website) {
      try {
        const host = new URL(peer.website.startsWith("http") ? peer.website : `https://${peer.website}`).hostname;
        await db.insert(competitorDomains).values({ competitorId, domain: rootDomainOf(host) }).onConflictDoNothing();
      } catch {
        /* website not a URL */
      }
    }
  }
  const [after] = await db
    .update(peerSuggestions)
    .set({ status: opts.status, reviewedBy: opts.userId, competitorId })
    .where(eq(peerSuggestions.id, peer.id))
    .returning();
  return { before: peer, after };
}

export async function addManualPeer(db: Db, opts: { orgId: string; name: string; domain?: string | null }) {
  const name = opts.name.trim();
  if (!name) throw new Error("Name is required.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(competitors).where(eq(competitors.orgId, opts.orgId));
  const [row] = await db
    .insert(competitors)
    .values({ orgId: opts.orgId, name, source: "manual", sortOrder: n })
    .onConflictDoNothing()
    .returning();
  if (row && opts.domain) await db.insert(competitorDomains).values({ competitorId: row.id, domain: rootDomainOf(opts.domain.trim()) }).onConflictDoNothing();
  return row ?? null;
}

export async function listPeers(db: Db, siteId: string, orgId: string) {
  const suggestions = await db.select().from(peerSuggestions).where(eq(peerSuggestions.siteId, siteId)).orderBy(sql`${peerSuggestions.score} DESC NULLS LAST`, asc(peerSuggestions.name));
  const comps = await db.select().from(competitors).where(eq(competitors.orgId, orgId)).orderBy(asc(competitors.sortOrder));
  return { suggestions, competitors: comps };
}

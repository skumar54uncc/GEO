/**
 * Campaign Demand view model (P2 B1).
 * Non-demo orgs never surface fixture/demo_seed rows — only real fetches with stored provenance.
 */
import { and, desc, eq } from "drizzle-orm";
import { DEMO_SEED_MARKER, isForbiddenSeedMarker } from "@/lib/contracts/demoSeed";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, demandSignals, organizations } from "@/lib/db/pg/schema";
import { DEMAND_ADAPTERS } from "./adapters";
import type { EnvMap } from "./adapter";
import type { DemandCardStatus, DemandConnectionStatus, DemandSource } from "./types";

export type { DemandCardStatus };

export type DemandSignalRow = {
  id: string;
  source: DemandSource;
  term: string;
  value: Record<string, unknown> | null;
  fetchedAt: string;
  provenance: string;
};

export type DemandSourceCard = {
  id: string;
  source: DemandSource;
  label: string;
  provider: string;
  status: DemandCardStatus;
  connected: boolean;
  missing: string[];
  note: string;
  lastFetchAt: string | null;
  provenance: string | null;
  signals: DemandSignalRow[];
  /** Connected (or estimated) with no real rows yet. */
  notFetchedYet: boolean;
};

export type CampaignDemandView = {
  campaign: { id: string; name: string; topic: string };
  organization: { id: string; name: string; isDemo: boolean };
  sources: DemandSourceCard[];
};

/** Trends is live only when explicitly approved in env. */
function trendsLiveApproved(env: EnvMap): boolean {
  const v = String(env.GOOGLE_TRENDS_LIVE_APPROVED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Copy shown when Search Console property access is still pending (COVERAGE row 19). */
export const GSC_ACCESS_PENDING_LABEL =
  "Not connected (property access pending from the web team)";

export function enrichConnectionStatus(
  base: DemandConnectionStatus,
  env: EnvMap = process.env,
): DemandConnectionStatus {
  if (!base.connected || base.status === "not_connected") {
    if (base.source === "search_console") {
      return {
        ...base,
        status: "not_connected",
        connected: false,
        note: GSC_ACCESS_PENDING_LABEL,
      };
    }
    return { ...base, status: "not_connected", connected: false };
  }
  if (base.source === "google_trends" && !trendsLiveApproved(env)) {
    return {
      ...base,
      status: "approval_pending",
      connected: false,
      note: `${base.note} Not connected (approval pending): set GOOGLE_TRENDS_LIVE_APPROVED after Trends access is approved.`,
    };
  }
  // Keys present → connected. Paid DataForSEO paths stay estimate-gated at fetch time.
  // "estimated" is reserved for modeled *values*, applied when signals are loaded.
  return { ...base, status: "connected", connected: true };
}

export function listDemandSourceCards(env: EnvMap = process.env): DemandConnectionStatus[] {
  return DEMAND_ADAPTERS.map((a) => enrichConnectionStatus(a.connectionStatus(env), env));
}

export function demandStatusLabel(status: DemandCardStatus, source?: DemandSource): string {
  if (status === "not_connected" && source === "search_console") return GSC_ACCESS_PENDING_LABEL;
  if (status === "not_connected") return "not connected";
  if (status === "approval_pending") return "Not connected (approval pending)";
  if (status === "estimated") return "estimated";
  return "connected";
}

function provenanceOf(value: Record<string, unknown> | null, isDemo: boolean): string {
  if (value && typeof value.seedMarker === "string") return value.seedMarker;
  if (value && typeof value.provenance === "string") return value.provenance;
  if (isDemo) return DEMO_SEED_MARKER;
  return "stored";
}

/** Fixture / demo seed rows must never appear under a non-demo org. */
export function isFixtureOrDemoSignal(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  if (typeof value.seedMarker === "string" && isForbiddenSeedMarker(value.seedMarker)) return true;
  if (typeof value.provenance === "string" && isForbiddenSeedMarker(value.provenance)) return true;
  if (value.provenance === "fixture" || value.provenance === "fixture_only") return true;
  if (typeof value.provenance === "string" && /^fixture/i.test(value.provenance)) return true;
  if (typeof value.label === "string" && /fixture/i.test(value.label)) return true;
  if (typeof value.sourceLabel === "string" && /fixture/i.test(value.sourceLabel)) return true;
  return false;
}

/**
 * Non-demo orgs only show rows from a real fetch with stored provenance.
 * Missing provenance = not shown (treated as fixture/unverified).
 */
export function isRealFetchSignal(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  if (isFixtureOrDemoSignal(value)) return false;
  const p = value.provenance;
  if (typeof p !== "string" || !p.trim()) return false;
  return true;
}

function signalIsModeledEstimate(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  if (value.volumeKind === "modeled") return true;
  if (value.kind === "llm_mentions" && value.mentionEstimate == null && value.capability === "unknown") return true;
  return false;
}

export async function loadCampaignDemand(
  db: Db,
  opts: { orgId: string; campaignId: string; env?: EnvMap },
): Promise<CampaignDemandView | null> {
  const env = opts.env ?? process.env;
  const [row] = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      topic: campaigns.topic,
      orgId: organizations.id,
      orgName: organizations.name,
      isDemo: organizations.isDemo,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)))
    .limit(1);
  if (!row) return null;

  const connections = listDemandSourceCards(env);
  const signalRows = await db
    .select({
      id: demandSignals.id,
      source: demandSignals.source,
      term: demandSignals.term,
      value: demandSignals.value,
      fetchedAt: demandSignals.fetchedAt,
    })
    .from(demandSignals)
    .where(eq(demandSignals.campaignId, opts.campaignId))
    .orderBy(desc(demandSignals.fetchedAt));

  const bySource = new Map<DemandSource, typeof signalRows>();
  for (const s of signalRows) {
    const list = bySource.get(s.source) ?? [];
    list.push(s);
    bySource.set(s.source, list);
  }

  const sources: DemandSourceCard[] = connections.map((c) => {
    const rawRows = bySource.get(c.source) ?? [];
    const visibleRows = row.isDemo
      ? rawRows
      : rawRows.filter((s) => isRealFetchSignal((s.value as Record<string, unknown> | null) ?? null));

    const last = visibleRows[0] ?? null;
    const signals: DemandSignalRow[] = visibleRows.map((s) => {
      const value = (s.value as Record<string, unknown> | null) ?? null;
      return {
        id: s.id,
        source: s.source,
        term: s.term,
        value,
        fetchedAt: s.fetchedAt.toISOString(),
        provenance: provenanceOf(value, row.isDemo),
      };
    });

    let status: DemandCardStatus = c.status;
    let connected = c.connected;
    let note = c.note;

    if (row.isDemo && signals.length > 0) {
      status = "connected";
      connected = true;
      note = `${c.note} Demo fixtures (${DEMO_SEED_MARKER}).`;
    } else if (
      !row.isDemo &&
      signals.length > 0 &&
      signals.every((s) => signalIsModeledEstimate(s.value))
    ) {
      // Modeled estimate *values* — not a stand-in for "not fetched".
      status = "estimated";
      connected = true;
    }

    const notFetchedYet =
      !row.isDemo &&
      (status === "connected" || status === "estimated") &&
      signals.length === 0 &&
      c.status === "connected";

    if (notFetchedYet) {
      note = `${note} Connected, not fetched yet.`;
    }

    return {
      id: c.id,
      source: c.source,
      label: c.label,
      provider: c.provider,
      status,
      connected,
      missing: c.missing,
      note,
      lastFetchAt: last ? last.fetchedAt.toISOString() : null,
      provenance: last ? provenanceOf((last.value as Record<string, unknown> | null) ?? null, row.isDemo) : null,
      signals,
      notFetchedYet,
    };
  });

  return {
    campaign: { id: row.campaignId, name: row.campaignName, topic: row.topic },
    organization: { id: row.orgId, name: row.orgName, isDemo: row.isDemo },
    sources,
  };
}

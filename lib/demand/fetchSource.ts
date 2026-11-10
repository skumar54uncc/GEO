/**
 * Estimate-gated demand source fetch for a campaign.
 * Demo org refuses live paid calls and keeps demo_seed:v1 fixtures.
 * Exa free tier may run live when EXA_API_KEY is set and org is not demo.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, organizations } from "@/lib/db/pg/schema";
import { demandAdapterFor } from "./adapters";
import type { EnvMap } from "./adapter";
import { enrichConnectionStatus } from "./campaignView";
import { demandFixtureFor } from "./fixtures";
import { storeDemandSignals } from "./store";
import type { DemandApproval, DemandSource } from "./types";
import { DemandApprovalError, DemandNotConnectedError, DemandUnavailableError } from "./types";

export async function fetchCampaignDemandSource(
  db: Db,
  opts: {
    orgId: string;
    campaignId: string;
    source: DemandSource;
    term: string;
    approval?: DemandApproval;
    env?: EnvMap;
    /** Test-only: force fixture path even when connected for live-capable sources. */
    forceFixture?: boolean;
  },
): Promise<{ inserted: number; status: string; source: DemandSource }> {
  const env = opts.env ?? process.env;
  const [row] = await db
    .select({
      campaignId: campaigns.id,
      isDemo: organizations.isDemo,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)))
    .limit(1);
  if (!row) throw new DemandNotConnectedError("Campaign not found.", ["campaign"]);

  if (row.isDemo) {
    throw new DemandApprovalError("Demo org uses bannered demo_seed:v1 fixtures only; live demand fetch is refused.");
  }

  const adapter = demandAdapterFor(opts.source);
  const status = enrichConnectionStatus(adapter.connectionStatus(env), env);
  if (status.status === "not_connected" || status.status === "approval_pending") {
    return { inserted: 0, status: status.status, source: opts.source };
  }

  const request = { campaignId: opts.campaignId, term: opts.term.trim() || "demand" };
  const estimate = adapter.estimate(request, env);

  // Paid DataForSEO surfaces require matching estimate approval before any call.
  if (opts.source === "keyword_volume" || opts.source === "llm_mentions") {
    const approval = opts.approval;
    if (
      !approval ||
      approval.paramsHash !== estimate.paramsHash ||
      approval.units !== estimate.units ||
      approval.priceUsd !== null ||
      approval.acknowledgedUnknownPrice !== true
    ) {
      throw new DemandApprovalError("Explicit approval must exactly match the current estimate.");
    }
  }

  // Live Exa when key exists. Fixture rows are never shown for non-demo orgs — only tests may forceFixture.
  const canLiveExa = opts.source === "exa" && Boolean(String(env.EXA_API_KEY ?? "").trim());
  if (!canLiveExa) {
    if (!opts.forceFixture) {
      throw new DemandUnavailableError(
        `${opts.source} live fetch is not enabled for non-demo orgs; fixture demand data is never shown here.`,
      );
    }
    const result = await adapter.run(db, {
      orgId: opts.orgId,
      request,
      approval: opts.approval ?? {
        paramsHash: estimate.paramsHash,
        units: estimate.units,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      fixture: demandFixtureFor(opts.source),
      env,
    });
    const stored = await storeDemandSignals(db, { campaignId: opts.campaignId, result });
    return { inserted: stored.inserted, status: result.connected ? "ok" : "not_connected", source: opts.source };
  }

  // Exa free tier live: call API, never invent rows on failure.
  const live = await fetchExaLive(opts.term, env);
  if (!live.ok) {
    return { inserted: 0, status: "error", source: opts.source };
  }
  const result = {
    connected: true as const,
    status: "ok" as const,
    source: opts.source,
    mode: "fixture_only" as const,
    paramsHash: estimate.paramsHash,
    signals: live.signals.map((s) => ({ term: s.term, value: s.value, source: opts.source })),
  };
  const stored = await storeDemandSignals(db, { campaignId: opts.campaignId, result });
  return { inserted: stored.inserted, status: "ok", source: opts.source };
}

async function fetchExaLive(
  term: string,
  env: EnvMap,
): Promise<{ ok: true; signals: Array<{ term: string; value: Record<string, unknown> }> } | { ok: false }> {
  const key = String(env.EXA_API_KEY ?? "").trim();
  if (!key) return { ok: false };
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query: term,
        numResults: 5,
        type: "auto",
        contents: { text: false },
      }),
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string }>;
    };
    const results = (json.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title ?? r.url!,
        url: r.url!,
        venue: /reddit\.com/i.test(r.url!) ? "reddit" : "web",
      }));
    return {
      ok: true,
      signals: [
        {
          term,
          value: {
            kind: "exa_discussion",
            results,
            provenance: "exa_live",
          },
        },
      ],
    };
  } catch {
    return { ok: false };
  }
}

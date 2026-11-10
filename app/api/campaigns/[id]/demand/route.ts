import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { demandAdapterFor, fetchCampaignDemandSource, loadCampaignDemand } from "@/lib/demand";
import {
  DemandApprovalError,
  DemandNotConnectedError,
  DemandUnavailableError,
  type DemandSource,
} from "@/lib/demand/types";
import { getDb } from "@/lib/db/pg/client";
import { demandSourceEnum } from "@/lib/db/pg/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const sourceValues = demandSourceEnum.enumValues as unknown as [DemandSource, ...DemandSource[]];

const postBody = z.object({
  source: z.enum(sourceValues),
  term: z.string().trim().min(1).max(500).optional(),
  approval: z
    .object({
      paramsHash: z.string().min(1),
      units: z.number().int().positive(),
      priceUsd: z.null(),
      acknowledgedUnknownPrice: z.literal(true),
    })
    .optional(),
  estimate_only: z.boolean().optional(),
});

/** Campaign Demand snapshot: connection cards + stored signals. Never invents zeros. */
export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const view = await loadCampaignDemand(getDb(), { orgId: user.orgId, campaignId: id.data });
  if (!view) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(view);
});

/**
 * Estimate or fetch one demand source for the campaign.
 * DataForSEO keywords + LLM Mentions are estimate-gated.
 * Demo org refuses live fetch (fixtures only).
 */
export const POST = withRole<Params>("editor", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const parsed = postBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const db = getDb();
  const view = await loadCampaignDemand(db, { orgId: user.orgId, campaignId: id.data });
  if (!view) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const term = parsed.data.term ?? view.campaign.topic ?? view.campaign.name;
  const adapter = demandAdapterFor(parsed.data.source);
  const estimate = adapter.estimate({ campaignId: id.data, term });

  if (parsed.data.estimate_only) {
    return NextResponse.json({ estimate, snapshot: view });
  }

  try {
    const result = await fetchCampaignDemandSource(db, {
      orgId: user.orgId,
      campaignId: id.data,
      source: parsed.data.source,
      term,
      approval: parsed.data.approval,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "demand.fetch_source",
      entityType: "campaign",
      entityId: id.data,
      after: { source: parsed.data.source, inserted: result.inserted, status: result.status },
    });
    const next = await loadCampaignDemand(db, { orgId: user.orgId, campaignId: id.data });
    return NextResponse.json({ ...result, estimate, snapshot: next });
  } catch (err) {
    if (err instanceof DemandApprovalError) {
      return NextResponse.json({ refused: true, error: err.message, estimate, snapshot: view }, { status: 409 });
    }
    if (err instanceof DemandUnavailableError) {
      return NextResponse.json({ refused: true, error: err.message, estimate, snapshot: view }, { status: 409 });
    }
    if (err instanceof DemandNotConnectedError) {
      return NextResponse.json({ error: err.message, missing: err.missing, snapshot: view }, { status: 400 });
    }
    throw err;
  }
});

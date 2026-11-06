import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { ENGINES, RUNNERS } from "@/lib/capture/types";
import { citationAggregates, CitationBoundaryError } from "@/lib/citations/aggregates";
import { getDb } from "@/lib/db/pg/client";
import { SEARCH_INDEXES } from "@/lib/metrics/indexes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  campaign_id: z.string().uuid(),
  scan_id: z.string().uuid().optional(),
  engine: z.enum(ENGINES),
  runner: z.enum(RUNNERS),
  fidelity: z.enum(["high", "medium", "low"]),
  index: z.enum(SEARCH_INDEXES),
});

export const GET = withRole("viewer", async (req, { user }) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "campaign_id, engine, runner, fidelity, and index boundaries are required", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await citationAggregates(getDb(), {
        orgId: user.orgId,
        campaignId: parsed.data.campaign_id,
        scanId: parsed.data.scan_id,
        engine: parsed.data.engine,
        runner: parsed.data.runner,
        fidelity: parsed.data.fidelity,
        index: parsed.data.index,
      }),
    );
  } catch (error) {
    if (error instanceof CitationBoundaryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
});

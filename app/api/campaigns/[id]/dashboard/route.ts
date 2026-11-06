import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Campaign dashboard: latest rollup per prompt set, trend, McNemar vs previous, open alerts, model events. Read only. */
export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  try {
    return NextResponse.json(await rollupCampaignDashboard(getDb(), { orgId: user.orgId, campaignId: id.data }));
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});

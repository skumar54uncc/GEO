import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError, getCampaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { listOverviewQuestions } from "@/lib/overview/questions";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withRole<Params>("viewer", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const url = new URL(req.url);
  const tab = z.enum(["all", "lost", "won"]).safeParse(url.searchParams.get("tab") ?? "all");
  const engine = url.searchParams.get("engine") ?? undefined;
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const includeBranded = url.searchParams.get("includeBranded") === "1";
  try {
    await getCampaign(getDb(), user.orgId, id.data);
    const dash = await rollupCampaignDashboard(getDb(), { orgId: user.orgId, campaignId: id.data });
    const view = dash.promptSets[0];
    if (!view)
      return NextResponse.json({
        rows: [],
        total: 0,
        scanId: null,
        tabCounts: { all: 0, lost: 0, won: 0 },
        hiddenBrandedCount: 0,
      });
    const result = await listOverviewQuestions(getDb(), {
      orgId: user.orgId,
      scanId: view.latestScan.id,
      engine,
      tab: tab.success ? tab.data : "all",
      offset: Number.isFinite(offset) ? offset : 0,
      limit,
      includeBranded,
      enginesTotal: 6,
    });
    return NextResponse.json({ ...result, scanId: view.latestScan.id });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});

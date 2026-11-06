import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError, getCampaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { strategyReports } from "@/lib/db/pg/schema";
import { getStrategyReport } from "@/lib/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** List strategy reports for a campaign (newest first). */
export const GET = withRole<Params>("viewer", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  try {
    await getCampaign(getDb(), user.orgId, id.data);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
  const url = new URL(req.url);
  const reportId = url.searchParams.get("reportId");
  if (reportId) {
    const report = await getStrategyReport(getDb(), reportId);
    if (!report || report.campaignId !== id.data) {
      return NextResponse.json({ error: "Strategy report not found." }, { status: 404 });
    }
    return NextResponse.json({ report });
  }
  const rows = await getDb()
    .select({
      id: strategyReports.id,
      topic: strategyReports.topic,
      createdAt: strategyReports.createdAt,
    })
    .from(strategyReports)
    .where(eq(strategyReports.campaignId, id.data))
    .orderBy(desc(strategyReports.createdAt));
  return NextResponse.json({
    reports: rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError, getCampaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { organizations } from "@/lib/db/pg/schema";
import { eq } from "drizzle-orm";
import { buildStrategyExportMetadata, exportStrategyPlanCsv, getStrategyReport } from "@/lib/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** CSV export of a strategy plan. Demo orgs get the DEMO DATA banner. */
export const GET = withRole<Params>("viewer", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const reportId = new URL(req.url).searchParams.get("reportId");
  if (!reportId || !z.string().uuid().safeParse(reportId).success) {
    return NextResponse.json({ error: "reportId must be a uuid" }, { status: 400 });
  }
  const db = getDb();
  try {
    await getCampaign(db, user.orgId, id.data);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
  const report = await getStrategyReport(db, reportId);
  if (!report || report.campaignId !== id.data) {
    return NextResponse.json({ error: "Strategy report not found." }, { status: 404 });
  }
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, user.orgId));
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const meta = buildStrategyExportMetadata({
    organizationId: org.id,
    organizationName: org.name,
    isDemo: org.isDemo,
  });
  const { csv } = exportStrategyPlanCsv(report, meta);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="strategy-${report.topic.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.csv"`,
    },
  });
});

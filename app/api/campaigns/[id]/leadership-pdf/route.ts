import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logged-in Overview + Visibility leadership PDF. Closes COVERAGE row 28. */
export const GET = withRole<{ id: string }>("viewer", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  try {
    const db = getDb();
    const dash = await rollupCampaignDashboard(db, { orgId: user.orgId, campaignId: params.id });
    const view = dash.promptSets[0] ?? null;
    const cells =
      view?.rollup.cells.filter(
        (c) => !c.key.branded && c.key.personaId == null && c.key.personaGroup == null && c.key.regionId == null,
      ) ?? [];
    const primary = cells[0] ?? null;
    const comparison = primary
      ? view?.comparisons.find(
          (c) => c.series.engine === primary.key.engine && c.series.runner === primary.key.runner && !c.series.branded,
        )
      : null;
    const baselineScanIds = (view?.trend ?? []).filter((t) => t.isBaseline).map((t) => t.scanId);
    const latestTrend = view?.trend[view.trend.length - 1];
    const origin = new URL(req.url).origin;
    const bytes = leadershipPdfBytes({
      organization: {
        name: dash.organization.name,
        isDemo: Boolean(dash.organization.isDemo),
      },
      campaign: { name: dash.campaign.name, topic: dash.campaign.topic },
      methodologyUrl: `${origin}/how-we-measure`,
      headline: primary
        ? {
            engine: primary.key.engine,
            runner: primary.key.runner,
            won: primary.promptsWon?.won ?? null,
            prompts: primary.promptsWon?.prompts ?? null,
            rate: primary.promptsWon?.rate ?? null,
            ciLow: primary.promptsWon?.ciLow ?? null,
            ciHigh: primary.promptsWon?.ciHigh ?? null,
            draws: primary.draws,
          }
        : null,
      trendLabel: comparison?.label ?? null,
      engines: cells.map((c) => ({
        engine: c.key.engine,
        runner: c.key.runner,
        rate: c.promptsWon?.rate ?? null,
        draws: c.draws,
      })),
      analystNote:
        dash.analystNote?.status === "published"
          ? {
              text: dash.analystNote.text,
              authorName: dash.analystNote.authorName,
              at: dash.analystNote.at,
            }
          : null,
      baselineScanIds,
      target: dash.target,
      latestScan: view
        ? {
            id: view.latestScan.id,
            createdAt: view.latestScan.createdAt,
            isBaseline: Boolean(latestTrend?.isBaseline && latestTrend.scanId === view.latestScan.id),
          }
        : null,
    });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="leadership-${params.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { leadershipPdfInputFromCells, type PdfCell } from "@/lib/exports/leadershipPdfInput";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logged-in Overview + Visibility leadership PDF. Closes COVERAGE row 28. */
export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  try {
    const db = getDb();
    const dash = await rollupCampaignDashboard(db, { orgId: user.orgId, campaignId: params.id });
    const view = dash.promptSets[0] ?? null;
    const cells: PdfCell[] =
      view?.rollup.cells
        .filter(
          (c) => !c.key.branded && c.key.personaId == null && c.key.personaGroup == null && c.key.regionId == null,
        )
        .map((c) => ({
          engine: c.key.engine,
          runner: c.key.runner,
          won: c.promptsWon?.won ?? null,
          prompts: c.promptsWon?.prompts ?? null,
          rate: c.promptsWon?.rate ?? null,
          ciLow: c.promptsWon?.ciLow ?? null,
          ciHigh: c.promptsWon?.ciHigh ?? null,
          draws: c.draws,
        })) ?? [];
    const input = leadershipPdfInputFromCells({
      organization: {
        name: dash.organization.name,
        isDemo: Boolean(dash.organization.isDemo),
      },
      campaign: { name: dash.campaign.name, topic: dash.campaign.topic },
      cells,
      target: dash.target,
      trendLabel: null,
      previousScanDate: view?.previousScan?.createdAt.slice(0, 10) ?? null,
      analystNote:
        dash.analystNote?.status === "published"
          ? {
              text: dash.analystNote.text,
              authorName: dash.analystNote.authorName,
              at: dash.analystNote.at,
              status: "published",
            }
          : null,
      baselineDate: (view?.trend ?? []).find((t) => t.isBaseline)?.createdAt.slice(0, 10) ?? null,
      latestScan: view
        ? {
            createdAt: view.latestScan.createdAt,
            isBaseline: Boolean(
              view.trend[view.trend.length - 1]?.isBaseline &&
                view.trend[view.trend.length - 1]?.scanId === view.latestScan.id,
            ),
          }
        : null,
      includeAccuracy: false,
      noMeasurementsYet: !dash.organization.isDemo && cells.every((c) => c.draws === 0),
    });
    // Trend follows the headline series (target + primary runner), not an arbitrary cells[0].
    if (input.headline) {
      input.trendLabel =
        view?.comparisons.find(
          (c) =>
            c.series.engine === input.headline!.engine &&
            c.series.runner === input.headline!.runner &&
            !c.series.branded,
        )?.label ?? null;
    }
    const bytes = leadershipPdfBytes(input);
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

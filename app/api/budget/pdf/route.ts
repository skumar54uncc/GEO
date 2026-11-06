import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { buildFundingPage } from "@/lib/budget/funding";
import { fundingPdfHtml } from "@/lib/budget/pdf";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-page printable HTML export (open/print to PDF). Demo orgs carry the DEMO DATA banner. */
export const GET = withRole("viewer", async (_req, { user }) => {
  const data = await buildFundingPage(getDb(), user.orgId);
  const html = fundingPdfHtml(data);
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="budget-funding.html"`,
    },
  });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { libraryExportToCsv, loadPromptLibraryExport } from "@/lib/prompts/libraryExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; setId: string };

/** Prompt library CSV for a frozen prompt set. Viewers and editors. */
export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  const campaignId = z.string().uuid().safeParse(params.id);
  const setId = z.string().uuid().safeParse(params.setId);
  if (!campaignId.success || !setId.success) {
    return NextResponse.json({ error: "id and setId must be uuids" }, { status: 400 });
  }
  const payload = await loadPromptLibraryExport(getDb(), {
    orgId: user.orgId,
    campaignId: campaignId.data,
    promptSetId: setId.data,
  });
  if (!payload) return NextResponse.json({ error: "Prompt set not found" }, { status: 404 });
  const csv = libraryExportToCsv(payload);
  const filename = `prompt-library-v${payload.promptSet.version}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

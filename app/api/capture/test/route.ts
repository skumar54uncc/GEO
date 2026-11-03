import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { bodyOf, captureErrors, captureTestOptions, drawDetail, runCaptureTest } from "@/lib/capture/service";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A UI provider capture can take several minutes.
export const maxDuration = 600;

export const GET = withRole("viewer", async (req, { user }) =>
  captureErrors(async () => {
    const db = getDb();
    const drawId = new URL(req.url).searchParams.get("draw_id");
    if (drawId) {
      const draw = await drawDetail(db, drawId, user.orgId);
      return draw ? NextResponse.json({ draw }) : NextResponse.json({ error: "Draw not found" }, { status: 404 });
    }
    return NextResponse.json(await captureTestOptions(db, user.orgId, new URL(req.url).searchParams.get("campaign_id")));
  }),
);

/** Without approved_usd: the estimate only. With approved_usd equal to that estimate: one real draw. */
export const POST = withRole("editor", async (req, { user }) =>
  captureErrors(async () => NextResponse.json(await runCaptureTest(getDb(), user, await bodyOf(req)))),
);

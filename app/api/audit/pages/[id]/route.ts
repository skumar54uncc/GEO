import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { siteErrors } from "@/lib/site/http";
import { pageDetail } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (req, { user, params }) =>
  siteErrors(async () => {
    const detail = await pageDetail(getDb(), user.orgId, params.id, new URL(req.url).searchParams.get("audit_run_id"));
    if (!detail) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    return NextResponse.json(detail);
  }),
);

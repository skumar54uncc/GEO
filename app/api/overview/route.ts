import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { buildOverview } from "@/lib/overview/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (_req, { user }) => {
  return NextResponse.json(await buildOverview(getDb(), user.orgId));
});

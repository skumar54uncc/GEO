import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { siteErrors } from "@/lib/site/http";
import { getSiteView } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) =>
  siteErrors(async () => NextResponse.json(await getSiteView(getDb(), user.orgId, params.id))),
);

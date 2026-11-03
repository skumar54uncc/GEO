import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getCampaign, NotFoundError, updateCampaign, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

function mapError(err: unknown) {
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  try {
    return NextResponse.json({ campaign: await getCampaign(getDb(), user.orgId, params.id) });
  } catch (err) {
    return mapError(err);
  }
});

export const PATCH = withRole<Params>("editor", async (req, { user, params }) => {
  try {
    return NextResponse.json({ campaign: await updateCampaign(getDb(), user, params.id, await req.json()) });
  } catch (err) {
    return mapError(err);
  }
});

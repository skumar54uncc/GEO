import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { saveProfile } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saves the user confirmed entity profile used as expected values by entity.check. */
export const PUT = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const body = await jsonBody(req);
    const { before, after } = await saveProfile(db, { siteId: params.id, orgId: user.orgId, userId: user.userId, profile: body });
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "brand.profile.confirm", entityType: "site", entityId: params.id, before, after });
    return NextResponse.json({ profile: after });
  }),
);

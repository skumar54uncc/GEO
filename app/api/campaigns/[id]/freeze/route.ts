import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { freezePromptSet } from "@/lib/promptSets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRole<{ id: string }>("editor", async (_req, { user, params }) => {
  const db = getDb();
  try {
    const result = await freezePromptSet(db, user.orgId, params.id);
    if (result.created) {
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "prompt_set.freeze",
        entityType: "prompt_set",
        entityId: result.set.id,
        after: { version: result.set.version, sha256: result.set.sha256, items: result.itemCount },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Campaign not found.") return NextResponse.json({ error: message }, { status: 404 });
    if (message === "No approved prompts to freeze.") return NextResponse.json({ error: message }, { status: 400 });
    throw err;
  }
});

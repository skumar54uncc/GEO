import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { patchPrompt, PromptNotFoundError, PromptValidationError, promptPatch } from "@/lib/prompts/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid prompt id" }, { status: 400 });
  }
  const parsed = promptPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!Object.keys(parsed.data).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const db = getDb();
  try {
    const before = null;
    const row = await patchPrompt(db, user.orgId, params.id, parsed.data);
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "prompt.patch",
      entityType: "prompt",
      entityId: params.id,
      before,
      after: parsed.data,
    });
    return NextResponse.json({ prompt: row });
  } catch (err) {
    if (err instanceof PromptNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});

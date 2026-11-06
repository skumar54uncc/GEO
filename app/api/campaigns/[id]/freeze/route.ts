import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { freezePromptSet } from "@/lib/promptSets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    filter: z.enum(["all", "core", "persona"]).optional(),
    label: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .optional();

export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  const db = getDb();
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const filter = parsed.data?.filter ?? "all";
  const label = parsed.data?.label ?? null;
  try {
    const result = await freezePromptSet(db, user.orgId, params.id, { filter, label });
    if (result.created) {
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "prompt_set.freeze",
        entityType: "prompt_set",
        entityId: result.set.id,
        after: { version: result.set.version, sha256: result.set.sha256, items: result.itemCount, filter, label },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Campaign not found.") return NextResponse.json({ error: message }, { status: 404 });
    if (
      message === "No approved prompts to freeze." ||
      message.startsWith("A label is required") ||
      message.includes("refusing")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw err;
  }
});

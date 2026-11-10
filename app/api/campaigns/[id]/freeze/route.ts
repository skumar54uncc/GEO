import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { FreezeFixtureError, FreezeUnbrandedError, freezePromptSet } from "@/lib/promptSets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    filter: z.enum(["all", "core", "persona"]).optional(),
    label: z.string().trim().min(1).max(120).nullable().optional(),
    /** Required when freezing below the 70% unbranded default. */
    unbrandedOverrideReason: z.string().trim().min(3).max(2000).nullable().optional(),
  })
  .optional();

export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  const db = getDb();
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const filter = parsed.data?.filter ?? "all";
  const label = parsed.data?.label ?? null;
  const unbrandedOverrideReason = parsed.data?.unbrandedOverrideReason ?? null;
  try {
    const result = await freezePromptSet(db, user.orgId, params.id, {
      filter,
      label,
      unbrandedOverrideReason,
    });
    if (result.created) {
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "prompt_set.freeze",
        entityType: "prompt_set",
        entityId: result.set.id,
        after: {
          version: result.set.version,
          sha256: result.set.sha256,
          items: result.itemCount,
          filter,
          label,
          unbrandedShare: result.brandedShare.unbrandedShare,
          unbrandedOverrideReason: result.unbrandedOverrideReason,
        },
      });
    } else if (result.unbrandedOverrideReason) {
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "prompt_set.freeze_unbranded_override",
        entityType: "prompt_set",
        entityId: result.set.id,
        after: {
          version: result.set.version,
          unbrandedShare: result.brandedShare.unbrandedShare,
          unbrandedOverrideReason: result.unbrandedOverrideReason,
          created: false,
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Campaign not found.") return NextResponse.json({ error: message }, { status: 404 });
    if (err instanceof FreezeFixtureError) {
      return NextResponse.json({ error: message, code: "fixture_freeze_blocked" }, { status: 400 });
    }
    if (err instanceof FreezeUnbrandedError) {
      return NextResponse.json({ error: message, code: "unbranded_share" }, { status: 400 });
    }
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

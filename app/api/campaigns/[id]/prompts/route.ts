import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { bulkBody, bulkSetStatus, listPromptsForReview, PromptNotFoundError, PromptValidationError, promptCounts } from "@/lib/prompts/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const db = getDb();
  try {
    const brandedParam = url.searchParams.get("branded");
    const persona = url.searchParams.get("persona") ?? undefined;
    const prompts = await listPromptsForReview(db, {
      orgId: user.orgId,
      campaignId: params.id,
      pillar: url.searchParams.get("pillar") ?? undefined,
      personaKey: persona as "neutral" | string | undefined,
      region: url.searchParams.get("region") ?? undefined,
      branded: brandedParam === "true" ? true : brandedParam === "false" ? false : undefined,
      status: (url.searchParams.get("status") as "draft" | "approved" | "rejected" | null) ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    const counts = await promptCounts(db, params.id);
    return NextResponse.json({ prompts, counts });
  } catch (err) {
    if (err instanceof PromptNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});

/** Bulk approve / reject / draft for this campaign. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const parsed = bulkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const db = getDb();
  try {
    const n = await bulkSetStatus(db, user.orgId, params.id, parsed.data.ids, parsed.data.status);
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "prompts.bulk_status",
      entityType: "campaign",
      entityId: params.id,
      after: { status: parsed.data.status, count: n },
    });
    return NextResponse.json({ updated: n });
  } catch (err) {
    if (err instanceof PromptNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});

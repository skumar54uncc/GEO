import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { campaignPersonas, campaigns, personas } from "@/lib/db/pg/schema";
import { createCustomPrompt } from "@/lib/prompts/custom";
import {
  bulkBody,
  bulkSetStatus,
  listPromptsForReview,
  PromptNotFoundError,
  PromptValidationError,
  promptCounts,
  reviewDedupeStatus,
} from "@/lib/prompts/review";

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
      provenance: url.searchParams.get("provenance") ?? undefined,
      intent: url.searchParams.get("intent") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    const [counts, dedupeStatus] = await Promise.all([promptCounts(db, params.id), reviewDedupeStatus()]);
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, params.id), eq(campaigns.orgId, user.orgId)));
    const personaRows = campaign
      ? await db
          .select({
            id: personas.id,
            key: personas.key,
            name: personas.name,
            group: personas.personaGroup,
          })
          .from(campaignPersonas)
          .innerJoin(personas, eq(personas.id, campaignPersonas.personaId))
          .where(eq(campaignPersonas.campaignId, params.id))
          .orderBy(asc(personas.name))
      : [];
    // Fallback: org library personas when the campaign has none attached yet.
    const allPersonas =
      personaRows.length > 0
        ? personaRows
        : await db
            .select({
              id: personas.id,
              key: personas.key,
              name: personas.name,
              group: personas.personaGroup,
            })
            .from(personas)
            .orderBy(asc(personas.name))
            .limit(40);
    return NextResponse.json({ prompts, counts, dedupeStatus, personas: allPersonas });
  } catch (err) {
    if (err instanceof PromptNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});

/** Bulk approve / reject / draft, or create a custom draft prompt. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const db = getDb();
  try {
    if (body && typeof body === "object" && !Array.isArray(body) && (body as { action?: string }).action === "create_custom") {
      const prompt = await createCustomPrompt(db, {
        orgId: user.orgId,
        campaignId: params.id,
        raw: body,
        authorId: user.userId,
      });
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "prompts.create_custom",
        entityType: "prompt",
        entityId: prompt.id,
        after: {
          status: prompt.status,
          intent: prompt.intent,
          branded: prompt.branded,
          provenance: prompt.provenance,
          authorId: prompt.authorId,
          note: prompt.note,
        },
      });
      return NextResponse.json({ prompt }, { status: 201 });
    }
    const parsed = bulkBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const n = await bulkSetStatus(db, user.orgId, params.id, parsed.data.ids, parsed.data.status, {
      approvedById: user.userId,
    });
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

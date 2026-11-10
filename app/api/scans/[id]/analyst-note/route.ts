import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { WriterModelConfigError } from "@/lib/fireworks";
import {
  AnalystNoteError,
  draftAnalystNoteAi,
  setAnalystNote,
} from "@/lib/scans/analystNote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.union([
  z.object({
    action: z.literal("save"),
    text: z.string().trim().min(1).max(4000),
    status: z.enum(["draft", "published"]),
  }),
  z.object({
    action: z.literal("ai_draft"),
    headline: z.string().trim().min(1).max(2000),
  }),
]);

export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid scan id" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  try {
    if (parsed.data.action === "ai_draft") {
      const scan = await draftAnalystNoteAi(db, {
        orgId: user.orgId,
        scanId: params.id,
        authorId: user.userId,
        headline: parsed.data.headline,
      });
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "scan.analyst_note_draft",
        entityType: "scan",
        entityId: params.id,
        after: { status: scan.analystNoteStatus },
      });
      return NextResponse.json({ scan, label: "Draft" });
    }

    const scan = await setAnalystNote(db, {
      orgId: user.orgId,
      scanId: params.id,
      authorId: user.userId,
      text: parsed.data.text,
      status: parsed.data.status,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "scan.analyst_note",
      entityType: "scan",
      entityId: params.id,
      after: { status: scan.analystNoteStatus },
    });
    return NextResponse.json({ scan });
  } catch (err) {
    if (err instanceof WriterModelConfigError || err instanceof AnalystNoteError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnswerExplorerDraw, AnswerNotFoundError } from "@/lib/analysis/answerExplorer";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  try {
    return NextResponse.json(await getAnswerExplorerDraw(getDb(), { orgId: user.orgId, drawId: id.data }));
  } catch (error) {
    if (error instanceof AnswerNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
});

import { NextResponse } from "next/server";
import { withLegacyRole } from "@/lib/auth";
import { getStore } from "@/lib/db";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy Energy prompt list (SQLite-era store). Campaign review uses /api/campaigns/[id]/prompts. */
export const GET = withLegacyRole("viewer", async () => {
  return NextResponse.json({ prompts: await getStore().listPrompts() });
});

export const POST = withLegacyRole("editor", async (req) => {
  const body = (await req.json()) as { text: string; audience: Audience; subtopics: string[] };
  if (!body.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const prompt = await getStore().createPrompt({
    text: body.text.trim(),
    audience: body.audience,
    subtopics: body.subtopics ?? [],
  });
  return NextResponse.json({ prompt });
});

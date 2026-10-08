import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import type { Audience } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  return NextResponse.json({ prompts: store.listPrompts() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { text: string; audience: Audience; subtopics: string[] };
  if (!body.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const prompt = getStore().createPrompt({
    text: body.text.trim(),
    audience: body.audience,
    subtopics: body.subtopics ?? [],
  });
  return NextResponse.json({ prompt });
}

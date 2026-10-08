import { NextResponse } from "next/server";
import { generateRecommendations } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await generateRecommendations();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, briefs: [], campaign: null, used_model: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

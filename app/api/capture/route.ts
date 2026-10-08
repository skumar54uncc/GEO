import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { MANUAL_SURFACES, type ManualSurface } from "@/lib/types";
import type { UpsertResponseInput } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    prompt_id: number;
    location_note: string;
    runs: Partial<Record<ManualSurface, [string, string, string]>>;
  };
  const store = getStore();
  const prompt = store.getPrompt(body.prompt_id);
  if (!prompt) return NextResponse.json({ error: "unknown prompt" }, { status: 404 });
  const location_note = (body.location_note || "").trim();
  if (!location_note) return NextResponse.json({ error: "location_note required on every save" }, { status: 400 });

  const rows: UpsertResponseInput[] = [];
  for (const surface of MANUAL_SURFACES) {
    const triple = body.runs?.[surface];
    if (!triple) continue;
    triple.forEach((text, idx) => {
      const raw = (text || "").trim();
      if (!raw) return;
      rows.push({
        prompt_id: body.prompt_id,
        surface,
        run_number: idx + 1,
        raw_text: raw,
        source_type: "manual",
        location_note,
      });
    });
  }
  const saved = rows.length ? store.upsertResponses(rows) : [];
  store.saveConfig({ last_location_note: location_note });
  return NextResponse.json({ saved: saved.length, responses: saved, coverage: store.coverage().find((c) => c.prompt.id === body.prompt_id) });
}

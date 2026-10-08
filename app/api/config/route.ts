import { NextResponse } from "next/server";
import { getStore, storeBackend } from "@/lib/db";
import type { AppConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  return NextResponse.json({ config: store.getConfig(), backend: storeBackend() });
}

export async function PUT(req: Request) {
  const patch = (await req.json()) as Partial<AppConfig>;
  const store = getStore();
  const config = store.saveConfig(patch);
  return NextResponse.json({ config });
}

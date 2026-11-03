import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getStore, storeBackend } from "@/lib/db";
import type { AppConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async () => {
  const store = getStore();
  return NextResponse.json({ config: await store.getConfig(), backend: storeBackend() });
});

export const PUT = withRole("admin", async (req) => {
  const patch = (await req.json()) as Partial<AppConfig>;
  const config = await getStore().saveConfig(patch);
  return NextResponse.json({ config });
});

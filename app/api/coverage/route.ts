import { NextResponse } from "next/server";
import { withLegacyRole } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withLegacyRole("viewer", async () => {
  return NextResponse.json({ coverage: await getStore().coverage() });
});

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async () => {
  return NextResponse.json({ coverage: await getStore().coverage() });
});

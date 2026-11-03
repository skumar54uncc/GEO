import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { bodyOf, captureErrors, providerStatus, updateProviderLimits } from "@/lib/capture/service";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider status: which keys are missing (names only), routes, last canary, budget and spend this month. */
export const GET = withRole("viewer", async (_req, { user }) => NextResponse.json({ providers: await providerStatus(getDb(), user.orgId) }));

/** Budget and cap changes. Admin only; audited by withRole. */
export const PATCH = withRole("admin", async (req, { user }) =>
  captureErrors(async () => NextResponse.json({ account: await updateProviderLimits(getDb(), user.orgId, await bodyOf(req)) })),
);

import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import {
  createSchedule,
  estimateScheduleRun,
  formatNextRunNy,
  listFrozenPromptSetsForOrg,
  listSchedules,
  monthlyProjectionUsd,
  pauseAllSchedules,
} from "@/lib/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown) {
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

export const GET = withRole("viewer", async (req, { user }) => {
  const url = new URL(req.url);
  const campaignId = z.string().uuid().safeParse(url.searchParams.get("campaign_id"));
  if (!campaignId.success) return NextResponse.json({ error: "campaign_id must be a uuid" }, { status: 400 });
  const db = getDb();
  const include = url.searchParams.get("include");
  const rows = await listSchedules(db, user.orgId, campaignId.data);
  const schedulesOut = rows.map((s) => ({
    ...s,
    next_run_ny: formatNextRunNy(s.nextRunAt),
    monthly_projection_usd: monthlyProjectionUsd(
      s.budgetCapUsd == null ? null : Number(s.budgetCapUsd),
      s.cadence,
    ),
  }));
  if (include === "form") {
    const frozen_prompt_sets = await listFrozenPromptSetsForOrg(db, user.orgId, campaignId.data);
    return NextResponse.json({ schedules: schedulesOut, frozen_prompt_sets });
  }
  return NextResponse.json({ schedules: schedulesOut });
});

export const POST = withRole("editor", async (req, { user }) => {
  const db = getDb();
  try {
    const body = await req.json().catch(() => null);
    const action = body && typeof body === "object" && !Array.isArray(body) ? (body as { action?: string }).action : undefined;
    if (action === "estimate") {
      const preview = await estimateScheduleRun(db, user.orgId, body);
      return NextResponse.json({ preview });
    }
    if (action === "pause_all") {
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Pause all schedules requires admin." }, { status: 403 });
      }
      const result = await pauseAllSchedules(db, user.orgId);
      await recordAudit(db, {
        orgId: user.orgId,
        userId: user.userId,
        action: "schedule.pause_all",
        entityType: "organization",
        entityId: user.orgId,
        after: result,
      });
      return NextResponse.json(result);
    }
    const schedule = await createSchedule(db, user.orgId, body);
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "schedule.create",
      entityType: "schedule",
      entityId: schedule.id,
      after: {
        ...schedule,
        estimate_approved: true,
        approved_estimate_usd: schedule.approvedEstimateUsd,
      },
    });
    return NextResponse.json(
      {
        schedule: {
          ...schedule,
          next_run_ny: formatNextRunNy(schedule.nextRunAt),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return mapError(err);
  }
});

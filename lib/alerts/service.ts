import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "@/lib/campaigns";
import type { Db } from "@/lib/db/pg/client";
import { alerts } from "@/lib/db/pg/schema";

export class AlertStateError extends Error {}

/** Open alerts for the org, newest first. A campaign filter also keeps org-wide alerts out; they have no campaign. */
export async function listOpenAlerts(db: Db, orgId: string, campaignId?: string | null) {
  const where = [eq(alerts.orgId, orgId), eq(alerts.status, "open")];
  if (campaignId) where.push(eq(alerts.campaignId, campaignId));
  return db
    .select()
    .from(alerts)
    .where(and(...where))
    .orderBy(desc(alerts.createdAt));
}

/** Acknowledges an open alert of this org. The status check and update are one statement. */
export async function acknowledgeAlert(db: Db, orgId: string, alertId: string, userId: string) {
  const [row] = await db
    .update(alerts)
    .set({ status: "acknowledged", acknowledgedBy: userId })
    .where(and(eq(alerts.id, alertId), eq(alerts.orgId, orgId), eq(alerts.status, "open")))
    .returning();
  if (row) return row;
  const [existing] = await db.select({ id: alerts.id }).from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.orgId, orgId)));
  if (!existing) throw new NotFoundError("Alert not found.");
  throw new AlertStateError("Alert is already acknowledged.");
}

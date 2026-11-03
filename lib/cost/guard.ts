import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { costLedger, providerAccounts } from "@/lib/db/pg/schema";

export type LedgerEntry = {
  orgId: string;
  provider: string;
  units: number;
  ok: boolean;
  cached?: boolean;
  engine?: string | null;
  paramsHash?: string | null;
  error?: string | null;
  promptId?: string | null;
  scanId?: string | null;
  drawId?: string | null;
  at?: Date;
};

export type BudgetCheck = { allowed: boolean; reason: string | null };

export async function getProviderAccount(db: Db, orgId: string, provider: string) {
  const [row] = await db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.orgId, orgId), eq(providerAccounts.provider, provider)));
  return row ?? null;
}

/** USD for a number of units, or null when the price of a unit is unknown. */
export function unitsToUsd(units: number, creditUnitUsd: string | null | undefined): number | null {
  if (creditUnitUsd === null || creditUnitUsd === undefined) return null;
  const price = Number(creditUnitUsd);
  return Number.isFinite(price) ? units * price : null;
}

/**
 * Refuses a planned call or batch that would exceed the per run cap, the remaining credits,
 * or the monthly USD budget. Missing limits are not treated as unlimited: an unknown account refuses.
 */
export async function checkBudget(
  db: Db,
  orgId: string,
  provider: string,
  planned: { units: number; uncachedUnits?: number },
): Promise<BudgetCheck> {
  const account = await getProviderAccount(db, orgId, provider);
  if (!account) return { allowed: false, reason: `No provider account configured for ${provider}.` };
  const uncached = planned.uncachedUnits ?? planned.units;
  if (account.perRunCapUnits !== null && planned.units > account.perRunCapUnits) {
    return {
      allowed: false,
      reason: `Estimate ${planned.units} units exceeds per-run cap of ${account.perRunCapUnits}.`,
    };
  }
  if (account.creditsRemaining !== null && uncached > account.creditsRemaining) {
    return {
      allowed: false,
      reason: `Estimate up to ${uncached} uncached units exceeds remaining balance of ${account.creditsRemaining}.`,
    };
  }
  const usd = unitsToUsd(uncached, account.creditUnitUsd);
  if (usd !== null && account.monthlyBudgetUsd !== null) {
    const spent = Number(account.spentUsdMonth);
    if (spent + usd > Number(account.monthlyBudgetUsd)) {
      return {
        allowed: false,
        reason: `Estimate $${usd.toFixed(2)} would exceed the monthly budget ($${spent.toFixed(2)} of $${Number(account.monthlyBudgetUsd).toFixed(2)} spent).`,
      };
    }
  }
  return { allowed: true, reason: null };
}

export async function recordCall(db: Db, entry: LedgerEntry): Promise<void> {
  const account = await getProviderAccount(db, entry.orgId, entry.provider);
  const usd = unitsToUsd(entry.units, account?.creditUnitUsd);
  await db.insert(costLedger).values({
    orgId: entry.orgId,
    provider: entry.provider,
    units: String(entry.units),
    usd: usd === null ? null : String(usd),
    ok: entry.ok,
    cached: entry.cached ?? false,
    engine: entry.engine ?? null,
    paramsHash: entry.paramsHash ?? null,
    error: entry.error ?? null,
    promptId: entry.promptId ?? null,
    scanId: entry.scanId ?? null,
    drawId: entry.drawId ?? null,
    at: entry.at ?? new Date(),
  });
  if (usd !== null && usd > 0 && account) {
    await db
      .update(providerAccounts)
      .set({ spentUsdMonth: sql`${providerAccounts.spentUsdMonth} + ${String(usd)}` })
      .where(eq(providerAccounts.id, account.id));
  }
}

/** Decrements remaining credits atomically. */
export async function chargeUnits(db: Db, orgId: string, provider: string, units: number): Promise<void> {
  if (units <= 0) return;
  await db
    .update(providerAccounts)
    .set({ creditsRemaining: sql`${providerAccounts.creditsRemaining} - ${units}` })
    .where(and(eq(providerAccounts.orgId, orgId), eq(providerAccounts.provider, provider)));
}

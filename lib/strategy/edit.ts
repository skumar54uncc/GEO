import { eq } from "drizzle-orm";
import { recordAudit, type SessionUser } from "@/lib/auth";
import {
  scoreBreakdownSchema,
  strategyItemSchema,
  strategyReportOutputSchema,
  strategyReportSchema,
  type ScoreBreakdown,
  type StrategyItem,
  type StrategyReport,
} from "@/lib/contracts/strategy";
import type { Db } from "@/lib/db/pg/client";
import { strategyReports } from "@/lib/db/pg/schema";
import { computeScore } from "./score";
import { getStrategyReport } from "./pipeline";

export class StrategyEditError extends Error {}

/**
 * Editor adjusts demand / gap / effort factors. Original score and factors are kept.
 * Edits are audited. Demand may be set from unknown → scored only when value is provided.
 */
export async function editStrategyItemFactors(
  db: Db,
  opts: {
    user: SessionUser;
    reportId: string;
    itemId: string;
    factors: ScoreBreakdown;
  },
): Promise<StrategyReport> {
  const report = await getStrategyReport(db, opts.reportId);
  if (!report) throw new StrategyEditError("Strategy report not found.");

  const factors = scoreBreakdownSchema.parse(opts.factors);
  const patchItem = (item: StrategyItem): StrategyItem => {
    if (item.id !== opts.itemId) return item;
    const score = computeScore(factors);
    const demandUnknown = factors.demand.value === null;
    const next: StrategyItem = {
      ...item,
      factors,
      // originalFactors / originalScore stay frozen
      score: demandUnknown ? null : score,
      scoreStatus: demandUnknown ? "demand_unknown" : "scored",
    };
    return strategyItemSchema.parse(next);
  };

  const beforeItem =
    report.output.scoredItems.find((i) => i.id === opts.itemId) ??
    report.output.unscoredItems.find((i) => i.id === opts.itemId);
  if (!beforeItem) throw new StrategyEditError("Strategy item not found on this report.");

  const all = [...report.output.scoredItems, ...report.output.unscoredItems].map(patchItem);
  const scoredItems = all
    .filter((i) => i.scoreStatus === "scored")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));
  const unscoredItems = all
    .filter((i) => i.scoreStatus === "demand_unknown")
    .sort((a, b) => a.id.localeCompare(b.id));

  const output = strategyReportOutputSchema.parse({
    ...report.output,
    scoredItems,
    unscoredItems,
  });

  await db.update(strategyReports).set({ output }).where(eq(strategyReports.id, opts.reportId));

  const afterItem = [...scoredItems, ...unscoredItems].find((i) => i.id === opts.itemId)!;
  await recordAudit(db, {
    orgId: opts.user.orgId,
    userId: opts.user.userId,
    action: "strategy_report.edit_score",
    entityType: "strategy_report",
    entityId: opts.reportId,
    before: {
      itemId: opts.itemId,
      factors: beforeItem.factors,
      score: beforeItem.score,
      originalScore: beforeItem.originalScore,
    },
    after: {
      itemId: opts.itemId,
      factors: afterItem.factors,
      score: afterItem.score,
      originalScore: afterItem.originalScore,
    },
  });

  return strategyReportSchema.parse({ ...report, output });
}

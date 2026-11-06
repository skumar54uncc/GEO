import { and, eq, sql } from "drizzle-orm";
import { estimateContentTeamSeries } from "@/lib/contentTeam/estimate";
import { STOP_LOSS_CONFIG } from "@/lib/contracts/stopLoss";
import type { Db } from "@/lib/db/pg/client";
import { costLedger, organizations, providerAccounts } from "@/lib/db/pg/schema";
import { spentThisMonth } from "@/lib/cost/guard";

/** Prices verified date from docs/PROVIDERS.md (rechecked Phase 3). */
export const PRICES_VERIFIED_ON = "2026-11-03" as const;

export const UPPER_ESTIMATE_LABEL = `upper estimate, prices verified on ${PRICES_VERIFIED_ON}` as const;

/** DataForSEO publicly requires a minimum top-up on many accounts; labeled for leadership. */
export const DATAFORSEO_MIN_TOPUP_USD = 50 as const;

/** Vendor comparison anchors from docs/COMPETITOR_MATRIX.md §5 (sources captured 2026-10-14). */
export const VENDOR_COMPARISON = [
  {
    vendor: "Scrunch Core",
    price: "$250/mo",
    scope: "125 prompts, 4 engines, 1 country, 1 persona",
    sourceUrl: "https://scrunch.com/",
    sourceDate: "2026-10-14",
  },
  {
    vendor: "AthenaHQ Starter",
    price: "$295/mo",
    scope: "3,600 responses ≈ 100 prompts × 6 engines × 3 draws × 2 scans/mo",
    sourceUrl: "https://athenahq.ai/",
    sourceDate: "2026-10-14",
  },
  {
    vendor: "Goodie Core",
    price: "$295/mo",
    scope: "110 prompts, 5 engines",
    sourceUrl: "https://higoodie.com/",
    sourceDate: "2026-10-14",
  },
  {
    vendor: "Evertune Pro",
    price: "$800/mo",
    scope: "100,000 prompts, 11 models (plan page)",
    sourceUrl: "https://evertune.ai/",
    sourceDate: "2026-10-14",
  },
  {
    vendor: "Profound Enterprise",
    price: "custom",
    scope: "Enterprise; public trial is smaller",
    sourceUrl: "https://www.tryprofound.com/",
    sourceDate: "2026-10-14",
  },
] as const;

export type FundingPageData = {
  organization: { id: string; name: string; isDemo: boolean };
  pricesVerifiedOn: typeof PRICES_VERIFIED_ON;
  upperEstimateLabel: typeof UPPER_ESTIMATE_LABEL;
  dataforseoMinTopUpUsd: typeof DATAFORSEO_MIN_TOPUP_USD;
  stopLoss: typeof STOP_LOSS_CONFIG;
  vendorComparison: typeof VENDOR_COMPARISON;
  /** Energy core only — pilot scope. */
  pilot: {
    campaign: string | null;
    prompts: number;
    engines: number;
    drawsPerPrompt: number;
    totalDraws: number;
    usdUpper: number | null;
    note: string;
  };
  /** All 3 content-team core sets biweekly + persona sets quarterly. */
  steadyState: {
    coreBiweeklyDraws: number;
    coreBiweeklyUsdUpper: number | null;
    personaQuarterlyDraws: number;
    personaQuarterlyUsdUpper: number | null;
    monthlyUsdUpper: number | null;
    note: string;
  };
  providers: Array<{
    provider: string;
    monthlyBudgetUsd: number | null;
    perScanCapUsd: number | null;
    creditsRemaining: number | null;
    spentThisMonthUsd: number;
  }>;
  spendToDateUsd: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function buildFundingPage(db: Db, orgId: string): Promise<FundingPageData> {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) throw new Error("Organization not found.");

  const estimates = await estimateContentTeamSeries(db, orgId);
  const energyCore = estimates.series.find((s) => s.series === "core" && s.campaign.toLowerCase() === "energy");
  const anyCore = estimates.series.find((s) => s.series === "core");
  const pilotRow = energyCore ?? anyCore;

  // Steady state: core biweekly for all 3 campaigns → 2× core draws/month; persona quarterly → 1/3 of persona / month.
  const coreUsd = estimates.coreUsd;
  const personaUsd = estimates.personaUsd;
  const monthlyFromCore = coreUsd === null ? null : round4(coreUsd * 2);
  const monthlyFromPersona = personaUsd === null ? null : round4(personaUsd / 3);
  const monthlyUsdUpper =
    monthlyFromCore === null || monthlyFromPersona === null ? null : round4(monthlyFromCore + monthlyFromPersona);

  const accounts = await db.select().from(providerAccounts).where(eq(providerAccounts.orgId, orgId));
  const providers = [];
  for (const a of accounts) {
    providers.push({
      provider: a.provider,
      monthlyBudgetUsd: a.monthlyBudgetUsd === null ? null : Number(a.monthlyBudgetUsd),
      perScanCapUsd: a.perScanCapUsd === null ? null : Number(a.perScanCapUsd),
      creditsRemaining: a.creditsRemaining,
      spentThisMonthUsd: await spentThisMonth(db, orgId, a.provider),
    });
  }

  const [spendRow] = await db
    .select({ spent: sql<string>`coalesce(sum(${costLedger.usd}), 0)` })
    .from(costLedger)
    .where(and(eq(costLedger.orgId, orgId)));

  return {
    organization: org,
    pricesVerifiedOn: PRICES_VERIFIED_ON,
    upperEstimateLabel: UPPER_ESTIMATE_LABEL,
    dataforseoMinTopUpUsd: DATAFORSEO_MIN_TOPUP_USD,
    stopLoss: STOP_LOSS_CONFIG,
    vendorComparison: VENDOR_COMPARISON,
    pilot: {
      campaign: pilotRow?.campaign ?? null,
      prompts: pilotRow?.prompts ?? 0,
      engines: pilotRow?.engines ?? 0,
      drawsPerPrompt: pilotRow?.drawsPerPrompt ?? 3,
      totalDraws: pilotRow?.totalDraws ?? 0,
      usdUpper: pilotRow?.usdTotalUpper ?? null,
      note: pilotRow?.note ?? "No content-team Energy core prompts found for this organization.",
    },
    steadyState: {
      coreBiweeklyDraws: estimates.coreDraws * 2,
      coreBiweeklyUsdUpper: monthlyFromCore,
      personaQuarterlyDraws: estimates.personaDraws,
      personaQuarterlyUsdUpper: personaUsd,
      monthlyUsdUpper,
      note: "Steady state: all content-team core sets twice per month, plus persona sets once per quarter (1/3 of a full persona run attributed monthly).",
    },
    providers,
    spendToDateUsd: Number(spendRow?.spent ?? 0),
  };
}

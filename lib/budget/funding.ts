import { and, eq, sql } from "drizzle-orm";
import { estimateContentTeamSeries } from "@/lib/contentTeam/estimate";
import { STOP_LOSS_CONFIG } from "@/lib/contracts/stopLoss";
import type { Db } from "@/lib/db/pg/client";
import { costLedger, organizations, providerAccounts } from "@/lib/db/pg/schema";
import { spentThisMonth } from "@/lib/cost/guard";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import type { ProviderId } from "@/lib/capture/registry";
import {
  BUDGET_PROVIDER_META,
  primaryRouteUsdPerDrawByProvider,
  providerShareForPrompts,
  type ProviderBudgetRole,
} from "./providers";

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

export type FundingProviderRow = {
  provider: string;
  displayName: string;
  role: ProviderBudgetRole;
  roleLabel: string;
  monthlyBudgetUsd: number | null;
  perScanCapUsd: number | null;
  creditsRemaining: number | null;
  spentThisMonthUsd: number;
  /** This provider's share of the pilot (primary routes only). */
  pilotShareUsd: number | null;
  /** This provider's share of steady-state monthly (primary routes only). */
  monthlyShareUsd: number | null;
  estimateExceedsCap: boolean;
  capWarning: string | null;
};

export type FundingPageData = {
  organization: { id: string; name: string; isDemo: boolean };
  pricesVerifiedOn: typeof PRICES_VERIFIED_ON;
  upperEstimateLabel: typeof UPPER_ESTIMATE_LABEL;
  dataforseoMinTopUpUsd: typeof DATAFORSEO_MIN_TOPUP_USD;
  stopLoss: typeof STOP_LOSS_CONFIG;
  vendorComparison: typeof VENDOR_COMPARISON;
  pilot: {
    campaign: string | null;
    prompts: number;
    draftPrompts: number;
    basedOnDrafts: boolean;
    engines: number;
    drawsPerPrompt: number;
    totalDraws: number;
    usdUpper: number | null;
    note: string;
  };
  steadyState: {
    coreBiweeklyDraws: number;
    /** Core biweekly attributed as monthly dollars. */
    coreUsdPerMonth: number | null;
    personaQuarterlyDraws: number;
    /** Full persona quarterly run dollars. */
    personaQuarterlyUsd: number | null;
    /** Persona quarterly ÷ 3. */
    personaUsdPerMonth: number | null;
    totalUsdPerMonth: number | null;
    totalUsdPerYear: number | null;
    note: string;
    basedOnDrafts: boolean;
  };
  /** Summary line for the vendor comparison table. */
  platformSummary: { monthlyUsd: number | null; yearlyUsd: number | null };
  providers: FundingProviderRow[];
  capWarnings: string[];
  spendToDateUsd: number;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function sumShares(shares: Record<ProviderId, number | null>): number | null {
  let t = 0;
  for (const v of Object.values(shares)) {
    if (v === null) return null;
    t += v;
  }
  return round4(t);
}

export async function buildFundingPage(db: Db, orgId: string): Promise<FundingPageData> {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) throw new Error("Organization not found.");

  await ensureCaptureProviders(db, orgId);

  const estimates = await estimateContentTeamSeries(db, orgId);
  const energyCore = estimates.series.find((s) => s.series === "core" && s.campaign.toLowerCase() === "energy");
  const anyCore = estimates.series.find((s) => s.series === "core");
  const pilotRow = energyCore ?? anyCore;

  const coreUsd = estimates.coreUsd;
  const personaUsd = estimates.personaUsd;
  const coreUsdPerMonth = coreUsd === null ? null : round4(coreUsd * 2);
  const personaUsdPerMonth = personaUsd === null ? null : round4(personaUsd / 3);
  const totalUsdPerMonth =
    coreUsdPerMonth === null || personaUsdPerMonth === null ? null : round4(coreUsdPerMonth + personaUsdPerMonth);
  const totalUsdPerYear = totalUsdPerMonth === null ? null : round4(totalUsdPerMonth * 12);

  const perDraw = primaryRouteUsdPerDrawByProvider();
  const pilotPrompts = pilotRow?.prompts ?? 0;
  const corePromptsAll = estimates.series.filter((s) => s.series === "core").reduce((a, s) => a + s.prompts, 0);
  const personaPromptsAll = estimates.series.filter((s) => s.series === "persona").reduce((a, s) => a + s.prompts, 0);

  const pilotShares = providerShareForPrompts(pilotPrompts, perDraw);
  // Steady monthly: core × 2 runs/mo + persona × (1/3 run/mo)
  const coreMonthlyShares = providerShareForPrompts(corePromptsAll * 2, perDraw);
  const personaMonthlyShares = providerShareForPrompts(personaPromptsAll, perDraw);
  const monthlyShares = {} as Record<ProviderId, number | null>;
  for (const meta of BUDGET_PROVIDER_META) {
    const c = coreMonthlyShares[meta.id];
    const p = personaMonthlyShares[meta.id];
    if (meta.role !== "active") {
      monthlyShares[meta.id] = 0;
      continue;
    }
    if (c === null || p === null) monthlyShares[meta.id] = null;
    else monthlyShares[meta.id] = round4(c + p / 3);
  }

  // Keep series totals consistent with primary-route sum when available.
  const pilotFromRoutes = sumShares(pilotShares);
  const pilotUsd = pilotFromRoutes ?? pilotRow?.usdTotalUpper ?? null;

  const accounts = await db.select().from(providerAccounts).where(eq(providerAccounts.orgId, orgId));
  const byId = new Map(accounts.map((a) => [a.provider, a]));

  const providers: FundingProviderRow[] = [];
  const capWarnings: string[] = [];

  for (const meta of BUDGET_PROVIDER_META) {
    const a = byId.get(meta.id);
    const monthlyBudgetUsd = a?.monthlyBudgetUsd == null ? null : Number(a.monthlyBudgetUsd);
    const perScanCapUsd = a?.perScanCapUsd == null ? null : Number(a.perScanCapUsd);
    const spentThisMonthUsd = a ? await spentThisMonth(db, orgId, a.provider) : 0;
    const pilotShareUsd = pilotShares[meta.id] ?? 0;
    const monthlyShareUsd = monthlyShares[meta.id] ?? 0;

    let estimateExceedsCap = false;
    let capWarning: string | null = null;
    if (meta.role === "active") {
      const reasons: string[] = [];
      if (monthlyBudgetUsd !== null && monthlyShareUsd !== null && monthlyShareUsd > monthlyBudgetUsd) {
        reasons.push(
          `${meta.displayName} steady-state share ($${monthlyShareUsd.toFixed(2)}/mo) exceeds its monthly cap ($${monthlyBudgetUsd.toFixed(2)}).`,
        );
      }
      if (perScanCapUsd !== null && pilotShareUsd !== null && pilotShareUsd > perScanCapUsd) {
        reasons.push(
          `${meta.displayName} pilot share ($${pilotShareUsd.toFixed(2)}) exceeds its per-scan cap ($${perScanCapUsd.toFixed(2)}).`,
        );
      }
      if (reasons.length) {
        estimateExceedsCap = true;
        capWarning = reasons.join(" ");
        capWarnings.push(...reasons);
      }
    }

    providers.push({
      provider: meta.id,
      displayName: meta.displayName,
      role: meta.role,
      roleLabel: meta.roleLabel,
      monthlyBudgetUsd,
      perScanCapUsd,
      creditsRemaining: a?.creditsRemaining ?? null,
      spentThisMonthUsd,
      pilotShareUsd,
      monthlyShareUsd,
      estimateExceedsCap,
      capWarning,
    });
  }

  const [spendRow] = await db
    .select({ spent: sql<string>`coalesce(sum(${costLedger.usd}), 0)` })
    .from(costLedger)
    .where(and(eq(costLedger.orgId, orgId)));

  const steadyBasedOnDrafts = estimates.series.some((s) => s.basedOnDrafts);

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
      draftPrompts: pilotRow?.draftPrompts ?? 0,
      basedOnDrafts: pilotRow?.basedOnDrafts ?? false,
      engines: pilotRow?.engines ?? 0,
      drawsPerPrompt: pilotRow?.drawsPerPrompt ?? 3,
      totalDraws: pilotRow?.totalDraws ?? 0,
      usdUpper: pilotUsd,
      note: pilotRow?.note ?? "No content-team Energy core prompts found for this organization.",
    },
    steadyState: {
      coreBiweeklyDraws: estimates.coreDraws * 2,
      coreUsdPerMonth,
      personaQuarterlyDraws: estimates.personaDraws,
      personaQuarterlyUsd: personaUsd,
      personaUsdPerMonth,
      totalUsdPerMonth,
      totalUsdPerYear,
      note: steadyBasedOnDrafts
        ? "Steady state uses draft prompts pending approval where a series has no approved prompts. Core sets twice per month. Persona sets once per quarter (monthly share = full run ÷ 3). Only primary routes are costed."
        : "Steady state: content-team core sets twice per month. Persona sets once per quarter (monthly share = full run ÷ 3). Only primary routes are costed. Fallback, calibration, and parity providers are $0 unless scheduled.",
      basedOnDrafts: steadyBasedOnDrafts,
    },
    platformSummary: { monthlyUsd: totalUsdPerMonth, yearlyUsd: totalUsdPerYear },
    providers,
    capWarnings,
    spendToDateUsd: Number(spendRow?.spent ?? 0),
  };
}

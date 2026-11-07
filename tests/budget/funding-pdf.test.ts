import { describe, expect, it } from "vitest";
import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import { STOP_LOSS_CONFIG } from "@/lib/contracts/stopLoss";
import type { FundingPageData } from "@/lib/budget/funding";
import { PRICES_VERIFIED_ON, UPPER_ESTIMATE_LABEL, VENDOR_COMPARISON } from "@/lib/budget/funding";
import { fundingPdfHtml } from "@/lib/budget/pdf";

function minimalFunding(over: Partial<FundingPageData["organization"]> = {}): FundingPageData {
  return {
    organization: { id: "00000000-0000-4000-8000-000000000001", name: "Test Org", isDemo: false, ...over },
    pricesVerifiedOn: PRICES_VERIFIED_ON,
    upperEstimateLabel: UPPER_ESTIMATE_LABEL,
    dataforseoMinTopUpUsd: 50,
    stopLoss: STOP_LOSS_CONFIG,
    vendorComparison: [...VENDOR_COMPARISON],
    pilot: {
      campaign: "Energy",
      prompts: 10,
      draftPrompts: 0,
      basedOnDrafts: false,
      engines: 2,
      drawsPerPrompt: 3,
      totalDraws: 60,
      usdUpper: 100,
      note: "fixture",
    },
    steadyState: {
      coreBiweeklyDraws: 120,
      coreUsdPerMonth: 50,
      personaQuarterlyDraws: 40,
      personaQuarterlyUsd: 75,
      personaUsdPerMonth: 25,
      totalUsdPerMonth: 75,
      totalUsdPerYear: 900,
      note: "fixture",
      basedOnDrafts: false,
    },
    platformSummary: { monthlyUsd: 75, yearlyUsd: 900 },
    providers: [],
    capWarnings: [],
    spendToDateUsd: 0,
  };
}

describe("fundingPdfHtml", () => {
  it("includes upper estimate label for real orgs", () => {
    const html = fundingPdfHtml(minimalFunding());
    expect(html).toContain(UPPER_ESTIMATE_LABEL);
    expect(html).toContain("Every cost figure is an");
    expect(html).toContain("This platform, upper estimate");
    expect(html).toContain("$75.00/mo");
    expect(html).not.toContain(DEMO_DATA_BANNER);
  });

  it("includes DEMO DATA banner when org is demo", () => {
    const html = fundingPdfHtml(minimalFunding({ isDemo: true, name: "Demo University" }));
    expect(html).toContain(DEMO_DATA_BANNER);
  });
});

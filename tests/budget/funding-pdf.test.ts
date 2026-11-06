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
      engines: 2,
      drawsPerPrompt: 3,
      totalDraws: 60,
      usdUpper: 100,
      note: "fixture",
    },
    steadyState: {
      coreBiweeklyDraws: 120,
      coreBiweeklyUsdUpper: 50,
      personaQuarterlyDraws: 40,
      personaQuarterlyUsdUpper: 25,
      monthlyUsdUpper: 75,
      note: "fixture",
    },
    providers: [],
    spendToDateUsd: 0,
  };
}

describe("fundingPdfHtml", () => {
  it("includes upper estimate label for real orgs", () => {
    const html = fundingPdfHtml(minimalFunding());
    expect(html).toContain(UPPER_ESTIMATE_LABEL);
    expect(html).toContain("Every cost figure is an");
    expect(html).not.toContain(DEMO_DATA_BANNER);
  });

  it("includes DEMO DATA banner when org is demo", () => {
    const html = fundingPdfHtml(minimalFunding({ isDemo: true, name: "Demo University" }));
    expect(html).toContain(DEMO_DATA_BANNER);
  });
});

import type { Db } from "@/lib/db/pg/client";
import { providerAccounts } from "@/lib/db/pg/schema";
import type { ProviderId } from "./registry";

/**
 * Starting limits per capture provider, sized from the budget in docs/PROVIDERS.md section 4 with headroom.
 * The owner changes them on the Settings providers page. Existing rows are never overwritten.
 */
export const CAPTURE_PROVIDER_DEFAULTS: Record<ProviderId, { monthlyBudgetUsd: string | null; perScanCapUsd: string | null; perRunCapUnits: number | null; creditUnitUsd: string | null }> = {
  dataforseo: { monthlyBudgetUsd: "20", perScanCapUsd: "10", perRunCapUnits: null, creditUnitUsd: null },
  openai: { monthlyBudgetUsd: "20", perScanCapUsd: "10", perRunCapUnits: null, creditUnitUsd: null },
  anthropic: { monthlyBudgetUsd: "60", perScanCapUsd: "30", perRunCapUnits: null, creditUnitUsd: null },
  perplexity: { monthlyBudgetUsd: "10", perScanCapUsd: "5", perRunCapUnits: null, creditUnitUsd: null },
  gemini: { monthlyBudgetUsd: "20", perScanCapUsd: "10", perRunCapUnits: null, creditUnitUsd: null },
  // Free tier: 250 searches a month. A page_token answer uses 2.
  serpapi: { monthlyBudgetUsd: null, perScanCapUsd: null, perRunCapUnits: 60, creditUnitUsd: "0" },
  local_serp: { monthlyBudgetUsd: null, perScanCapUsd: null, perRunCapUnits: 200, creditUnitUsd: "0" },
};

export async function ensureCaptureProviders(db: Db, orgId: string): Promise<void> {
  for (const [provider, d] of Object.entries(CAPTURE_PROVIDER_DEFAULTS)) {
    await db
      .insert(providerAccounts)
      .values({ orgId, provider, ...d })
      .onConflictDoNothing();
  }
}

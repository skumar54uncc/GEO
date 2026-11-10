import type { Db } from "@/lib/db/pg/client";
import { demandSignals } from "@/lib/db/pg/schema";
import type { DemandRunResult } from "./types";

/** Persist fixture (or future live) demand signals. Append-only. */
export async function storeDemandSignals(
  db: Db,
  input: {
    campaignId: string;
    regionId?: string | null;
    result: DemandRunResult;
  },
): Promise<{ inserted: number }> {
  if (!input.result.connected || input.result.status !== "ok") return { inserted: 0 };
  if (!input.result.signals.length) return { inserted: 0 };

  const rows = input.result.signals.map((signal) => {
    const value =
      signal.value && typeof signal.value === "object"
        ? {
            ...signal.value,
            // Stamp provenance when the caller did not; fixture runs stay labeled fixture.
            provenance:
              typeof (signal.value as { provenance?: unknown }).provenance === "string"
                ? (signal.value as { provenance: string }).provenance
                : input.result.mode === "fixture_only"
                  ? "fixture"
                  : "stored",
          }
        : signal.value;
    return {
      campaignId: input.campaignId,
      source: signal.source,
      term: signal.term,
      regionId: input.regionId ?? null,
      value,
      fetchedAt: new Date(),
    };
  });
  await db.insert(demandSignals).values(rows);
  return { inserted: rows.length };
}

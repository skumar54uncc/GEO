import { and, eq, isNotNull, sql } from "drizzle-orm";
import { spentThisMonth } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { alerts, brandDomains, campaigns, citations, draws, providerAccounts, scans } from "@/lib/db/pg/schema";
import { domainIsOwned } from "@/lib/metrics/rollup";
import { BUDGET_ALERT_THRESHOLDS, PROVIDER_ERROR_RATE_THRESHOLD } from "@/lib/metrics/stats";
import { compareScans, previousComparableScan } from "./decline";

type AlertKind = (typeof alerts.$inferInsert)["kind"];
export type CreatedAlert = { id: string; kind: AlertKind; key: string };

/** An open alert of this kind whose payload has every given key/value. Acknowledged alerts do not block a new one. */
async function openAlertExists(db: Db, orgId: string, kind: AlertKind, match: Record<string, string>): Promise<boolean> {
  const conds = Object.entries(match).map(([k, v]) => sql`${alerts.payload}->>${k} = ${v}`);
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.orgId, orgId), eq(alerts.kind, kind), eq(alerts.status, "open"), ...conds))
    .limit(1);
  return rows.length > 0;
}

/** Spend against each provider's monthly budget. Only the highest crossed threshold is raised, once per provider and month. */
async function evaluateBudgets(db: Db, orgId: string, now: Date, created: CreatedAlert[]): Promise<void> {
  const accounts = await db.select().from(providerAccounts).where(and(eq(providerAccounts.orgId, orgId), isNotNull(providerAccounts.monthlyBudgetUsd)));
  const month = now.toISOString().slice(0, 7);
  for (const account of accounts) {
    const budget = Number(account.monthlyBudgetUsd);
    if (!(budget > 0)) continue;
    const spent = await spentThisMonth(db, orgId, account.provider, now);
    const crossed = BUDGET_ALERT_THRESHOLDS.filter((t) => spent / budget >= t);
    const top = crossed[crossed.length - 1];
    if (top === undefined) continue;
    const threshold = String(Math.round(top * 100));
    if (await openAlertExists(db, orgId, "budget_threshold", { source: "spend", provider: account.provider, threshold, month })) continue;
    const [row] = await db
      .insert(alerts)
      .values({
        orgId,
        kind: "budget_threshold",
        payload: {
          source: "spend",
          provider: account.provider,
          threshold,
          month,
          spent_usd: Math.round(spent * 1e6) / 1e6,
          monthly_budget_usd: budget,
          message: `${account.provider} has spent $${spent.toFixed(2)} of its $${budget.toFixed(2)} monthly budget (${threshold}% threshold).`,
          note: "Spend counts ledger rows with a known USD price; calls with unknown USD add nothing.",
        },
      })
      .returning({ id: alerts.id });
    created.push({ id: row.id, kind: "budget_threshold", key: `${account.provider}:${threshold}` });
  }
}

async function evaluateScan(db: Db, orgId: string, scanId: string, created: CreatedAlert[]): Promise<void> {
  const [scan] = await db
    .select({ id: scans.id, campaignId: scans.campaignId, kind: scans.kind, status: scans.status })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(eq(scans.id, scanId), eq(campaigns.orgId, orgId)));
  if (!scan) throw new Error("Scan not found in this organization");

  const add = async (kind: AlertKind, key: string, match: Record<string, string>, payload: Record<string, unknown>) => {
    // Canary failures are alerted where the canary runs; one open alert per scan and key is enough here too.
    if (await openAlertExists(db, orgId, kind, { scan_id: scanId, ...match })) return;
    const [row] = await db
      .insert(alerts)
      .values({ orgId, campaignId: scan.campaignId, kind, payload: { scan_id: scanId, ...match, ...payload } })
      .returning({ id: alerts.id });
    created.push({ id: row.id, kind, key });
  };

  // Provider error rate and blocked draws, from the latest attempt of each cell.
  const rows = await db
    .select({ promptId: draws.promptId, engine: draws.engine, runner: draws.runner, provider: draws.provider, regionId: draws.regionId, drawIndex: draws.drawIndex, attempt: draws.attempt, status: draws.status })
    .from(draws)
    .where(eq(draws.scanId, scanId));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = `${r.promptId}|${r.engine}|${r.runner}|${r.provider}|${r.regionId}|${r.drawIndex}`;
    const cur = latest.get(k);
    if (!cur || r.attempt > cur.attempt) latest.set(k, r);
  }
  const byProvider = new Map<string, { n: number; error: number }>();
  const blockedByEngine = new Map<string, { blocked: number; providers: Set<string> }>();
  for (const r of latest.values()) {
    const p = byProvider.get(r.provider) ?? { n: 0, error: 0 };
    p.n++;
    if (r.status === "error") p.error++;
    byProvider.set(r.provider, p);
    if (r.status === "blocked") {
      const b = blockedByEngine.get(r.engine) ?? { blocked: 0, providers: new Set<string>() };
      b.blocked++;
      b.providers.add(r.provider);
      blockedByEngine.set(r.engine, b);
    }
  }
  for (const [provider, p] of byProvider) {
    const rate = p.error / p.n;
    // METRICS: strictly greater than PROVIDER_ERROR_RATE_THRESHOLD (exactly 20% does not alert).
    if (!(rate > PROVIDER_ERROR_RATE_THRESHOLD)) continue;
    await add("provider_error_rate", provider, { provider }, {
      error_draws: p.error,
      n: p.n,
      error_rate: rate,
      threshold: PROVIDER_ERROR_RATE_THRESHOLD,
      message: `${provider}: ${p.error} of ${p.n} draws errored (${(rate * 100).toFixed(0)}%) in this scan.`,
    });
  }
  for (const [engine, b] of blockedByEngine) {
    await add("blocked", engine, { engine }, {
      blocked_draws: b.blocked,
      providers: [...b.providers],
      message: `${engine}: ${b.blocked} draw(s) were blocked in this scan.`,
    });
  }

  // Significant decline vs the previous scan of the same frozen prompt set, one series at a time.
  if (scan.kind === "scan" && (scan.status === "complete" || scan.status === "partial")) {
    const prev = await previousComparableScan(db, scanId);
    if (prev) {
      for (const c of await compareScans(db, prev.id, scanId, { orgId })) {
        if (c.label !== "significant decline") continue;
        // Branded prompts and personas are their own series (METRICS sections 2 and 4); never pool them.
        const personaBit = c.series.personaId ? `/persona:${c.series.personaId.slice(0, 8)}` : "";
        const seriesLabel = `${c.series.engine}/${c.series.runner}/${c.series.provider}${personaBit}${c.series.branded ? "/branded" : ""}`;
        await add(
          "significant_decline",
          seriesLabel,
          {
            engine: c.series.engine,
            runner: c.series.runner,
            provider: c.series.provider,
            region_id: c.series.regionId,
            persona_id: c.series.personaId ?? "",
            branded: String(c.series.branded),
          },
          {
            previous_scan_id: prev.id,
            prompts_paired: c.pairs,
            won_before: c.wonBefore,
            won_after: c.wonAfter,
            lost: c.b,
            gained: c.c,
            p_value: c.pValue,
            test: "McNemar exact, paired by prompt",
            message: `${seriesLabel}: prompts won fell from ${c.wonBefore} to ${c.wonAfter} of ${c.pairs} paired prompts (McNemar p=${c.pValue.toFixed(4)}).`,
          },
        );
      }

      // Owned page cited in previous scan but not in this scan — per engine, deduped.
      const owned = await db
        .select({ domain: brandDomains.domain })
        .from(brandDomains)
        .innerJoin(campaigns, eq(campaigns.brandId, brandDomains.brandId))
        .where(eq(campaigns.id, scan.campaignId));
      const ownedDomains = owned.map((o) => o.domain);
      const ownedPagesByEngine = async (sid: string) => {
        const rows = await db
          .select({
            engine: draws.engine,
            url: citations.url,
            canonicalUrl: citations.canonicalUrl,
            domain: citations.domain,
            sourceClass: citations.sourceClass,
          })
          .from(citations)
          .innerJoin(draws, eq(draws.id, citations.drawId))
          .where(eq(draws.scanId, sid));
        const map = new Map<string, Set<string>>();
        for (const r of rows) {
          const page = (r.canonicalUrl || r.url || "").trim() || r.domain;
          if (!page) continue;
          if (r.sourceClass !== "owned" && !domainIsOwned(r.domain, ownedDomains)) continue;
          const set = map.get(r.engine) ?? new Set<string>();
          set.add(page);
          map.set(r.engine, set);
        }
        return map;
      };
      const prevOwned = await ownedPagesByEngine(prev.id);
      const curOwned = await ownedPagesByEngine(scanId);
      for (const [engine, pages] of prevOwned) {
        const still = curOwned.get(engine) ?? new Set<string>();
        const lost = [...pages].filter((p) => !still.has(p));
        if (!lost.length) continue;
        await add(
          "owned_citation_stopped",
          engine,
          { engine, previous_scan_id: prev.id },
          {
            previous_scan_id: prev.id,
            lost_pages: lost.slice(0, 20),
            lost_count: lost.length,
            message: `${engine}: stopped citing ${lost.length} owned page(s) that appeared in the previous scan.`,
          },
        );
      }
    }
  }
}

/**
 * alerts.evaluate. Budget thresholds are org wide. With a scanId it also checks that scan for provider error rate,
 * blocked draws and a significant decline against the previous comparable scan. Open alerts are never duplicated.
 */
export async function evaluateAlerts(db: Db, opts: { orgId: string; scanId?: string; now?: Date }): Promise<CreatedAlert[]> {
  const created: CreatedAlert[] = [];
  await evaluateBudgets(db, opts.orgId, opts.now ?? new Date(), created);
  if (opts.scanId) await evaluateScan(db, opts.orgId, opts.scanId, created);
  return created;
}

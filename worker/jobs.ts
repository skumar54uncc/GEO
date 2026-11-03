import type PgBoss from "pg-boss";
import { eq, sql } from "drizzle-orm";
import { planRetry, runRetry, runScan } from "@/lib/capture/batch";
import { computeCalibration } from "@/lib/capture/calibration";
import { planFanout, runFanout } from "@/lib/capture/fanout";
import { judgeScan } from "@/lib/capture/service";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, crawlRuns, scans } from "@/lib/db/pg/schema";
import { loadAliases } from "@/lib/judge/aliases";
import { runAudit } from "@/lib/site/audit/run";
import { primaryHostFor, siteContext } from "@/lib/site/context";
import { crawlHost, liveCrawlDeps } from "@/lib/site/crawl";
import { discoverSite, liveDiscoveryDeps } from "@/lib/site/discovery";
import { extractEntityCandidates, loadEntityPages, saveCandidates } from "@/lib/site/entities";
import { liveEntityDeps, runEntityCheck } from "@/lib/site/entityCheck";
import { ensurePageSpeed, livePageSpeedDeps } from "@/lib/site/pagespeed";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { QUEUES } from "@/lib/queues";

export { QUEUES };

/** Long jobs, and no automatic retries: a failure is recorded and a person decides to rerun. */
export const JOB_OPTIONS: PgBoss.SendOptions = { retryLimit: 0, expireInSeconds: 4 * 3600 };

export type HealthPingData = { sent_at: string };
export type DiscoverData = { site_id: string };
export type CrawlPageData = { crawl_run_id: string; host_id: string };
export type AuditRunData = { crawl_run_id: string; user_id?: string | null };
export type EntityCheckData = { brand_id: string; org_id: string };
export type ScanRunData = { scan_id: string; org_id: string };
export type RetryData = { scan_id: string; org_id: string; approved_usd: number | null };
export type FanoutData = { scan_id: string; org_id: string; approved_usd: number; limit: number };
export type JudgeRunData = { scan_id: string; org_id: string };

/** Runs once every host of a crawl is done: entity candidates, then the audit. */
export async function afterCrawl(boss: PgBoss, crawlRunId: string, siteId: string): Promise<void> {
  const db = getDb();
  const candidates = extractEntityCandidates(await loadEntityPages(db, crawlRunId), { primaryHost: await primaryHostFor(db, siteId) });
  await saveCandidates(db, siteId, crawlRunId, candidates);
  await boss.send(QUEUES.auditRun, { crawl_run_id: crawlRunId } satisfies AuditRunData, JOB_OPTIONS);
}

export async function registerJobs(boss: PgBoss, log: (msg: string) => void = console.log): Promise<void> {
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);

  await boss.work<HealthPingData>(QUEUES.healthPing, async (jobs) => {
    for (const job of jobs) {
      log(`[worker] health.ping ${job.id} sent_at=${job.data?.sent_at ?? "?"}`);
    }
    return { ok: true, processed_at: new Date().toISOString() };
  });

  await boss.work(QUEUES.scheduleTick, async (jobs) => {
    for (const job of jobs) log(`[worker] schedule.tick ${job.id} (no scheduled scans until Phase 5)`);
  });

  await boss.work<DiscoverData>(QUEUES.crawlDiscover, async ([job]) => {
    const db = getDb();
    const ctx = await siteContext(db, job.data.site_id);
    await ensurePhase2Providers(db, ctx.orgId);
    log(`[worker] crawl.discover ${ctx.site.rootUrl}`);
    const summary = await discoverSite(db, job.data.site_id, liveDiscoveryDeps(db, ctx.orgId));
    log(`[worker] crawl.discover done: ${summary.hosts_found} hosts, ${summary.hosts_included_by_default} included by default`);
    return summary;
  });

  await boss.work<CrawlPageData>(QUEUES.crawlPage, async ([job]) => {
    const db = getDb();
    const { crawl_run_id: runId, host_id: hostId } = job.data;
    try {
      const res = await crawlHost(db, runId, hostId, liveCrawlDeps());
      log(`[worker] crawl.page ${hostId}: ${res.pages} pages, ${res.errors} errors, ${res.skippedByRobots} skipped by robots.txt`);
      if (res.runComplete) {
        const [run] = await db.select().from(crawlRuns).where(sql`${crawlRuns.id} = ${runId}`);
        await afterCrawl(boss, runId, run.siteId);
      }
      return res;
    } catch (err) {
      // A failed host never sinks the run: record it, mark the host done, and finish the run if last.
      const message = err instanceof Error ? err.message : String(err);
      log(`[worker] crawl.page ${hostId} failed: ${message}`);
      const [run] = await db
        .update(crawlRuns)
        .set({
          error: sql`concat_ws('; ', ${crawlRuns.error}, ${message})`,
          hostsDone: sql`array_append(array_remove(${crawlRuns.hostsDone}, ${hostId}::uuid), ${hostId}::uuid)`,
        })
        .where(sql`${crawlRuns.id} = ${runId}`)
        .returning();
      if (run && run.hostIds.every((h) => run.hostsDone.includes(h))) {
        await db.update(crawlRuns).set({ status: "complete", finishedAt: new Date() }).where(sql`${crawlRuns.id} = ${runId}`);
        await afterCrawl(boss, runId, run.siteId);
      }
      return { error: message };
    }
  });

  await boss.work<AuditRunData>(QUEUES.auditRun, async ([job]) => {
    const db = getDb();
    const psi = await ensurePageSpeed(db, job.data.crawl_run_id, livePageSpeedDeps());
    const res = await runAudit(db, job.data.crawl_run_id, { userId: job.data.user_id ?? null });
    log(`[worker] audit.run ${job.data.crawl_run_id}: ${res.findingCount} findings, sha ${res.findingsSha256.slice(0, 12)}, pagespeed ${psi.status}`);
    return { ...res, pagespeed: psi };
  });

  await boss.work<EntityCheckData>(QUEUES.entityCheck, async ([job]) => {
    const db = getDb();
    await ensurePhase2Providers(db, job.data.org_id);
    const res = await runEntityCheck(db, { brandId: job.data.brand_id, orgId: job.data.org_id, deps: liveEntityDeps() });
    log(`[worker] entity.check: ${res.match} match, ${res.mismatch} mismatch, ${res.missing} missing`);
    return res;
  });

  await boss.work<ScanRunData>(QUEUES.scanRun, async ([job]) => {
    const db = getDb();
    const { scan_id: scanId, org_id: orgId } = job.data;
    const summary = await runScan(db, scanId, { orgId, log });
    log(`[worker] scan.run ${scanId}: ${summary.status}, $${summary.actualUsd} actual vs $${summary.estimateUsd ?? "unknown"} estimated`);
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
    if (scan?.kind === "calibration") {
      const [c] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, scan.campaignId));
      const month = (scan.approvedAt ?? new Date()).toISOString().slice(0, 7);
      const res = await computeCalibration(db, { orgId, scanId, month, aliases: await loadAliases(db, orgId, c.brandId) });
      log(`[worker] calibration ${month}: ${res.map((r) => `${r.engine} agreement ${r.agreement.agree}/${r.agreement.n}`).join(", ")}`);
    }
    await boss.send(QUEUES.judgeRun, { scan_id: scanId, org_id: orgId } satisfies JudgeRunData, JOB_OPTIONS);
    return { status: summary.status, actualUsd: summary.actualUsd, estimateUsd: summary.estimateUsd, byCell: summary.byCell };
  });

  await boss.work<RetryData>(QUEUES.captureRetry, async ([job]) => {
    const db = getDb();
    const plan = await planRetry(db, job.data.scan_id, job.data.org_id);
    const out = await runRetry(db, plan, { orgId: job.data.org_id, approvedUsd: job.data.approved_usd });
    log(`[worker] capture.retry ${job.data.scan_id}: ${out.length} draws retried`);
    await boss.send(QUEUES.judgeRun, { scan_id: job.data.scan_id, org_id: job.data.org_id } satisfies JudgeRunData, JOB_OPTIONS);
    return { retried: out.length, statuses: out.map((o) => o.status) };
  });

  await boss.work<FanoutData>(QUEUES.fanoutRun, async ([job]) => {
    const db = getDb();
    const plan = await planFanout(db, job.data.scan_id, job.data.limit);
    const res = await runFanout(db, plan, { orgId: job.data.org_id, approvedUsd: job.data.approved_usd });
    log(`[worker] fanout.run ${job.data.scan_id}: ${res.fetched} fetched, ${res.failed} failed, $${res.usd}`);
    return res;
  });

  await boss.work<JudgeRunData>(QUEUES.judgeRun, async ([job]) => {
    const res = await judgeScan(getDb(), job.data.org_id, job.data.scan_id, log);
    log(`[worker] judge.run ${job.data.scan_id}: ${res.judged} judged, ${res.failed} failed`);
    return res;
  });

  await boss.schedule(QUEUES.scheduleTick, "0 * * * *");
}

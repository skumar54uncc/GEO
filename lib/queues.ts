export const QUEUES = {
  healthPing: "health.ping",
  scheduleTick: "schedule.tick",
  crawlDiscover: "crawl.discover",
  crawlPage: "crawl.page",
  auditRun: "audit.run",
  entityCheck: "entity.check",
  scanRun: "scan.run",
  captureRetry: "capture.retry",
  fanoutRun: "fanout.run",
  judgeRun: "judge.run",
  metricsRollup: "metrics.rollup",
  alertsEvaluate: "alerts.evaluate",
} as const;

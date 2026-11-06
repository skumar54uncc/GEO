import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  citedPages,
  crawlPages,
  evidenceGradeEnum,
  organizations,
  personas,
  prompts,
  recommendationLeverEnum,
  recommendations,
  scans,
  scanStatusEnum,
} from "@/lib/db/pg/schema";
import { nightlyLaunchAgent, restoreRawStore } from "../scripts/db";

const migrationPath = path.join(process.cwd(), "drizzle", "0007_wave1_database_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const journal = fs.readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8");

describe("Wave 1 additive database migration", () => {
  it("is numbered after 0006 and contains no destructive data statements", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(journal).toContain('"tag": "0007_wave1_database_foundation"');
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
    expect(migration).not.toContain('ALTER TABLE "draws"');
    expect(migration).not.toContain('ALTER TABLE "raw_payloads"');
    expect(migration).not.toContain('ALTER TABLE "prompt_set_items"');
    expect(migration).not.toContain('ALTER TABLE "prompt_sets"');
  });

  it("defines exactly the seven Playbook recommendation levers", () => {
    expect(recommendationLeverEnum.enumValues).toEqual([
      "technical",
      "on_page",
      "truth_layer",
      "listing",
      "earned_media",
      "community",
      "original_data",
    ]);
    expect(evidenceGradeEnum.enumValues).toEqual(["A", "B", "C", "D"]);
    expect(recommendations.leverType.name).toBe("lever_type");
    expect(recommendations.owner.name).toBe("owner");
    expect(recommendations.evidenceGrade.name).toBe("evidence_grade");
  });

  it("adds demo theming, canonical persona, citation, pause, and embedding contracts", () => {
    expect(organizations.isDemo.name).toBe("is_demo");
    expect(organizations.themeConfig.name).toBe("theme_config");
    expect(personas.region.name).toBe("region");
    expect(personas.typicalQuestions.name).toBe("typical_questions");

    expect(citedPages.fetchStatus.name).toBe("fetch_status");
    expect(citedPages.fetchError.name).toBe("fetch_error");
    expect(citedPages.robotsResult.name).toBe("robots_result");
    expect(citedPages.fetchUserAgent.name).toBe("fetch_user_agent");
    expect(citedPages.outboundLinks.name).toBe("outbound_links");
    expect(citedPages.structuredFeatures.name).toBe("structured_features");
    expect("fullText" in citedPages).toBe(false);
    expect(citedPages.textRef.name).toBe("text_ref");

    expect(scanStatusEnum.enumValues).toContain("paused");
    expect(scans.stopLossConfig.name).toBe("stop_loss_config");
    expect(scans.pausedReason.name).toBe("paused_reason");
    expect(scans.pausedAt.name).toBe("paused_at");
    for (const table of [prompts, crawlPages, citedPages]) {
      expect(table.embeddingDimension.name).toBe("embedding_dimension");
    }
  });

  it("adds the dashboard and Phase 4/6/7/8 access indexes", () => {
    for (const name of [
      "draws_scan_dashboard",
      "judge_runs_draw_latest",
      "mentions_judge_run",
      "claims_judge_run",
      "citations_draw",
      "fanout_queries_draw",
      "scans_campaign_created",
      "cost_ledger_org_at",
      "alerts_org_status_created",
      "demand_signals_campaign_source_fetched",
      "prompts_campaign_status_persona",
      "recommendations_campaign_status",
      "strategy_reports_campaign_created",
    ]) {
      expect(migration).toContain(`"${name}"`);
    }
  });
});

describe("local backup support", () => {
  it("generates a secret-free nightly launchd job using the repository working directory", () => {
    const plist = nightlyLaunchAgent("/repo/GEO", "/usr/bin/node", "/usr/lib/npm-cli.js");
    expect(plist).toContain("<string>db:nightly:run</string>");
    expect(plist).toContain("<key>WorkingDirectory</key><string>/repo/GEO</string>");
    expect(plist).toContain("<key>Hour</key><integer>2</integer>");
    expect(plist).not.toContain("DATABASE_URL");
  });

  it("restores missing raw files, keeps identical files, and refuses conflicts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-backup-test-"));
    const bundleRaw = path.join(root, "bundle", "data", "raw");
    const target = path.join(root, "target");
    fs.mkdirSync(bundleRaw, { recursive: true });
    fs.writeFileSync(path.join(bundleRaw, "same"), "same bytes");
    fs.writeFileSync(path.join(bundleRaw, "new"), "new bytes");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "same"), "same bytes");

    expect(restoreRawStore(path.join(root, "bundle"), target)).toBe(1);
    expect(fs.readFileSync(path.join(target, "new"), "utf8")).toBe("new bytes");

    fs.writeFileSync(path.join(bundleRaw, "same"), "different bytes");
    expect(() => restoreRawStore(path.join(root, "bundle"), target)).toThrow(
      /refusing to overwrite different raw-store file/,
    );
  });
});

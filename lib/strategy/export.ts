import {
  DEMO_DATA_BANNER,
  DEMO_ORG_NAME,
  exportMetadataSchema,
  type ExportMetadata,
} from "@/lib/contracts/exports";
import type { StrategyItem, StrategyReport } from "@/lib/contracts/strategy";
import { DEMAND_UNKNOWN_LABEL } from "./score";

/**
 * Escape a CSV cell for Excel/Sheets: quote when needed and prefix formula metacharacters
 * (=, +, -, @) so pasted content cannot run as a formula.
 */
export function csvEscape(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function itemRows(items: StrategyItem[], list: "scored" | "unscored"): string[] {
  return items.map((item) =>
    [
      list,
      item.id,
      item.topic,
      item.persona,
      item.promptCluster,
      item.leverType,
      item.owner,
      item.publishBy,
      item.scoreStatus === "demand_unknown" ? DEMAND_UNKNOWN_LABEL : String(item.score ?? ""),
      String(item.originalScore ?? DEMAND_UNKNOWN_LABEL),
      String(item.factors.demand.value ?? DEMAND_UNKNOWN_LABEL),
      item.factors.demand.source,
      String(item.factors.demand.n),
      String(item.factors.gapSize.value ?? ""),
      item.factors.gapSize.source,
      String(item.factors.gapSize.n),
      String(item.factors.effort.value ?? ""),
      item.factors.effort.source,
      String(item.factors.effort.n),
      item.evidenceGrade,
      item.evidenceIds.join(" "),
      item.headlineTerms.join(" | "),
      item.format,
    ]
      .map((v) => csvEscape(String(v)))
      .join(","),
  );
}

export function buildStrategyExportMetadata(input: {
  organizationId: string;
  organizationName: string;
  isDemo: boolean;
  generatedAt?: string;
}): ExportMetadata {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (input.isDemo) {
    return exportMetadataSchema.parse({
      format: "csv",
      dataKind: "demo",
      organizationId: input.organizationId,
      organizationName: DEMO_ORG_NAME,
      banner: DEMO_DATA_BANNER,
      generatedAt,
    });
  }
  return exportMetadataSchema.parse({
    format: "csv",
    dataKind: "real",
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    banner: null,
    generatedAt,
  });
}

/** CSV export of the plan. Demo-org exports carry the DEMO DATA banner as the first line. */
export function exportStrategyPlanCsv(
  report: StrategyReport,
  meta: ExportMetadata,
): { csv: string; metadata: ExportMetadata } {
  const header = [
    "list",
    "id",
    "topic",
    "persona",
    "prompt_cluster",
    "lever_type",
    "owner",
    "publish_by",
    "score",
    "original_score",
    "demand",
    "demand_source",
    "demand_n",
    "gap_size",
    "gap_source",
    "gap_n",
    "effort",
    "effort_source",
    "effort_n",
    "evidence_grade",
    "evidence_ids",
    "headline_terms",
    "format",
  ].join(",");

  const lines: string[] = [];
  if (meta.dataKind === "demo") {
    // Banner is a leading annotation line, not a CSV field (may contain commas).
    lines.push(meta.banner);
  }
  lines.push(header);
  lines.push(...itemRows(report.output.scoredItems, "scored"));
  lines.push(...itemRows(report.output.unscoredItems, "unscored"));

  // Off-site section
  lines.push("");
  lines.push(["offsite_domain", "source_class", "peer_citations", "our_citations", "n", "example_urls"].join(","));
  for (const row of report.output.offsite) {
    lines.push(
      [row.domain, row.sourceClass, row.peerCitationCount, row.ourCitationCount, row.n, row.exampleUrls.join(" ")]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }

  return { csv: `${lines.join("\n")}\n`, metadata: meta };
}

import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import type { CampaignTarget } from "@/lib/metrics/rollup";
import { displayable } from "@/lib/metrics/displayable";
import {
  ACCURACY_PROVISIONAL_LABEL,
  DEMO_PDF_BANNER,
  WON_DEFINITION,
  analystNoteAllowedForPdf,
  ciRange,
  engineLabel,
  fidelityLabel,
  pctWhole,
  promptUnitLabel,
  runnerLabel,
} from "@/lib/exports/leadershipLabels";
import { buildSimplePdf, extractPdfStrings, type PdfTextBlock } from "@/lib/exports/simplePdf";

export type LeadershipPdfInput = {
  organization: { name: string; isDemo: boolean };
  campaign: { name: string; topic: string };
  headline: {
    engine: string;
    runner: string;
    won: number | null;
    prompts: number | null;
    rate: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    draws: number;
  } | null;
  trendLabel: string | null;
  /** Prior comparable scan date (YYYY-MM-DD) for the trend line. */
  previousScanDate?: string | null;
  engines: Array<{
    engine: string;
    runner: string;
    won: number | null;
    prompts: number | null;
    rate: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    draws: number;
  }>;
  analystNote: { text: string; authorName: string | null; at: string; status?: "draft" | "published" } | null;
  /** Baseline scan date (YYYY-MM-DD), never a UUID. */
  baselineDate: string | null;
  target: CampaignTarget | null;
  latestScan: { createdAt: string; isBaseline: boolean } | null;
  /** When true, omit accuracy entirely (provisional until hand check). */
  includeAccuracy?: boolean;
  accuracyLine?: string | null;
  /** Empty UNC Charlotte (no pilot data): show "No measurements yet". */
  noMeasurementsYet?: boolean;
};

const METHODOLOGY_LINES = [
  "A prompt is one neutral question we ask every AI surface the same way.",
  "We collect 3 answers per prompt on each engine.",
  WON_DEFINITION,
  "Likely range: with 30 prompts, the true rate is probably in this range.",
  "Fidelity: consumer app capture, API with web search (medium), or Google results capture. These are never averaged together.",
];

/** Leadership PDFs: no em/en dashes, and no space-hyphen-space used as a separator. */
export function stripEmDashes(s: string): string {
  return s.replace(/[—–]/g, "-").replace(/ - /g, ". ");
}

function formatTarget(metric: string): string {
  if (metric === "prompts_won") return "prompts won";
  return metric.replace(/_/g, " ");
}

function trendLine(label: string | null, previousScanDate: string | null | undefined): string | null {
  if (!label) return null;
  if (previousScanDate) return `Trend compared with ${previousScanDate}: ${label}`;
  return `Trend: ${label}`;
}

/** Build leadership PDF content blocks (Overview + Visibility). */
export function leadershipPdfBlocks(data: LeadershipPdfInput): PdfTextBlock[] {
  const blocks: PdfTextBlock[] = [];
  blocks.push({
    title: "Overview and Visibility",
    lines: [
      `${data.organization.name} · ${data.campaign.name}${data.campaign.topic ? ` · ${data.campaign.topic}` : ""}`,
    ],
  });

  if (data.noMeasurementsYet) {
    blocks.push({ lines: ["No measurements yet"] });
    blocks.push({ title: "How we measure", lines: METHODOLOGY_LINES });
    return blocks;
  }

  if (data.latestScan?.isBaseline || data.baselineDate) {
    const date = data.baselineDate ?? data.latestScan?.createdAt.slice(0, 10) ?? "";
    if (data.latestScan?.isBaseline) {
      blocks.push({ lines: [`Baseline: first scan of this prompt set (${date}).`] });
    } else if (data.baselineDate) {
      blocks.push({ lines: [`Baseline for this prompt set: ${date}.`] });
    }
  }

  if (data.target) {
    const eng = engineLabel(data.target.engine);
    const line =
      data.target.metric === "prompts_won"
        ? `Target: ${pctWhole(data.target.value)} of prompts won on ${eng} by ${data.target.date}.`
        : `Target: ${formatTarget(data.target.metric)} on ${eng}: ${pctWhole(data.target.value)} by ${data.target.date}.`;
    blocks.push({ lines: [line] });
  }

  if (data.headline) {
    const prompts = data.headline.prompts;
    const won = data.headline.won;
    const disp = displayable({
      prompts: prompts ?? null,
      n: data.headline.draws,
      tooFewPrompts: prompts != null && prompts > 0 && prompts < 10,
    });
    if (disp.kind === "too_few_prompts") {
      blocks.push({ title: "Headline", lines: ["Too few prompts"] });
    } else if (won == null || prompts == null) {
      blocks.push({ title: "Headline", lines: ["No headline cell yet."] });
    } else {
      const eng = engineLabel(data.headline.engine);
      const range = ciRange(data.headline.ciLow, data.headline.ciHigh);
      const rate = pctWhole(data.headline.rate);
      const fid = fidelityLabel(data.headline.runner);
      const fidParen = fid.charAt(0).toLowerCase() + fid.slice(1);
      const orgName = data.organization.name.includes("Demo") ? data.organization.name : "UNC Charlotte";
      const head = `${orgName} won ${won} of ${prompts} prompts on ${eng} (${fidParen}), ${rate}.${range ? ` Likely range: ${range}.` : ""}`;
      const trend = trendLine(data.trendLabel, data.previousScanDate);
      blocks.push({
        title: "Headline",
        lines: [head, WON_DEFINITION, ...(trend ? [trend] : [])],
        bar: {
          rate: data.headline.rate,
          ciLow: data.headline.ciLow,
          ciHigh: data.headline.ciHigh,
        },
      });
    }
  } else {
    blocks.push({ title: "Headline", lines: ["No headline cell yet."] });
  }

  const engineLines: PdfTextBlock[] = [];
  if (!data.engines.length) {
    engineLines.push({ title: "Engines", lines: ["No engine cells."] });
  } else {
    const unitPrompts = data.engines[0]?.prompts ?? data.headline?.prompts ?? 30;
    engineLines.push({ title: "Engines", lines: [promptUnitLabel(unitPrompts)] });
    for (const e of data.engines) {
      const disp = displayable({
        prompts: e.prompts ?? null,
        n: e.draws,
        tooFewPrompts: e.prompts != null && e.prompts > 0 && e.prompts < 10,
      });
      if (disp.kind === "too_few_prompts") {
        engineLines.push({
          lines: [`${engineLabel(e.engine)}: Too few prompts`],
        });
        continue;
      }
      const prompts = e.prompts ?? 30;
      const won = e.won;
      const range = ciRange(e.ciLow, e.ciHigh);
      const line =
        won != null
          ? `${engineLabel(e.engine)}: ${won} of ${prompts} prompts (${pctWhole(e.rate)})${range ? `; likely range ${range}` : ""}. ${fidelityLabel(e.runner)}.`
          : `${engineLabel(e.engine)}: ${pctWhole(e.rate)}${range ? `; likely range ${range}` : ""}. ${fidelityLabel(e.runner)}.`;
      engineLines.push({
        lines: [line],
        bar: { rate: e.rate, ciLow: e.ciLow, ciHigh: e.ciHigh },
      });
    }
  }
  blocks.push(...engineLines);

  if (data.analystNote && analystNoteAllowedForPdf(data.analystNote.text, data.trendLabel, data.analystNote.status ?? "published")) {
    blocks.push({
      title: "Analyst note",
      keepTogether: true,
      lines: [
        data.analystNote.text,
        `${data.analystNote.authorName ?? "editor"} · ${data.analystNote.at.slice(0, 10)}`,
      ],
    });
  }

  if (data.includeAccuracy && data.accuracyLine) {
    blocks.push({
      title: "Accuracy",
      lines: [data.accuracyLine, ACCURACY_PROVISIONAL_LABEL],
    });
  }

  blocks.push({
    title: "How we measure",
    lines: METHODOLOGY_LINES,
  });

  return blocks.map((b) => ({
    ...b,
    title: b.title ? stripEmDashes(b.title) : b.title,
    lines: b.lines.map(stripEmDashes),
  }));
}

/**
 * Binary leadership PDF (application/pdf). Demo orgs get a banner and DEMO DATA watermark.
 */
export function leadershipPdfBytes(data: LeadershipPdfInput): Uint8Array {
  return buildSimplePdf({
    blocks: leadershipPdfBlocks(data),
    watermark: data.organization.isDemo ? DEMO_DATA_BANNER : null,
    banner: data.organization.isDemo ? DEMO_PDF_BANNER : null,
    brand: "Scout",
    brandLogo: true,
    footerDate: new Date().toISOString().slice(0, 10),
  });
}

/**
 * @deprecated Prefer leadershipPdfBytes for the HTTP route. Kept for HTML previews in tests.
 */
export function leadershipPdfHtml(data: LeadershipPdfInput): string {
  const banner = data.organization.isDemo
    ? `<p style="background:#fff3cd;border:1px solid #856404;padding:8px;font-weight:700">${DEMO_PDF_BANNER}</p><p>${DEMO_DATA_BANNER}</p>`
    : "";
  const blocks = leadershipPdfBlocks(data)
    .map((b) => {
      const title = b.title ? `<h2>${escape(b.title)}</h2>` : "";
      const lines = b.lines.map((l) => `<p>${escape(l)}</p>`).join("");
      return `${title}${lines}`;
    })
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Leadership report</title></head><body>${banner}${blocks}</body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export { extractPdfStrings, runnerLabel, engineLabel };

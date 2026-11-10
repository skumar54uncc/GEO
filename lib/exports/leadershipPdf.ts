import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import type { CampaignTarget } from "@/lib/metrics/rollup";
import { buildSimplePdf, type PdfTextBlock } from "@/lib/exports/simplePdf";

export type LeadershipPdfInput = {
  organization: { name: string; isDemo: boolean };
  campaign: { name: string; topic: string };
  methodologyUrl: string;
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
  engines: Array<{ engine: string; runner: string; rate: number | null; draws: number }>;
  analystNote: { text: string; authorName: string | null; at: string } | null;
  baselineScanIds: string[];
  target: CampaignTarget | null;
  latestScan: { id: string; createdAt: string; isBaseline: boolean } | null;
};

const pct = (x: number | null) => (x == null ? "unknown" : `${(x * 100).toFixed(0)}%`);

/** Build leadership PDF content blocks (Overview + Visibility). */
export function leadershipPdfBlocks(data: LeadershipPdfInput): PdfTextBlock[] {
  const blocks: PdfTextBlock[] = [];
  blocks.push({
    title: "Overview & Visibility",
    lines: [
      `${data.organization.name} · ${data.campaign.name}${data.campaign.topic ? ` · ${data.campaign.topic}` : ""}`,
    ],
  });

  if (data.latestScan?.isBaseline || (data.latestScan && data.baselineScanIds.includes(data.latestScan.id))) {
    blocks.push({
      lines: [
        `Baseline — first scan of this prompt set (${data.latestScan?.createdAt.slice(0, 10) ?? ""}).`,
      ],
    });
  } else if (data.baselineScanIds.length) {
    blocks.push({
      lines: [`Baseline scan(s) in this prompt set: ${data.baselineScanIds.join(", ")}`],
    });
  }

  if (data.target) {
    blocks.push({
      lines: [
        `Target — ${data.target.metric} on ${data.target.engine}: ${pct(data.target.value)} by ${data.target.date}.`,
      ],
    });
  }

  if (data.headline) {
    const ci =
      data.headline.ciLow != null && data.headline.ciHigh != null
        ? ` (${pct(data.headline.ciLow)}–${pct(data.headline.ciHigh)} CI)`
        : "";
    const won =
      data.headline.won != null && data.headline.prompts != null
        ? `${data.headline.won}/${data.headline.prompts} prompts won`
        : "unknown";
    blocks.push({
      title: "Headline",
      lines: [
        `${data.headline.engine} · ${data.headline.runner}: ${won} · ${pct(data.headline.rate)}${ci} · n=${data.headline.draws}`,
        ...(data.trendLabel ? [`Trend: ${data.trendLabel}`] : []),
      ],
    });
  } else {
    blocks.push({ title: "Headline", lines: ["No headline cell yet."] });
  }

  blocks.push({
    title: "Engines",
    lines: data.engines.length
      ? data.engines.map((e) => `${e.engine} · ${e.runner}: ${pct(e.rate)} (n=${e.draws})`)
      : ["No engine cells."],
  });

  if (data.analystNote) {
    blocks.push({
      title: "Analyst note",
      lines: [
        data.analystNote.text,
        `${data.analystNote.authorName ?? "editor"} · ${data.analystNote.at.slice(0, 10)}`,
      ],
    });
  }

  blocks.push({
    title: "Methodology",
    lines: [data.methodologyUrl],
  });

  return blocks;
}

/**
 * Binary leadership PDF (application/pdf). Demo orgs watermark every page with DEMO DATA.
 * Closes COVERAGE row 28.
 */
export function leadershipPdfBytes(data: LeadershipPdfInput): Uint8Array {
  return buildSimplePdf({
    blocks: leadershipPdfBlocks(data),
    watermark: data.organization.isDemo ? DEMO_DATA_BANNER : null,
  });
}

/**
 * @deprecated Prefer leadershipPdfBytes for the HTTP route. Kept for HTML previews in tests.
 */
export function leadershipPdfHtml(data: LeadershipPdfInput): string {
  const banner = data.organization.isDemo
    ? `<p style="background:#fff3cd;border:1px solid #856404;padding:8px;font-weight:700">${DEMO_DATA_BANNER}</p>`
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

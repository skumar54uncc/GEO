import { getDomain } from "tldts";
import type { AppConfig } from "./types";

export function registrableDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const domain = getDomain(withProto, { allowPrivateDomains: true });
  return domain ? domain.toLowerCase() : null;
}

export function isTargetDomain(domain: string | null, config: AppConfig): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return config.target_domains.some((t) => d === t.toLowerCase() || d.endsWith(`.${t.toLowerCase()}`));
}

export function competitorForDomain(domain: string | null, config: AppConfig): string | null {
  if (!domain) return null;
  const d = domain.toLowerCase();
  for (const c of config.competitors) {
    if (c.domains.some((cd) => d === cd.toLowerCase() || d.endsWith(`.${cd.toLowerCase()}`))) {
      return c.name;
    }
  }
  return null;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.959963984540054,
): { rate: number | null; ci_low: number | null; ci_high: number | null } {
  if (n <= 0) return { rate: null, ci_low: null, ci_high: null };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    rate: p,
    ci_low: clamp01((center - margin) / denom),
    ci_high: clamp01((center + margin) / denom),
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function formatPct(x: number | null): string {
  if (x === null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

export function formatRateLabel(successes: number, n: number, rate: number | null, low: number | null, high: number | null): string {
  if (n === 0 || rate === null) return `n = 0`;
  const ci =
    low === null || high === null
      ? ""
      : `; 95% Wilson CI ${formatPct(low)}–${formatPct(high)}`;
  return `${formatPct(rate)} (${successes} of ${n}${ci})`;
}

export type TextBlock = {
  type?: string;
  snippet?: string;
  title?: string;
  list?: TextBlock[];
  text_blocks?: TextBlock[];
};

export function flattenTextBlocks(blocks: unknown): string {
  if (!blocks) return "";
  const lines: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      lines.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const b = node as TextBlock;
      if (b.title) lines.push(b.title);
      if (b.snippet) lines.push(b.snippet);
      if (b.list) walk(b.list);
      if (b.text_blocks) walk(b.text_blocks);
    }
  };
  walk(blocks);
  return lines.map((s) => s.trim()).filter(Boolean).join("\n\n");
}

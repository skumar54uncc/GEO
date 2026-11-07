import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import type { FundingPageData } from "./funding";

/**
 * One-page leadership PDF as plain text/PDF-lite (printable HTML body).
 * Numbers keep the upper-estimate label; demo orgs get the DEMO DATA banner.
 */
export function fundingPdfHtml(data: FundingPageData): string {
  const money = (n: number | null) => (n === null ? "unknown" : `$${n.toFixed(2)}`);
  const banner = data.organization.isDemo
    ? `<p style="background:#fff3cd;border:1px solid #856404;padding:8px;font-weight:700">${DEMO_DATA_BANNER}</p>`
    : "";
  const vendors = data.vendorComparison
    .map(
      (v) =>
        `<tr><td>${escape(v.vendor)}</td><td>${escape(v.price)}</td><td>${escape(v.scope)}</td><td><a href="${escape(v.sourceUrl)}">${escape(v.sourceUrl)}</a> (${escape(v.sourceDate)})</td></tr>`,
    )
    .join("");
  const platformRow = `<tr><td><strong>This platform, upper estimate</strong></td><td>${money(data.platformSummary.monthlyUsd)}/mo, ${money(data.platformSummary.yearlyUsd)}/yr</td><td>Primary routes only. Fallback, calibration, and parity are $0 unless scheduled.</td><td>${escape(data.upperEstimateLabel)}</td></tr>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Budget &amp; Funding, ${escape(data.organization.name)}</title>
<style>
body{font-family:Cambria,Georgia,serif;color:#14231c;margin:24px;font-size:12px}
h1{font-size:20px;margin:0 0 8px} h2{font-size:14px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #d5ddd7;padding:4px 6px;text-align:left}
.muted{color:#555} .label{font-style:italic;color:#333}
</style></head><body>
${banner}
<h1>Budget &amp; Funding</h1>
<p class="muted">${escape(data.organization.name)}. Generated for leadership review.</p>
<p class="label">Every cost figure is an ${escape(data.upperEstimateLabel)}.</p>

<h2>Pilot estimate (Energy core)</h2>
<p>Campaign: ${escape(data.pilot.campaign ?? "none")}. ${data.pilot.prompts} prompts. ${data.pilot.engines} engines. ${data.pilot.drawsPerPrompt} answers each. ${data.pilot.totalDraws} AI answers checked.</p>
${data.pilot.basedOnDrafts ? `<p class="label">based on ${data.pilot.draftPrompts} draft prompts, pending approval</p>` : ""}
<p><strong>${money(data.pilot.usdUpper)}</strong> <span class="label">(${escape(data.upperEstimateLabel)})</span></p>
<p class="muted">${escape(data.pilot.note)}</p>

<h2>Steady state</h2>
<p>Core $/mo: ${money(data.steadyState.coreUsdPerMonth)}</p>
<p>Persona $/mo (quarterly run ÷ 3): ${money(data.steadyState.personaUsdPerMonth)} (full quarterly run ${money(data.steadyState.personaQuarterlyUsd)})</p>
<p>Total $/mo: ${money(data.steadyState.totalUsdPerMonth)}</p>
<p>Total $/yr: ${money(data.steadyState.totalUsdPerYear)}</p>
<p class="muted">${escape(data.steadyState.note)}</p>

<h2>Providers, spend, caps</h2>
<p>DataForSEO minimum top-up: $${data.dataforseoMinTopUpUsd}. Spend recorded to date: ${money(data.spendToDateUsd)}.</p>
<table><thead><tr><th>Provider</th><th>Role</th><th>Pilot share</th><th>Monthly share</th><th>Spent</th><th>Monthly cap</th><th>Per-scan cap</th></tr></thead>
<tbody>${
    data.providers.length
      ? data.providers
          .map(
            (p) =>
              `<tr><td>${escape(p.displayName)}</td><td>${escape(p.roleLabel)}</td><td>${money(p.pilotShareUsd)}</td><td>${money(p.monthlyShareUsd)}</td><td>${money(p.spentThisMonthUsd)}</td><td>${money(p.monthlyBudgetUsd)}</td><td>${money(p.perScanCapUsd)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="7">No provider accounts configured.</td></tr>`
  }</tbody></table>
${
  data.capWarnings.length
    ? `<p class="label"><strong>Cap warnings:</strong> ${data.capWarnings.map(escape).join(" ")}</p>`
    : ""
}

<h2>Stop-loss</h2>
<p>Pause if more than ${data.stopLoss.errorOrBlockedRateThreshold * 100}% of the first ${data.stopLoss.firstDrawWindow} AI answers are errors or blocked, or if actual cost runs more than ${data.stopLoss.estimateCostOverrunThreshold * 100}% over the estimate.</p>

<h2>Vendor comparison</h2>
<table><thead><tr><th>Vendor</th><th>Price</th><th>Scope</th><th>Source</th></tr></thead><tbody>${platformRow}${vendors}</tbody></table>
</body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SURFACE_LABELS, type Surface } from "@/lib/types";

const BRAND = "var(--brand)";
const MUTED = "var(--text-muted)";
const CHART = "var(--chart)";
const CHART_2 = "var(--chart-2)";
const CHART_4 = "var(--chart-4)";
const CHART_5 = "var(--chart-5)";
const GRID = "var(--chart-grid)";
const INK = "var(--text)";

export function VisibilityBySurface({
  data,
}: {
  data: Array<{ surface: Surface; rate: number | null; n: number; label: string }>;
}) {
  const rows = data.map((d) => ({
    name: SURFACE_LABELS[d.surface],
    rate: d.rate === null ? 0 : Math.round(d.rate * 1000) / 10,
    n: d.n,
    label: d.label,
  }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} interval={0} angle={-18} textAnchor="end" height={60} />
          <YAxis unit="%" tick={{ fontSize: 11, fill: INK }} domain={[0, 100]} />
          <Tooltip
            formatter={(v, _n, p) => [`${v}%`, (p.payload as { label: string }).label]}
          />
          <Bar dataKey="rate" fill={BRAND} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShareOfVoiceBar({
  target,
  competitors,
  share,
  label,
}: {
  target: number;
  competitors: number;
  share: number | null;
  label: string;
}) {
  const data = [
    { name: "UNC Charlotte", value: target, fill: BRAND },
    { name: "Competitors", value: competitors, fill: MUTED },
  ];
  return (
    <div>
      <p className="mb-2 font-mono text-sm tabular text-uncc-ink">{label}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: INK }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: INK }} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 2, 2, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-uncc-ink/60">
        Share of voice = target mentions / (target + all competitor mentions). {share === null ? "n = 0" : `Current share ${(share * 100).toFixed(1)}%.`}
      </p>
    </div>
  );
}

export function ConsistencyStacked({
  buckets,
}: {
  buckets: { "3_of_3": number; "2_of_3": number; "1_of_3": number; "0_of_3": number; partial: number };
}) {
  const data = [
    {
      name: "Prompt × surface",
      "3 of 3": buckets["3_of_3"],
      "2 of 3": buckets["2_of_3"],
      "1 of 3": buckets["1_of_3"],
      "0 of 3": buckets["0_of_3"],
      "Partial (<3 runs)": buckets.partial,
    },
  ];
  const colors: Record<string, string> = {
    "3 of 3": BRAND,
    "2 of 3": CHART_2,
    "1 of 3": CHART,
    "0 of 3": CHART_4,
    "Partial (<3 runs)": CHART_5,
  };
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fill: INK }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: INK }} />
          <Tooltip />
          <Legend />
          {Object.keys(colors).map((k) => (
            <Bar key={k} dataKey={k} stackId="a" fill={colors[k]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CitedDomainsBar({
  rows,
}: {
  rows: Array<{ domain: string; count: number; is_target: boolean }>;
}) {
  const data = rows.slice(0, 12);
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: INK }} />
          <YAxis type="category" dataKey="domain" width={140} tick={{ fontSize: 11, fill: INK }} />
          <Tooltip />
          <Bar dataKey="count" radius={[0, 2, 2, 0]}>
            {data.map((d) => (
              <Cell key={d.domain} fill={d.is_target ? BRAND : MUTED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendsInterestLine({
  series,
}: {
  series: Array<{ date: string; us?: number; nc?: number; sc?: number }>;
}) {
  if (!series.length) {
    return (
      <p className="rounded border border-dashed border-uncc-rule p-6 text-sm text-uncc-ink/60">
        No interest-over-time points for this term yet. Click a topic that already has a line, or fetch the demand pack.
      </p>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height={256}>
        <LineChart data={series} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: INK }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: INK }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="us" name="United States" stroke={BRAND} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="nc" name="North Carolina" stroke={CHART} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="sc" name="South Carolina" stroke={MUTED} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

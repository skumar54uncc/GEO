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

const TARGET = "#005035";
const MUTED = "#8aa193";
const GOLD = "#A49665";
const INK = "#14231c";

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
          <CartesianGrid stroke="#e7eee9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK }} interval={0} angle={-18} textAnchor="end" height={60} />
          <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip
            formatter={(v, _n, p) => [`${v}%`, (p.payload as { label: string }).label]}
          />
          <Bar dataKey="rate" fill={TARGET} radius={[2, 2, 0, 0]} />
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
    { name: "UNC Charlotte", value: target, fill: TARGET },
    { name: "Competitors", value: competitors, fill: MUTED },
  ];
  return (
    <div>
      <p className="mb-2 font-mono text-sm tabular text-uncc-ink">{label}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16 }}>
            <CartesianGrid stroke="#e7eee9" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
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
    "3 of 3": TARGET,
    "2 of 3": "#3d7a62",
    "1 of 3": GOLD,
    "0 of 3": "#b9c4bd",
    "Partial (<3 runs)": "#d9c58a",
  };
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
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
          <CartesianGrid stroke="#e7eee9" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="domain" width={140} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[0, 2, 2, 0]}>
            {data.map((d) => (
              <Cell key={d.domain} fill={d.is_target ? GOLD : TARGET} />
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
          <CartesianGrid stroke="#e7eee9" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="us" name="United States" stroke={TARGET} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="nc" name="North Carolina" stroke={GOLD} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="sc" name="South Carolina" stroke={MUTED} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

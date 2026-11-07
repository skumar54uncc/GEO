"use client";

import { visibilityColumnsFromTrend, type TrendScanPoint } from "@/lib/metrics/visibilityChart";
import { enginePlain, formatScanDate } from "@/lib/ui/labels";

export function VisibilityChart({
  trend,
  engine,
  runner,
  events,
  showRaw = false,
  canShowRaw = false,
}: {
  trend: TrendScanPoint[];
  engine: string;
  runner: string;
  events: Array<{ engine: string; occurredOn: string; note: string | null }>;
  showRaw?: boolean;
  canShowRaw?: boolean;
}) {
  const points = visibilityColumnsFromTrend(trend, engine, runner);
  const W = 760;
  const H = 300;
  const padL = 52;
  const padR = 10;
  const padT = 27;
  const padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = Math.max(points.length, 1);
  const gap = 20;
  const barW = Math.max(40, (innerW - gap * (n + 1)) / n);

  function y(rate: number) {
    return padT + innerH * (1 - rate);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${enginePlain(engine)} prompts won per scan with 95 percent ranges`}
      data-testid="visibility-chart"
      data-columns={points.length}
    >
      <defs>
        <linearGradient id="scoutGb" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-fill-from)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--chart-fill-to)" stopOpacity="0.15" />
        </linearGradient>
        {points.map((_, i) => (
          <pattern
            key={`hatch-${i}`}
            id={`scoutVisHatch-${i}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="var(--chart-fill-from)" fillOpacity="0.12" />
            <path d="M0 0 L0 8" stroke="var(--border)" strokeWidth="1.2" />
          </pattern>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const yy = y(tick);
        return (
          <g key={tick}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray={tick === 0 ? "0" : "4 4"} />
            <text x={padL - 12} y={yy + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">
              {(tick * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
      {points.map((p, i) => {
        const rate = p.height;
        const x = padL + gap + i * (barW + gap);
        const top = y(rate);
        const h = Math.max(0, y(0) - top);
        const cx = x + barW / 2;
        const ciTop = p.ciHigh != null ? y(p.ciHigh) : top;
        const ciBot = p.ciLow != null ? y(p.ciLow) : top;
        const showRateOnNode = !p.suppressed || (canShowRaw && showRaw);
        const rateAttr = showRateOnNode && p.rate != null ? String(p.rate) : "";
        return (
          <g
            key={p.scanId}
            data-testid="visibility-column"
            data-rate={rateAttr}
            data-height={p.height}
            data-suppressed={p.suppressed ? "1" : undefined}
          >
            {p.suppressed ? (
              <>
                <rect
                  className="scout-col"
                  style={{ animationDelay: `${i * 60}ms` }}
                  x={x}
                  y={top}
                  width={barW}
                  height={h}
                  fill={`url(#scoutVisHatch-${i})`}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                {p.suppressionMessage ? (
                  <text
                    x={cx}
                    y={top + h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="var(--text-muted)"
                    transform={`rotate(-65 ${cx} ${top + h / 2})`}
                  >
                    {p.suppressionMessage.length > 42 ? `${p.suppressionMessage.slice(0, 40)}…` : p.suppressionMessage}
                  </text>
                ) : null}
                {canShowRaw && showRaw && p.rawRate != null ? (
                  <text x={cx} y={Math.min(y(0) - 4, top + h + 12)} textAnchor="middle" fontSize="9" fill="var(--text-muted)" opacity={0.85}>
                    {((p.rawRate ?? 0) * 100).toFixed(1)}%
                  </text>
                ) : null}
              </>
            ) : (
              <>
                <rect className="scout-col" style={{ animationDelay: `${i * 60}ms` }} x={x} y={top} width={barW} height={h} fill="url(#scoutGb)" />
                <rect x={x} y={top} width={barW} height={3} rx={1.5} fill="var(--chart)" />
                {p.ciLow != null && p.ciHigh != null && p.ciLow !== p.ciHigh ? (
                  <>
                    <line x1={cx} x2={cx} y1={ciTop} y2={ciBot} stroke="var(--text)" strokeWidth="1.4" opacity="0.55" />
                    <line x1={cx - 7} x2={cx + 7} y1={ciTop} y2={ciTop} stroke="var(--text)" strokeWidth="1.4" opacity="0.55" />
                    <line x1={cx - 7} x2={cx + 7} y1={ciBot} y2={ciBot} stroke="var(--text)" strokeWidth="1.4" opacity="0.55" />
                  </>
                ) : null}
              </>
            )}
            <text x={cx} y={H - 14} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
              {formatScanDate(p.createdAt)}
            </text>
          </g>
        );
      })}
      {events
        .filter((e) => e.engine === engine)
        .slice(0, 2)
        .map((e, i) => {
          const x = padL + gap + Math.min(Math.max(points.length - 1, 0), i + 1) * (barW + gap) + barW / 2;
          return (
            <g key={`${e.occurredOn}-${i}`} data-testid="model-event-flag">
              <line x1={x} x2={x} y1={padT - 1} y2={y(0)} stroke="var(--alert-amber)" strokeDasharray="3 3" />
              <rect x={x - 70} y={6} width={140} height={22} rx={11} fill="var(--demo-bg)" stroke="var(--demo-border)" />
              <text x={x} y={21} textAnchor="middle" fontSize="11" fill="var(--demo-fg)">
                {(e.note || "Model event").slice(0, 28)}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

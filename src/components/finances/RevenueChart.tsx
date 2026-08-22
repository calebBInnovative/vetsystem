'use client';

import type { PeriodPoint, AnalyticsPeriod } from '@/hooks/useAnalytics';

interface RevenueChartProps {
  data:    PeriodPoint[];
  period:  AnalyticsPeriod;
  height?: number;
}

export function RevenueChart({ data, period, height = 96 }: RevenueChartProps) {
  if (data.length === 0) return null;

  const maxRevenue  = Math.max(...data.map(d => d.revenue), 1);
  const labelH      = 14;
  const totalH      = height + labelH;
  const W           = 400;
  const gap         = period === 'month' ? 1.5 : period === 'year' ? 2.5 : 5;
  const barW        = (W - (data.length - 1) * gap) / data.length;
  const minBarH     = 3;

  function showLabel(i: number): boolean {
    if (period === 'month') return i === 0 || (i + 1) % 5 === 0 || i === data.length - 1;
    return true;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${totalH}`}
      className="w-full text-primary"
      preserveAspectRatio="none"
      role="img"
      aria-label="Gráfico de ingresos por período"
    >
      <defs>
        <linearGradient id="rcNormal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="0.65" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="rcCurrent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Subtle grid lines */}
      {[0.33, 0.66].map(pct => (
        <line
          key={pct}
          x1="0"  y1={height * (1 - pct)}
          x2={W}  y2={height * (1 - pct)}
          stroke="currentColor"
          strokeOpacity="0.07"
          strokeWidth="0.5"
        />
      ))}

      {/* Bars */}
      {data.map((point, i) => {
        const barH = point.revenue > 0
          ? Math.max(minBarH, (point.revenue / maxRevenue) * (height - 6))
          : 0;
        const x = i * (barW + gap);
        const y = height - barH;
        return (
          <rect
            key={point.date}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={Math.min(3, barW * 0.3)}
            fill={point.isCurrent ? 'url(#rcCurrent)' : 'url(#rcNormal)'}
            opacity={point.revenue === 0 ? 0.1 : 1}
          />
        );
      })}

      {/* X-axis labels */}
      {data.map((point, i) => {
        if (!showLabel(i)) return null;
        const x = i * (barW + gap) + barW / 2;
        return (
          <text
            key={`lbl-${point.date}`}
            x={x}
            y={totalH - 1}
            textAnchor="middle"
            fontSize={period === 'month' ? 7 : 9}
            fill="currentColor"
            opacity={point.isCurrent ? 0.85 : 0.4}
            fontWeight={point.isCurrent ? '600' : '400'}
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

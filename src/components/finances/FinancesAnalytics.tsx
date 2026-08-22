'use client';

import { useState } from 'react';
import {
  format, parseISO,
  addDays, addWeeks, addMonths, addYears,
  subDays, subWeeks, subMonths, subYears,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Minus,
  ShoppingBag, Stethoscope, Lightbulb,
  PackageSearch,
} from 'lucide-react';
import {
  useFinancialAnalytics, getPeriodLabel,
  type AnalyticsPeriod, type ProductStat, type ServiceStat, type AnalyticsInsight,
  type PeriodPoint,
} from '@/hooks/useAnalytics';
import { PRODUCT_CATEGORIES } from '@/types/inventory';
import { SERVICE_CATEGORIES } from '@/types/service';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

const PERIOD_TABS: { label: string; value: AnalyticsPeriod }[] = [
  { label: 'Día',    value: 'day'   },
  { label: 'Semana', value: 'week'  },
  { label: 'Mes',    value: 'month' },
  { label: 'Año',    value: 'year'  },
];

// ─── Growth badge ─────────────────────────────────────────────────────────────

function GrowthBadge({ pct, prevRevenue }: { pct: number; prevRevenue: number }) {
  if (prevRevenue === 0) return null;
  const up   = pct >= 0;
  const Icon = pct > 1 ? TrendingUp : pct < -1 ? TrendingDown : Minus;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
      up
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    )}>
      <Icon size={10} />
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

// ─── Sparkline (embedded area-line chart, no labels needed) ──────────────────

function Sparkline({ data }: { data: PeriodPoint[] }) {
  if (data.length < 2) return null;
  const W = 240, H = 52;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - (d.revenue / max) * (H - 6) - 3,
    current: d.isCurrent,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H}Z`;
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full text-primary"
      preserveAspectRatio="none"
      role="img"
      aria-label="Tendencia de ingresos"
    >
      <defs>
        <linearGradient id="spkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid line at midpoint */}
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.5" />
      {/* Area fill */}
      <path d={areaPath} fill="url(#spkGrad)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Current-period dot */}
      <circle cx={last.x} cy={last.y} r="3" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

// ─── Inline rank bar ──────────────────────────────────────────────────────────

function RankBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden flex-1">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Product ranking ──────────────────────────────────────────────────────────

function ProductRanking({
  products, totalRevenue, catFilter, onCatFilter,
  allCategories,
}: {
  products:     ProductStat[];
  totalRevenue: number;
  catFilter:    string | null;
  onCatFilter:  (c: string | null) => void;
  allCategories: string[];
}) {
  const visible = catFilter ? products.filter(p => p.category === catFilter) : products;
  const maxRevenue = visible.length > 0 ? visible[0].totalRevenue : 0;

  return (
    <div className="space-y-2.5">
      {/* Category chips */}
      {allCategories.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onCatFilter(null)}
            className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors',
              !catFilter
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/40',
            )}
          >
            Todos
          </button>
          {allCategories.map(cat => {
            const info = PRODUCT_CATEGORIES[cat as keyof typeof PRODUCT_CATEGORIES];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCatFilter(catFilter === cat ? null : cat)}
                title={info?.label ?? cat}
                className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1',
                  catFilter === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                <span>{info?.emoji ?? '📦'}</span>
                <span className="hidden sm:inline">{info?.label ?? cat}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground gap-1.5">
          <PackageSearch size={24} className="opacity-30" />
          <p className="text-xs">Sin productos en esta categoría</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p, i) => {
            const cat = PRODUCT_CATEGORIES[p.category as keyof typeof PRODUCT_CATEGORIES];
            const pct = totalRevenue > 0 ? Math.round((p.totalRevenue / totalRevenue) * 100) : 0;
            return (
              <div key={p.productId} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground/40 w-3 shrink-0 tabular-nums">{i + 1}</span>
                <span className="text-sm shrink-0">{cat?.emoji ?? '📦'}</span>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate flex-1">{p.name}</p>
                    <span className="text-xs font-bold tabular-nums shrink-0">{fmt(p.totalRevenue)}</span>
                    <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{pct}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RankBar value={p.totalRevenue} max={maxRevenue} />
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {p.totalQty} {p.unit}
                      {p.margin !== undefined && (
                        <span className={cn(
                          'ml-1 font-medium',
                          p.margin < 20 ? 'text-amber-500' : 'text-green-500',
                        )}>
                          {p.margin.toFixed(0)}%m
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Service ranking ──────────────────────────────────────────────────────────

function ServiceRanking({ services, totalRevenue }: { services: ServiceStat[]; totalRevenue: number }) {
  const maxRevenue = services.length > 0 ? services[0].totalRevenue : 0;

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground gap-1.5">
        <Stethoscope size={24} className="opacity-30" />
        <p className="text-xs">Sin servicios vendidos</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {services.map((s, i) => {
        const cat = SERVICE_CATEGORIES[s.category as keyof typeof SERVICE_CATEGORIES];
        const pct = totalRevenue > 0 ? Math.round((s.totalRevenue / totalRevenue) * 100) : 0;
        return (
          <div key={s.serviceId} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground/40 w-3 shrink-0 tabular-nums">{i + 1}</span>
            <span className="text-sm shrink-0">{cat?.emoji ?? '🩺'}</span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium truncate flex-1">{s.name}</p>
                <span className="text-xs font-bold tabular-nums shrink-0">{fmt(s.totalRevenue)}</span>
                <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{pct}%</span>
              </div>
              <div className="flex items-center gap-2">
                <RankBar value={s.totalRevenue} max={maxRevenue} />
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {s.totalCount} aplic.
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Insight pill (horizontal scroll) ────────────────────────────────────────

const INSIGHT_STYLES: Record<AnalyticsInsight['type'], string> = {
  success: 'border-green-200 bg-green-50 dark:bg-green-900/15 dark:border-green-800/40',
  warning: 'border-amber-200 bg-amber-50 dark:bg-amber-900/15 dark:border-amber-800/40',
  info:    'border-blue-200 bg-blue-50 dark:bg-blue-900/15 dark:border-blue-800/40',
  tip:     'border-primary/20 bg-primary/5',
};

function InsightPill({ insight }: { insight: AnalyticsInsight }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(v => !v)}
      className={cn(
        'text-left rounded-xl border p-3 flex gap-2.5 w-64 shrink-0 snap-start transition-all',
        INSIGHT_STYLES[insight.type],
        open && 'w-80',
      )}
    >
      <span className="text-lg shrink-0 leading-none mt-0.5">{insight.icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-snug">{insight.title}</p>
        {open && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
        )}
        {!open && (
          <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">Toca para ver más</p>
        )}
      </div>
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinancesAnalytics() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [period,    setPeriod]    = useState<AnalyticsPeriod>('week');
  const [refDate,   setRefDate]   = useState(today);
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const { analytics, loading } = useFinancialAnalytics(period, refDate);

  function navigate(dir: -1 | 1) {
    const date = parseISO(refDate);
    let next: Date;
    if      (period === 'day')   next = dir > 0 ? addDays(date, 1)   : subDays(date, 1);
    else if (period === 'week')  next = dir > 0 ? addWeeks(date, 1)  : subWeeks(date, 1);
    else if (period === 'month') next = dir > 0 ? addMonths(date, 1) : subMonths(date, 1);
    else                         next = dir > 0 ? addYears(date, 1)  : subYears(date, 1);
    setRefDate(format(next, 'yyyy-MM-dd'));
  }

  const canGoForward = (() => {
    const date = parseISO(refDate);
    const now  = new Date();
    if (period === 'day')   return addDays(date, 1) <= now;
    if (period === 'week')  return addWeeks(date, 1) <= now;
    if (period === 'month') return addMonths(date, 1) <= now;
    return addYears(date, 1) <= now;
  })();

  function changePeriod(p: AnalyticsPeriod) {
    setPeriod(p);
    setRefDate(today);
    setCatFilter(null);
  }

  const growth        = analytics?.growthPct ?? 0;
  const allCategories = Array.from(new Set((analytics?.topProducts ?? []).map(p => p.category)));

  return (
    <div className="space-y-4">

      {/* ── Period nav ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1 py-1 shrink-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-semibold px-2 min-w-[110px] text-center capitalize">
            {loading ? '…' : analytics?.periodLabel ?? getPeriodLabel(refDate, period)}
          </span>
          <button
            type="button"
            onClick={() => navigate(1)}
            disabled={!canGoForward}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex rounded-xl border border-border overflow-hidden text-xs font-medium ml-auto">
          {PERIOD_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => changePeriod(tab.value)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                period === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Revenue card + embedded chart ────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border px-4 py-3">
        {loading ? (
          <div className="flex items-end gap-3">
            <div className="shrink-0 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="flex-1 h-14" />
          </div>
        ) : (
          <div className="flex items-end gap-3">
            {/* KPI */}
            <div className="shrink-0 space-y-0.5">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground font-medium">Ingresos</p>
                <GrowthBadge pct={growth} prevRevenue={analytics?.prevRevenue ?? 0} />
              </div>
              <p className="text-2xl font-bold tabular-nums text-primary leading-tight">
                {fmt(analytics?.totalRevenue ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {analytics?.transactionCount ?? 0} venta{(analytics?.transactionCount ?? 0) !== 1 ? 's' : ''}
              </p>
              {(analytics?.avgPerSale ?? 0) > 0 && (
                <p className="text-xs font-medium">Ticket {fmt(analytics!.avgPerSale)}</p>
              )}
              {(analytics?.prevRevenue ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground">Ant. {fmt(analytics!.prevRevenue)}</p>
              )}
            </div>

            {/* Sparkline — takes remaining space */}
            {period !== 'day' && (analytics?.timeSeries.length ?? 0) > 1 && (
              <div className="flex-1 min-w-0">
                <Sparkline data={analytics!.timeSeries} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Products + Services ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Products */}
        <div className="bg-card rounded-2xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-3">
            <ShoppingBag size={13} className="text-primary shrink-0" />
            <p className="text-sm font-semibold">Productos</p>
          </div>
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2"><Skeleton className="h-3 w-3" /><Skeleton className="h-3 flex-1" /><Skeleton className="h-3 w-12" /></div>
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <ProductRanking
              products={analytics?.topProducts ?? []}
              totalRevenue={analytics?.totalRevenue ?? 0}
              catFilter={catFilter}
              onCatFilter={setCatFilter}
              allCategories={allCategories}
            />
          )}
        </div>

        {/* Services */}
        <div className="bg-card rounded-2xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-3">
            <Stethoscope size={13} className="text-primary shrink-0" />
            <p className="text-sm font-semibold">Servicios</p>
          </div>
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2"><Skeleton className="h-3 w-3" /><Skeleton className="h-3 flex-1" /><Skeleton className="h-3 w-12" /></div>
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <ServiceRanking
              services={analytics?.topServices ?? []}
              totalRevenue={analytics?.totalRevenue ?? 0}
            />
          )}
        </div>
      </div>

      {/* ── Insights — horizontal scroll ──────────────────────────────── */}
      {(!loading && (analytics?.insights.length ?? 0) > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Lightbulb size={13} className="text-primary" />
            <p className="text-sm font-semibold">Análisis y recomendaciones</p>
            <span className="text-[10px] text-muted-foreground ml-auto">Toca cada tarjeta para expandir</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 snap-x" style={{ scrollbarWidth: 'none' }}>
            {analytics!.insights.map((insight, i) => (
              <InsightPill key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-64 shrink-0" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

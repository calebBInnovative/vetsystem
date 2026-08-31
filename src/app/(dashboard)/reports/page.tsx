'use client';

import { useState, useMemo } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter } from 'date-fns';
import { useReportData } from '@/hooks/useReports';
import { openPdfReport, printPdfReport } from '@/lib/reports/exportPdf';
import { downloadCsv } from '@/lib/reports/exportCsv';
import { RevenueChart } from '@/components/finances/RevenueChart';
import { PRODUCT_CATEGORIES } from '@/types/inventory';
import { SERVICE_CATEGORIES } from '@/types/service';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  FileText, Printer, Sheet, ShoppingBag, Stethoscope, CreditCard, ListCollapse,
  CalendarDays, ChevronDown, ChevronUp, Wallet,
} from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@/types/expense';
import { PendingExpensesAlert } from '@/components/finances/PendingExpensesAlert';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);

const TODAY    = format(new Date(), 'yyyy-MM-dd');
const thisYear = new Date().getFullYear();

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Hoy',             from: () => TODAY,                                                      to: () => TODAY },
  { label: 'Esta semana',     from: () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),  to: () => format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') },
  { label: 'Últ. 7 días',    from: () => format(subDays(new Date(), 6), 'yyyy-MM-dd'),               to: () => TODAY },
  { label: 'Últ. 14 días',   from: () => format(subDays(new Date(), 13), 'yyyy-MM-dd'),              to: () => TODAY },
  { label: 'Este mes',        from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'),             to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'Mes pasado',      from: () => format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: () => format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
  { label: 'Este trimestre',  from: () => format(startOfQuarter(new Date()), 'yyyy-MM-dd'),          to: () => format(endOfQuarter(new Date()), 'yyyy-MM-dd') },
  { label: `Año ${thisYear}`, from: () => format(startOfYear(new Date()), 'yyyy-MM-dd'),             to: () => format(endOfYear(new Date()), 'yyyy-MM-dd') },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />;
}

function KpiCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-card rounded-2xl border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-0.5', positive === true ? 'text-green-600 dark:text-green-400' : positive === false ? 'text-red-600 dark:text-red-400' : '')}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function RankBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden flex-1">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary">{icon}</span>
      <p className="text-sm font-semibold">{title}</p>
      {count !== undefined && (
        <span className="ml-auto text-xs text-muted-foreground">{count} registros</span>
      )}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleSection({ title, icon, defaultOpen = true, children }: {
  title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="text-primary">{icon}</span>
        <p className="text-sm font-semibold flex-1 text-left">{title}</p>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { session } = useAuth();

  // Date range state
  const [preset,    setPreset]    = useState(4);   // "Este mes" default
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [useCustom,  setUseCustom]  = useState(false);

  const from = useCustom && customFrom ? customFrom : PRESETS[preset].from();
  const to   = useCustom && customTo   ? customTo   : PRESETS[preset].to();

  const { report, loading } = useReportData(from, to);

  // Category filter for products table
  const [productCatFilter, setProductCatFilter] = useState<string | null>(null);
  // Payment detail: show/hide
  const [showAllPayments, setShowAllPayments] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    return productCatFilter
      ? report.productStats.filter(p => p.category === productCatFilter)
      : report.productStats;
  }, [report, productCatFilter]);

  const productCategories = useMemo(() =>
    Array.from(new Set((report?.productStats ?? []).map(p => p.category))),
    [report],
  );

  const shownPayments = showAllPayments
    ? (report?.paymentRows ?? [])
    : (report?.paymentRows ?? []).slice(0, 15);

  const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', check: 'Cheque', mixed: 'Mixto', other: 'Otro',
  };
  const INCOME_TYPE_LABELS: Record<string, string> = {
    consultation: 'Consulta', vaccination: 'Vacuna', surgery: 'Cirugía', product: 'Producto', grooming: 'Estética', other: 'Otro',
  };
  const EXPENSE_CAT_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => [k, v])
  );

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Análisis detallado y exportación de datos
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={loading || !report}
            onClick={() => report && downloadCsv(report)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sheet size={14} />
            Excel / CSV
          </button>
          <button
            type="button"
            disabled={loading || !report}
            onClick={() => report && printPdfReport(report, session?.clinicName)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer size={14} />
            Imprimir
          </button>
          <button
            type="button"
            disabled={loading || !report}
            onClick={() => report && openPdfReport(report, session?.clinicName)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText size={14} />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* ── Period selector ────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-3.5 space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarDays size={13} className="text-primary" />
          <p className="text-sm font-semibold">Período del reporte</p>
        </div>

        {/* Preset chips */}
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setPreset(i); setUseCustom(false); }}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors',
                !useCustom && preset === i
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setUseCustom(true); if (!customFrom) setCustomFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd')); if (!customTo) setCustomTo(TODAY); }}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors',
              useCustom
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/40',
            )}
          >
            Personalizado
          </button>
        </div>

        {/* Custom date inputs */}
        {useCustom && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground font-medium w-12">Desde</label>
              <input
                type="date"
                value={customFrom}
                max={customTo || TODAY}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground font-medium w-12">Hasta</label>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={TODAY}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Active range display */}
        <p className="text-xs text-muted-foreground">
          Mostrando datos del <strong>{from}</strong> al <strong>{to}</strong>
        </p>
      </div>

      {/* ── Pending expenses alert ────────────────────────────────── */}
      <PendingExpensesAlert />

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : report ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Ingresos" value={fmtCurrency(report.totalRevenue)} positive={report.totalRevenue > 0} />
          <KpiCard label="Ventas" value={String(report.totalSalesCount)} sub="transacciones" />
          <KpiCard label="Ticket prom." value={fmtCurrency(report.avgTicket)} />
          <KpiCard label="Egresos" value={fmtCurrency(report.totalExpenses)} sub="período" />
          <KpiCard label="Colaboradores" value={fmtCurrency(report.totalCollaborators)} />
          <KpiCard
            label="Balance neto"
            value={fmtCurrency(report.netBalance)}
            positive={report.netBalance > 0}
            sub={report.netBalance >= 0 ? 'superávit' : 'déficit'}
          />
        </div>
      ) : null}

      {/* ── Revenue trend chart ────────────────────────────────────── */}
      {!loading && report && report.timeSeries.length > 1 && (
        <div className="bg-card rounded-2xl border border-border px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Tendencia de ingresos</p>
            <p className="text-xs text-muted-foreground">
              {report.timeSeries.filter(d => d.revenue > 0).length} días con ventas
            </p>
          </div>
          <div className="text-primary">
            <RevenueChart
              data={report.timeSeries}
              period={report.timeSeries.length <= 7 ? 'week' : report.timeSeries.length <= 93 ? 'month' : 'year'}
              height={80}
            />
          </div>
        </div>
      )}

      {/* ── Method + Type breakdown ────────────────────────────────── */}
      {!loading && report && (Object.keys(report.byMethod).length > 0 || Object.keys(report.byType).length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* By method */}
          <div className="bg-card rounded-2xl border border-border p-3.5">
            <SectionHeader icon={<CreditCard size={13} />} title="Por método de pago" />
            {Object.entries(report.byMethod).sort(([,a],[,b]) => b-a).map(([method, amount]) => {
              const pct = report.totalRevenue > 0 ? (amount / report.totalRevenue) * 100 : 0;
              return (
                <div key={method} className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-muted-foreground w-20 shrink-0">{METHOD_LABELS[method] ?? method}</p>
                  <RankBar value={amount} max={report.totalRevenue} />
                  <p className="text-xs font-bold tabular-nums w-20 text-right shrink-0">{fmtCurrency(amount)}</p>
                  <p className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>

          {/* By type */}
          <div className="bg-card rounded-2xl border border-border p-3.5">
            <SectionHeader icon={<ListCollapse size={13} />} title="Por tipo de ingreso" />
            {Object.entries(report.byType).sort(([,a],[,b]) => b-a).map(([type, amount]) => {
              const pct = report.totalRevenue > 0 ? (amount / report.totalRevenue) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-muted-foreground w-20 shrink-0">{INCOME_TYPE_LABELS[type] ?? type}</p>
                  <RankBar value={amount} max={report.totalRevenue} />
                  <p className="text-xs font-bold tabular-nums w-20 text-right shrink-0">{fmtCurrency(amount)}</p>
                  <p className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Egresos ─────────────────────────────────────────────────── */}
      {!loading && report && (report.totalExpenses + report.totalCollaborators) > 0 && (
        <CollapsibleSection
          title={`Egresos — ${fmtCurrency(report.totalExpenses + report.totalCollaborators)}`}
          icon={<Wallet size={13} />}
        >
          <div className="space-y-4">

            {/* Category bars */}
            {Object.keys(report.byExpenseCategory).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Por categoría</p>
                {Object.entries(report.byExpenseCategory).sort(([,a],[,b]) => b-a).map(([cat, amount]) => {
                  const pct = report.totalExpenses > 0 ? (amount / report.totalExpenses) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2 mb-2">
                      <p className="text-xs text-muted-foreground w-28 shrink-0">
                        {EXPENSE_CAT_LABELS[cat] ?? cat}
                      </p>
                      <RankBar value={amount} max={report.totalExpenses} color="bg-red-400" />
                      <p className="text-xs font-bold tabular-nums w-20 text-right shrink-0">{fmtCurrency(amount)}</p>
                      <p className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct.toFixed(0)}%</p>
                    </div>
                  );
                })}
                {report.totalCollaborators > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-muted-foreground w-28 shrink-0">👥 Colaboradores</p>
                    <RankBar value={report.totalCollaborators} max={report.totalExpenses + report.totalCollaborators} color="bg-orange-400" />
                    <p className="text-xs font-bold tabular-nums w-20 text-right shrink-0">{fmtCurrency(report.totalCollaborators)}</p>
                    <p className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
                      {((report.totalCollaborators / (report.totalExpenses + report.totalCollaborators)) * 100).toFixed(0)}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Expense rows table */}
            {report.expenseRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Egresos pagados ({report.expenseRows.length})
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Gasto</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Categoría</th>
                        <th className="py-2 px-3 text-right font-medium text-muted-foreground">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.expenseRows.map((row) => (
                        <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="py-2 px-3 text-muted-foreground tabular-nums">{row.date}</td>
                          <td className="py-2 px-3 font-medium max-w-[160px] truncate">{row.name}</td>
                          <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                            {EXPENSE_CAT_LABELS[row.category] ?? row.category}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-red-500 tabular-nums">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/20 font-bold">
                        <td colSpan={3} className="py-2 px-3">Total gastos fijos</td>
                        <td className="py-2 px-3 text-right text-red-500 tabular-nums">{fmtCurrency(report.totalExpenses)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Collaborator rows table */}
            {report.collaboratorRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Pagos a colaboradores ({report.collaboratorRows.length})
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Colaborador</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Cargo</th>
                        <th className="py-2 px-3 text-right font-medium text-muted-foreground">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.collaboratorRows.map((row) => (
                        <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="py-2 px-3 text-muted-foreground tabular-nums">{row.date}</td>
                          <td className="py-2 px-3 font-medium">{row.name}</td>
                          <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">{row.role}</td>
                          <td className="py-2 px-3 text-right font-bold text-orange-500 tabular-nums">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/20 font-bold">
                        <td colSpan={3} className="py-2 px-3">Total colaboradores</td>
                        <td className="py-2 px-3 text-right text-orange-500 tabular-nums">{fmtCurrency(report.totalCollaborators)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Products ───────────────────────────────────────────────── */}
      <CollapsibleSection title={`Productos vendidos (${report?.productStats.length ?? 0})`} icon={<ShoppingBag size={13} />}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (report?.productStats.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin ventas de productos en este período.</p>
        ) : (
          <>
            {/* Category chips */}
            {productCategories.length > 1 && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                <button
                  type="button"
                  onClick={() => setProductCatFilter(null)}
                  className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors', !productCatFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40')}
                >Todos</button>
                {productCategories.map(cat => {
                  const info = PRODUCT_CATEGORIES[cat as keyof typeof PRODUCT_CATEGORIES];
                  return (
                    <button key={cat} type="button" onClick={() => setProductCatFilter(productCatFilter === cat ? null : cat)}
                      className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1', productCatFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
                      <span>{info?.emoji ?? '📦'}</span><span className="hidden sm:inline">{info?.label ?? cat}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium w-6">#</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">Producto</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden sm:table-cell">Categoría</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium">Unid.</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium hidden md:table-cell">Ventas</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium">Ingresos</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium hidden sm:table-cell">%</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium hidden lg:table-cell">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => {
                    const cat = PRODUCT_CATEGORIES[p.category as keyof typeof PRODUCT_CATEGORIES];
                    const pct = report!.totalRevenue > 0 ? ((p.totalRevenue / report!.totalRevenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={p.productId} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 px-1 text-muted-foreground/50 font-bold">{i + 1}</td>
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-1.5">
                            <span>{cat?.emoji ?? '📦'}</span>
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-1 text-muted-foreground hidden sm:table-cell">{cat?.label ?? p.category}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{p.totalQty} {p.unit}</td>
                        <td className="py-2 px-1 text-right hidden md:table-cell">{p.salesCount}</td>
                        <td className="py-2 px-1 text-right font-bold tabular-nums">{fmtCurrency(p.totalRevenue)}</td>
                        <td className="py-2 px-1 text-right text-muted-foreground hidden sm:table-cell">{pct}%</td>
                        <td className="py-2 px-1 text-right hidden lg:table-cell">
                          {p.margin != null ? (
                            <span className={p.margin < 20 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                              {p.margin.toFixed(0)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* ── Services ───────────────────────────────────────────────── */}
      <CollapsibleSection title={`Servicios vendidos (${report?.serviceStats.length ?? 0})`} icon={<Stethoscope size={13} />}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (report?.serviceStats.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin servicios vendidos en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-1 text-muted-foreground font-medium w-6">#</th>
                  <th className="text-left py-2 px-1 text-muted-foreground font-medium">Servicio</th>
                  <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden sm:table-cell">Categoría</th>
                  <th className="text-right py-2 px-1 text-muted-foreground font-medium">Aplic.</th>
                  <th className="text-right py-2 px-1 text-muted-foreground font-medium">Ingresos</th>
                  <th className="text-right py-2 px-1 text-muted-foreground font-medium hidden sm:table-cell">%</th>
                </tr>
              </thead>
              <tbody>
                {report!.serviceStats.map((s, i) => {
                  const cat = SERVICE_CATEGORIES[s.category as keyof typeof SERVICE_CATEGORIES];
                  const pct = report!.totalRevenue > 0 ? ((s.totalRevenue / report!.totalRevenue) * 100).toFixed(1) : '0';
                  return (
                    <tr key={s.serviceId} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 px-1 text-muted-foreground/50 font-bold">{i + 1}</td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1.5">
                          <span>{cat?.emoji ?? '🩺'}</span>
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-muted-foreground hidden sm:table-cell">{cat?.label ?? s.category}</td>
                      <td className="py-2 px-1 text-right">{s.totalCount}</td>
                      <td className="py-2 px-1 text-right font-bold tabular-nums">{fmtCurrency(s.totalRevenue)}</td>
                      <td className="py-2 px-1 text-right text-muted-foreground hidden sm:table-cell">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Payment detail ─────────────────────────────────────────── */}
      <CollapsibleSection title={`Detalle de pagos (${report?.paymentRows.length ?? 0})`} icon={<CreditCard size={13} />} defaultOpen={false}>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (report?.paymentRows.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin pagos registrados en este período.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">Fecha</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">Concepto</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden sm:table-cell">Paciente</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden md:table-cell">Tipo</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden lg:table-cell">Método</th>
                    <th className="text-right py-2 px-1 text-muted-foreground font-medium">Monto</th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium hidden md:table-cell">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shownPayments.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 px-1 text-muted-foreground">{p.date}</td>
                      <td className="py-2 px-1 max-w-[180px] truncate font-medium">{p.concept}</td>
                      <td className="py-2 px-1 text-muted-foreground hidden sm:table-cell">{p.patientName}</td>
                      <td className="py-2 px-1 text-muted-foreground hidden md:table-cell">{p.type}</td>
                      <td className="py-2 px-1 text-muted-foreground hidden lg:table-cell">{p.method}</td>
                      <td className="py-2 px-1 text-right font-bold tabular-nums">{fmtCurrency(p.amount)}</td>
                      <td className="py-2 px-1 hidden md:table-cell">
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          p.status === 'Pagado' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          p.status === 'Pendiente' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-muted text-muted-foreground',
                        )}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(report?.paymentRows.length ?? 0) > 15 && (
              <button
                type="button"
                onClick={() => setShowAllPayments(v => !v)}
                className="mt-3 text-xs text-primary hover:underline"
              >
                {showAllPayments
                  ? 'Mostrar menos'
                  : `Ver todos (${report!.paymentRows.length}) →`}
              </button>
            )}
          </>
        )}
      </CollapsibleSection>

    </div>
  );
}

'use client';

import { useFinancialSummary } from '@/hooks/useFinances';
import { PAYMENT_METHODS, INCOME_TYPES } from '@/types/finances';
import { TrendingUp, TrendingDown, Clock, DollarSign, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatMonto(monto: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(monto);
}

export function ResumenIngresos() {
  const { summary, loading } = useFinancialSummary();

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-4">
            <div className="h-4 w-20 bg-muted/60 rounded animate-pulse mb-3" />
            <div className="h-8 w-28 bg-muted/60 rounded animate-pulse mb-1" />
            <div className="h-3 w-16 bg-muted/60 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      label:    'Hoy',
      valor:    summary?.totalHoy ?? 0,
      icon:     DollarSign,
      color:    'text-green-600',
      bg:       'bg-green-500/10',
    },
    {
      label:    'Esta semana',
      valor:    summary?.totalSemana ?? 0,
      icon:     TrendingUp,
      color:    'text-blue-600',
      bg:       'bg-blue-500/10',
    },
    {
      label:    'Este mes',
      valor:    summary?.totalMes ?? 0,
      icon:     TrendingUp,
      color:    'text-primary',
      bg:       'bg-primary/10',
    },
    {
      label:    'Pagos pendientes',
      valor:    summary?.pendientes ?? 0,
      esConteo: true,
      icon:     Clock,
      color:    summary?.pendientes ? 'text-amber-600' : 'text-muted-foreground',
      bg:       summary?.pendientes ? 'bg-amber-500/10' : 'bg-muted/30',
    },
  ];

  const balanceNeto         = summary?.balanceNeto ?? 0;
  const totalMes            = summary?.totalMes ?? 0;
  const totalEgresos        = summary?.totalEgresos ?? 0;
  const totalGastos         = summary?.totalGastos ?? 0;
  const totalColaboradores  = summary?.totalColaboradores ?? 0;
  const balancePositivo     = balanceNeto >= 0;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, valor, icon: Icon, color, bg, esConteo }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', bg)}>
                <Icon className={cn('h-4 w-4', color)} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold', color)}>
              {esConteo ? valor : formatMonto(valor)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Balance neto del mes */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-sm font-medium text-muted-foreground mb-4">Balance del mes actual</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Ingresos */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-500/10 shrink-0 mt-0.5">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="text-xl font-bold text-green-600">{formatMonto(totalMes)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">cobros del mes</p>
            </div>
          </div>

          {/* Egresos */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/10 shrink-0 mt-0.5">
              <Wallet className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Egresos</p>
              <p className="text-xl font-bold text-red-500">{formatMonto(totalEgresos)}</p>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  Gastos fijos: {formatMonto(totalGastos)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  Colaboradores: {formatMonto(totalColaboradores)}
                </div>
              </div>
            </div>
          </div>

          {/* Balance neto */}
          <div className={cn(
            'flex items-start gap-3 rounded-xl p-3 -m-1',
            balancePositivo ? 'bg-green-500/5' : 'bg-red-500/5',
          )}>
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
              balancePositivo ? 'bg-green-500/15' : 'bg-red-500/15',
            )}>
              {balancePositivo
                ? <TrendingUp className="h-4 w-4 text-green-600" />
                : <TrendingDown className="h-4 w-4 text-red-500" />
              }
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance neto</p>
              <p className={cn('text-xl font-bold', balancePositivo ? 'text-green-600' : 'text-red-500')}>
                {formatMonto(balanceNeto)}
              </p>
              <p className={cn('text-xs mt-0.5', balancePositivo ? 'text-green-600/70' : 'text-red-500/70')}>
                {balancePositivo ? 'positivo' : 'déficit este mes'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Desglose: tipos + métodos */}
      {summary && (summary.cantidadMes > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Por tipo de ingreso */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-medium mb-3">Ingresos por tipo</p>
            <div className="space-y-2">
              {Object.entries(summary.porTipo)
                .sort(([, a], [, b]) => b - a)
                .map(([tipo, monto]) => {
                  const info = INCOME_TYPES[tipo as keyof typeof INCOME_TYPES];
                  const pct  = summary.totalMes > 0 ? Math.round((monto / summary.totalMes) * 100) : 0;
                  return (
                    <div key={tipo} className="flex items-center gap-2">
                      <span className="text-base w-5">{info?.emoji ?? '💰'}</span>
                      <span className="text-xs text-muted-foreground flex-1">{info?.label ?? tipo}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium w-16 text-right">{formatMonto(monto)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Por método de pago */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-medium mb-3">Métodos de pago</p>
            <div className="space-y-2">
              {Object.entries(summary.porMetodo)
                .sort(([, a], [, b]) => b - a)
                .map(([metodo, monto]) => {
                  const info = PAYMENT_METHODS[metodo as keyof typeof PAYMENT_METHODS];
                  const pct  = summary.totalMes > 0 ? Math.round((monto / summary.totalMes) * 100) : 0;
                  return (
                    <div key={metodo} className="flex items-center gap-2">
                      <span className="text-base w-5">{info?.emoji ?? '💰'}</span>
                      <span className="text-xs text-muted-foreground flex-1">{info?.label ?? metodo}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium w-16 text-right">{formatMonto(monto)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

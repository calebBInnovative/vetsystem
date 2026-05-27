'use client';

import { useResumenFinanciero } from '@/hooks/useFinanzas';
import { METODOS_PAGO, TIPOS_INGRESO } from '@/types/finanzas';
import { TrendingUp, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatMonto(monto: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(monto);
}

export function ResumenIngresos() {
  const { resumen, cargando } = useResumenFinanciero();

  if (cargando) {
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
      valor:    resumen?.totalHoy ?? 0,
      icon:     DollarSign,
      color:    'text-green-600',
      bg:       'bg-green-500/10',
    },
    {
      label:    'Esta semana',
      valor:    resumen?.totalSemana ?? 0,
      icon:     TrendingUp,
      color:    'text-blue-600',
      bg:       'bg-blue-500/10',
    },
    {
      label:    'Este mes',
      valor:    resumen?.totalMes ?? 0,
      icon:     TrendingUp,
      color:    'text-primary',
      bg:       'bg-primary/10',
    },
    {
      label:    'Pagos pendientes',
      valor:    resumen?.pendientes ?? 0,
      esConteo: true,
      icon:     Clock,
      color:    resumen?.pendientes ? 'text-amber-600' : 'text-muted-foreground',
      bg:       resumen?.pendientes ? 'bg-amber-500/10' : 'bg-muted/30',
    },
  ];

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

      {/* Desglose: tipos + métodos */}
      {resumen && (resumen.cantidadMes > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Por tipo de ingreso */}
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-medium mb-3">Ingresos por tipo</p>
            <div className="space-y-2">
              {Object.entries(resumen.porTipo)
                .sort(([, a], [, b]) => b - a)
                .map(([tipo, monto]) => {
                  const info = TIPOS_INGRESO[tipo as keyof typeof TIPOS_INGRESO];
                  const pct  = resumen.totalMes > 0 ? Math.round((monto / resumen.totalMes) * 100) : 0;
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
              {Object.entries(resumen.porMetodo)
                .sort(([, a], [, b]) => b - a)
                .map(([metodo, monto]) => {
                  const info = METODOS_PAGO[metodo as keyof typeof METODOS_PAGO];
                  const pct  = resumen.totalMes > 0 ? Math.round((monto / resumen.totalMes) * 100) : 0;
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

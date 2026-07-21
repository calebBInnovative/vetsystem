'use client';

import Link from 'next/link';
import { useStockAlerts } from '@/hooks/useInventory';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AlertasStock() {
  const { alerts, loading } = useStockAlerts();

  if (loading || alerts.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-2.5 flex items-center gap-3">
      {/* Icono + conteo — no se encoge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
          {alerts.length} con stock bajo
        </span>
      </div>

      {/* Separador */}
      <div className="w-px h-4 bg-amber-200 dark:bg-amber-700 shrink-0" />

      {/* Chips scrollables */}
      <div className="flex gap-2 overflow-x-auto flex-nowrap scrollbar-none min-w-0">
        {alerts.map((p) => {
          const cat      = PRODUCT_CATEGORIES[p.category];
          const unidad   = MEASUREMENT_UNITS[p.unit];
          const sinStock = p.currentStock === 0;

          return (
            <Link
              key={p.id}
              href={`/inventory/${p.id}`}
              className="flex items-center gap-1.5 shrink-0 bg-white/70 dark:bg-black/20 hover:bg-white dark:hover:bg-black/30 border border-amber-200/60 dark:border-amber-700/40 rounded-lg px-2.5 py-1 transition-colors"
            >
              <span className="text-sm leading-none">{cat.emoji}</span>
              <span className="text-xs font-medium text-foreground whitespace-nowrap max-w-[120px] truncate">
                {p.name}
              </span>
              <span className={cn(
                'text-xs font-bold whitespace-nowrap',
                sinStock ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
              )}>
                {sinStock ? '0' : p.currentStock} {unidad}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

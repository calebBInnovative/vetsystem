'use client';

import { useState } from 'react';
import { Wallet, TrendingUp, Tag, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useInventoryValuation } from '@/hooks/useInventory';
import { PRODUCT_CATEGORIES } from '@/types/inventory';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: 'NIO', maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Capital tied up in stock. Lives in Inventory on purpose: stock is an asset,
 * not income or expense of the period, so showing it beside the monthly
 * finance totals would invite adding up numbers that do not add up.
 */
export function InventoryValuation() {
  const { valuation, loading } = useInventoryValuation();
  const [showMissing, setShowMissing] = useState(false);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted/40 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!valuation || valuation.productCount === 0) return null;

  const { totalCost, totalSale, potentialProfit, marginPct, missingCost } = valuation;

  const cards = [
    {
      label: 'Capital invertido',
      value: fmt(totalCost),
      hint:  'Costo del stock actual',
      icon:  Wallet,
      color: 'text-primary',
      bg:    'bg-primary/10',
    },
    {
      label: 'Valor de venta',
      value: fmt(totalSale),
      hint:  'Si se vende todo el stock',
      icon:  Tag,
      color: 'text-blue-600',
      bg:    'bg-blue-500/10',
    },
    {
      label: 'Ganancia potencial',
      value: fmt(potentialProfit),
      hint:  marginPct !== null ? `Margen ${marginPct.toFixed(0)}%` : 'Sin precios cargados',
      icon:  TrendingUp,
      color: potentialProfit >= 0 ? 'text-green-600' : 'text-destructive',
      bg:    potentialProfit >= 0 ? 'bg-green-500/10' : 'bg-destructive/10',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-card rounded-2xl border border-border p-4">
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center mb-3', c.bg)}>
              <c.icon size={16} className={c.color} />
            </div>
            <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{c.hint}</p>
          </div>
        ))}

        {/* Coverage card: a precise-looking total that silently omits products
            without a cost price is worse than one that says what it is missing. */}
        <div className={cn(
          'rounded-2xl border p-4',
          missingCost.length > 0
            ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
            : 'bg-card border-border',
        )}>
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center mb-3',
            missingCost.length > 0 ? 'bg-amber-500/15' : 'bg-muted/40',
          )}>
            <AlertCircle size={16} className={missingCost.length > 0 ? 'text-amber-600' : 'text-muted-foreground'} />
          </div>
          <p className={cn('text-2xl font-bold', missingCost.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {missingCost.length}
          </p>
          <p className="text-xs text-muted-foreground">Productos sin costo</p>
          {missingCost.length > 0 ? (
            <button
              onClick={() => setShowMissing((v) => !v)}
              className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline mt-0.5 flex items-center gap-0.5"
            >
              El capital real es mayor
              {showMissing ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">Valuación completa</p>
          )}
        </div>
      </div>

      {showMissing && missingCost.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <p className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border">
            Con stock pero sin precio de costo — no suman al capital invertido
          </p>
          <div className="max-h-56 overflow-y-auto divide-y divide-border">
            {missingCost.map((p) => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {PRODUCT_CATEGORIES[p.category]?.label ?? p.category} · {p.currentStock} u.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { type ProductLocal, PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { cn } from '@/lib/utils';
import { AlertTriangle, Package, Trash2 } from 'lucide-react';
import { isPast, parseISO } from 'date-fns';

interface ProductoRowProps {
  producto:  ProductLocal;
  onDelete?: () => void;
}

export function ProductoRow({ producto, onDelete }: ProductoRowProps) {
  const cat      = PRODUCT_CATEGORIES[producto.category];
  const unidad   = MEASUREMENT_UNITS[producto.unit];
  const sinStock = producto.currentStock === 0;
  const stockBajo= producto.currentStock <= producto.minimumStock;
  const vencido  = producto.expirationDate ? isPast(parseISO(producto.expirationDate)) : false;

  return (
    <div className="relative flex items-center group border-b border-border last:border-0">
      <Link
        href={`/inventory/${producto.id}`}
        className="flex flex-1 items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors min-w-0"
      >
        {/* Category emoji */}
        <span className="text-xl shrink-0 w-7 text-center">{cat.emoji}</span>

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
            {producto.name}
          </p>
          <p className="text-xs text-muted-foreground">{cat.label}</p>
        </div>

        {/* Stock bar (desktop) */}
        <div className="hidden sm:flex flex-col items-end gap-1 w-20 shrink-0">
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                sinStock  ? 'bg-red-400'   :
                stockBajo ? 'bg-amber-400' : 'bg-green-500'
              )}
              style={{
                width: `${Math.min(100, producto.minimumStock > 0
                  ? (producto.currentStock / (producto.minimumStock * 3)) * 100
                  : 100
                )}%`,
              }}
            />
          </div>
          <span className={cn(
            'text-xs font-semibold tabular-nums',
            sinStock  ? 'text-red-500'   :
            stockBajo ? 'text-amber-500' : 'text-foreground'
          )}>
            {producto.currentStock} <span className="font-normal text-muted-foreground">{unidad}</span>
          </span>
        </div>

        {/* Stock (mobile) */}
        <span className={cn(
          'sm:hidden text-sm font-semibold tabular-nums shrink-0',
          sinStock  ? 'text-red-500'   :
          stockBajo ? 'text-amber-500' : 'text-muted-foreground'
        )}>
          {producto.currentStock}
        </span>

        {/* Price */}
        {producto.salePrice != null && (
          <span className="text-sm font-semibold shrink-0 hidden md:block">
            C${producto.salePrice.toFixed(0)}
          </span>
        )}

        {/* Alerts */}
        {(sinStock || stockBajo || vencido) && (
          <span className="shrink-0" title={
            sinStock ? 'Sin stock' : stockBajo ? 'Stock bajo' : 'Producto vencido'
          }>
            {sinStock
              ? <Package size={14} className="text-red-500" />
              : <AlertTriangle size={14} className="text-amber-500" />
            }
          </span>
        )}
      </Link>

      {/* Delete button — only shown when onDelete is provided */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar producto"
          className="shrink-0 mr-3 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { type ProductoLocal, CATEGORIAS_PRODUCTO, UNIDADES_MEDIDA } from '@/types/inventario';
import { cn } from '@/lib/utils';
import { AlertTriangle, Package } from 'lucide-react';
import { isPast, parseISO } from 'date-fns';

interface ProductoRowProps {
  producto: ProductoLocal;
}

export function ProductoRow({ producto }: ProductoRowProps) {
  const cat      = CATEGORIAS_PRODUCTO[producto.categoria];
  const unidad   = UNIDADES_MEDIDA[producto.unidad];
  const sinStock = producto.stockActual === 0;
  const stockBajo= producto.stockActual <= producto.stockMinimo;
  const vencido  = producto.fechaVencimiento ? isPast(parseISO(producto.fechaVencimiento)) : false;

  return (
    <Link
      href={`/inventario/${producto.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group border-b border-border last:border-0"
    >
      {/* Emoji categoría */}
      <span className="text-xl shrink-0 w-7 text-center">{cat.emoji}</span>

      {/* Nombre + categoría */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {producto.nombre}
        </p>
        <p className="text-xs text-muted-foreground">{cat.label}</p>
      </div>

      {/* Barra de stock mini */}
      <div className="hidden sm:flex flex-col items-end gap-1 w-20 shrink-0">
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              sinStock  ? 'bg-red-400'   :
              stockBajo ? 'bg-amber-400' : 'bg-green-500'
            )}
            style={{
              width: `${Math.min(100, producto.stockMinimo > 0
                ? (producto.stockActual / (producto.stockMinimo * 3)) * 100
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
          {producto.stockActual} <span className="font-normal text-muted-foreground">{unidad}</span>
        </span>
      </div>

      {/* Stock en móvil (solo número) */}
      <span className={cn(
        'sm:hidden text-sm font-semibold tabular-nums shrink-0',
        sinStock  ? 'text-red-500'   :
        stockBajo ? 'text-amber-500' : 'text-muted-foreground'
      )}>
        {producto.stockActual}
      </span>

      {/* Precio */}
      {producto.precioVenta != null && (
        <span className="text-sm font-semibold shrink-0 hidden md:block">
          C${producto.precioVenta.toFixed(0)}
        </span>
      )}

      {/* Alertas */}
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
  );
}

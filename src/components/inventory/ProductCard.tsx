'use client';

import Link from 'next/link';
import { type ProductLocal, PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, Package } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProductoCardProps {
  producto: ProductLocal;
}

export function ProductoCard({ producto }: ProductoCardProps) {
  const categoria      = PRODUCT_CATEGORIES[producto.categoria];
  const unidad         = MEASUREMENT_UNITS[producto.unidad];
  const stockBajo      = producto.stockActual <= producto.stockMinimo;
  const sinStock       = producto.stockActual === 0;
  const vencido        = producto.fechaVencimiento ? isPast(parseISO(producto.fechaVencimiento)) : false;
  const tieneProblema  = stockBajo || vencido;

  return (
    <Link href={`/inventory/${producto.id}`} className="block group">
      <div className={cn(
        'bg-card rounded-2xl border p-4 transition-all duration-200',
        'hover:shadow-md hover:border-primary/30',
        tieneProblema ? 'border-amber-200 dark:border-amber-800' : 'border-border'
      )}>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0',
            'group-hover:scale-105 transition-transform',
            categoria.color.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('dark:bg')).join(' ') || 'bg-muted'
          )}>
            {categoria.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold truncate group-hover:text-primary transition-colors leading-tight">
                {producto.nombre}
              </h3>
              {tieneProblema && (
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="secondary" className={cn('text-xs', categoria.color)}>
                {categoria.label}
              </Badge>
              {producto.proveedor && (
                <span className="text-xs text-muted-foreground truncate">· {producto.proveedor}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Stock actual</p>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                'text-2xl font-bold',
                sinStock    ? 'text-red-500'   :
                stockBajo   ? 'text-amber-500' :
                              'text-foreground'
              )}>
                {producto.stockActual}
              </span>
              <span className="text-sm text-muted-foreground">{unidad}</span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Mínimo</p>
            <p className="text-sm font-medium">{producto.stockMinimo} {unidad}</p>
          </div>

          {producto.precioVenta && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">Precio</p>
              <p className="text-sm font-semibold">${producto.precioVenta.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Barra de stock */}
        <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              sinStock  ? 'bg-red-400'   :
              stockBajo ? 'bg-amber-400' :
                          'bg-green-500'
            )}
            style={{
              width: `${Math.min(100, producto.stockMinimo > 0
                ? (producto.stockActual / (producto.stockMinimo * 3)) * 100
                : 100
              )}%`
            }}
          />
        </div>

        {/* Alertas */}
        {(stockBajo || vencido) && (
          <div className="mt-2 space-y-1">
            {sinStock && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                <Package size={11} /> Sin stock
              </p>
            )}
            {!sinStock && stockBajo && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle size={11} /> Stock bajo
              </p>
            )}
            {vencido && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                <AlertTriangle size={11} /> Vencido el {format(parseISO(producto.fechaVencimiento!), "d MMM yyyy", { locale: es })}
              </p>
            )}
          </div>
        )}

      </div>
    </Link>
  );
}

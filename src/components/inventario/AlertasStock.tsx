'use client';

import Link from 'next/link';
import { useAlertasStock } from '@/hooks/useInventario';
import { CATEGORIAS_PRODUCTO, UNIDADES_MEDIDA } from '@/types/inventario';
import { AlertTriangle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AlertasStock() {
  const { alertas, cargando } = useAlertasStock();

  if (cargando || alertas.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          {alertas.length} producto{alertas.length !== 1 ? 's' : ''} con stock bajo
        </h3>
      </div>

      <div className="space-y-2">
        {alertas.map((p) => {
          const cat    = CATEGORIAS_PRODUCTO[p.categoria];
          const unidad = UNIDADES_MEDIDA[p.unidad];
          const sinStock = p.stockActual === 0;

          return (
            <Link
              key={p.id}
              href={`/inventario/${p.id}`}
              className="flex items-center gap-3 bg-white/60 dark:bg-black/20 rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-black/30 transition-colors"
            >
              <span className="text-lg leading-none">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {cat.label}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn(
                  'text-sm font-bold',
                  sinStock ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
                )}>
                  {p.stockActual} {unidad}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sinStock ? (
                    <span className="flex items-center gap-0.5 justify-end text-red-500">
                      <Package size={10} /> Sin stock
                    </span>
                  ) : (
                    `mín. ${p.stockMinimo}`
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

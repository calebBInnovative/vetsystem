'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useProduct, useProductMovements, adjustStock } from '@/hooks/useInventory';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { ajusteStockSchema, type AjusteStockFormData } from '@/lib/validations/inventory.schema';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Minus, AlertTriangle, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ProductDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id }                       = use(params);
  const { producto, loading }        = useProduct(id);
  const { movements }                = useProductMovements(id);
  const [ajustando, setAjustando]    = useState(false);
  const [tipoAjuste, setTipoAjuste]  = useState<'entry' | 'exit'>('entry');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AjusteStockFormData>({
    resolver: zodResolver(ajusteStockSchema),
    defaultValues: { type: 'entry', quantity: 1 },
  });

  const onAjuste = async (datos: AjusteStockFormData) => {
    setAjustando(true);
    try {
      await adjustStock(id, { ...datos, type: tipoAjuste });
      toast.success(tipoAjuste === 'entry' ? 'Stock agregado' : 'Salida registrada');
      reset();
    } catch {
      toast.error('No se pudo ajustar el stock');
    } finally {
      setAjustando(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!producto) {
    return (
      <div className="text-center py-24 space-y-4">
        <p className="text-4xl">📦</p>
        <p className="font-medium">Producto no encontrado</p>
        <Link href="/inventory"><Button variant="outline">Volver al inventario</Button></Link>
      </div>
    );
  }

  const categoria  = PRODUCT_CATEGORIES[producto.category];
  const unidad     = MEASUREMENT_UNITS[producto.unit];
  const stockBajo  = producto.currentStock <= producto.minimumStock;

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="flex items-start gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" className="-ml-2 mt-0.5"><ArrowLeft size={18} /></Button>
        </Link>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0">
          <span>{categoria.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold leading-tight">{producto.name}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {categoria.label}{producto.supplier && ` · ${producto.supplier}`}
              </p>
            </div>
            {stockBajo && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/40 shrink-0">
                <AlertTriangle size={12} className="mr-1" /> Stock bajo
              </Badge>
            )}
          </div>
          {producto.description && (
            <p className="text-sm text-muted-foreground mt-2">{producto.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Stock actual', value: `${producto.currentStock} ${unidad}`, highlight: stockBajo },
          { label: 'Stock mínimo', value: `${producto.minimumStock} ${unidad}`, highlight: false },
          { label: 'Precio venta', value: producto.salePrice ? `$${producto.salePrice.toFixed(2)}` : '—', highlight: false },
          { label: 'Precio costo', value: producto.costPrice ? `$${producto.costPrice.toFixed(2)}` : '—', highlight: false },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn('text-xl font-bold', highlight && 'text-amber-500')}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Ajustar Stock
        </h2>
        <form onSubmit={handleSubmit(onAjuste)} className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipoAjuste('entry')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                tipoAjuste === 'entry'
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  : 'border-border text-muted-foreground hover:border-green-300'
              )}
            >
              <Plus size={16} /> Entrada
            </button>
            <button
              type="button"
              onClick={() => setTipoAjuste('exit')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                tipoAjuste === 'exit'
                  ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                  : 'border-border text-muted-foreground hover:border-red-300'
              )}
            >
              <Minus size={16} /> Salida
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                {...register('quantity')}
                type="number"
                min="1"
                step="1"
                placeholder="Cantidad"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-colors"
              />
              {errors.quantity && <p className="mt-1 text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <input
              {...register('reason')}
              placeholder="Motivo (opcional)"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-colors"
            />
          </div>
          <Button type="submit" className="w-full" disabled={ajustando}>
            {ajustando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Registrar movimiento'}
          </Button>
        </form>
      </div>

      {movements.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Historial de Movimientos
          </h2>
          <div className="space-y-2">
            {movements.slice(0, 20).map((m) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  m.type === 'entry' ? 'bg-green-100 dark:bg-green-950/40' : 'bg-red-100 dark:bg-red-950/40'
                )}>
                  {m.type === 'entry'
                    ? <TrendingUp size={13} className="text-green-600 dark:text-green-400" />
                    : <TrendingDown size={13} className="text-red-500 dark:text-red-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn('font-medium', m.type === 'entry' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                    {m.type === 'entry' ? '+' : '-'}{m.quantity} {unidad}
                  </span>
                  {m.reason && <span className="text-muted-foreground ml-2">· {m.reason}</span>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.createdAt), "d MMM, HH:mm", { locale: es })}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.stockAfter} {unidad}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

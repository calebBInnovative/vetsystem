'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouteId } from '@/hooks/useRouteId';
import { useProduct, useProductMovements, adjustStock, updateProduct } from '@/hooks/useInventory';
import { createOneTimeExpense } from '@/hooks/useExpenses';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { ajusteStockSchema, type AjusteStockFormData } from '@/lib/validations/inventory.schema';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductoForm } from '@/components/inventory/ProductForm';
import {
  ArrowLeft, Pencil, Plus, Minus, AlertTriangle,
  Loader2, TrendingUp, TrendingDown, X, DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function ProductDetailView() {
  const id                           = useRouteId();
  const { producto, loading }        = useProduct(id ?? '');
  const { movements }                = useProductMovements(id ?? '');
  const [ajustando, setAjustando]    = useState(false);
  const [tipoAjuste, setTipoAjuste]  = useState<'entry' | 'exit'>('entry');
  const [editMode,   setEditMode]    = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // Finance impact
  const [affectsFinances, setAffectsFinances] = useState(false);
  const [financeAmount,   setFinanceAmount]   = useState('');

  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<AjusteStockFormData>({
    resolver: zodResolver(ajusteStockSchema),
    defaultValues: { type: 'entry', quantity: 1 },
  });

  function toggleFinances() {
    const next = !affectsFinances;
    setAffectsFinances(next);
    // Pre-fill amount when enabling, based on current quantity × costPrice
    if (next && producto?.costPrice) {
      const qty = Number(getValues('quantity')) || 0;
      if (qty > 0) setFinanceAmount(String(Math.round(qty * producto.costPrice)));
    }
  }

  const onAjuste = async (datos: AjusteStockFormData) => {
    setAjustando(true);
    try {
      await adjustStock(id ?? '', { ...datos, type: tipoAjuste });

      if (affectsFinances) {
        const amount = parseFloat(financeAmount) || 0;
        if (amount > 0) {
          const label = tipoAjuste === 'entry' ? 'Compra' : 'Baja';
          await createOneTimeExpense({
            name:     `${label}: ${producto!.name}`,
            amount,
            category: 'supplies',
            date:     new Date().toISOString().slice(0, 10),
            notes:    datos.reason || undefined,
          });
        }
      }

      toast.success(
        tipoAjuste === 'entry'
          ? `Stock agregado${affectsFinances ? ' · Egreso registrado' : ''}`
          : `Salida registrada${affectsFinances ? ' · Egreso registrado' : ''}`,
      );
      reset();
      setFinanceAmount('');
    } catch {
      toast.error('No se pudo ajustar el stock');
    } finally {
      setAjustando(false);
    }
  };

  if (!id || loading) {
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

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">Editar producto</span>
              <span className="text-muted-foreground hidden sm:inline">— {producto.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditMode(false)} disabled={editLoading}>
                <X size={14} /> Cancelar
              </Button>
              <Button size="sm" disabled={editLoading} form="product-edit-form" type="submit" className="min-w-[130px] gap-1.5">
                {editLoading
                  ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Guardando…</>
                  : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>

        <ProductoForm
          formId="product-edit-form"
          loading={editLoading}
          textoBoton="Guardar cambios"
          hideSubmitButton
          defaultValues={{
            name:                producto.name,
            category:            producto.category,
            description:         producto.description,
            currentStock:        producto.currentStock,
            minimumStock:        producto.minimumStock,
            unit:                producto.unit,
            salePrice:           producto.salePrice,
            costPrice:           producto.costPrice,
            expirationDate:      producto.expirationDate,
            batch:               producto.batch,
            supplier:            producto.supplier,
            activeIngredient:    producto.activeIngredient,
            administrationRoute: producto.administrationRoute,
            registrationNumber:  producto.registrationNumber,
          }}
          onSubmit={async (data) => {
            setEditLoading(true);
            try {
              await updateProduct(id!, data);
              toast.success('Producto actualizado');
              setEditMode(false);
            } catch {
              toast.error('No se pudo guardar los cambios');
            } finally {
              setEditLoading(false);
            }
          }}
        />
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
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
            <div className="flex items-center gap-2 shrink-0">
              {stockBajo && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/40">
                  <AlertTriangle size={12} className="mr-1" /> Stock bajo
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                <Pencil size={14} className="mr-1.5" /> Editar
              </Button>
            </div>
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
          { label: 'Precio venta', value: producto.salePrice ? `C$${producto.salePrice.toFixed(0)}` : '—', highlight: false },
          { label: 'Precio costo', value: producto.costPrice ? `C$${producto.costPrice.toFixed(0)}` : '—', highlight: false },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn('text-xl font-bold', highlight && 'text-amber-500')}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Stock adjustment form ─────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Ajustar Stock
        </h2>
        <form onSubmit={handleSubmit(onAjuste)} className="space-y-3">

          {/* Entry / exit toggle */}
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

          {/* Quantity + reason */}
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

          {/* Finance impact toggle */}
          <div
            className={cn(
              'flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors',
              affectsFinances
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-muted/20',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <DollarSign size={15} className={cn('shrink-0', affectsFinances ? 'text-primary' : 'text-muted-foreground')} />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">Registrar en finanzas</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                  {tipoAjuste === 'entry'
                    ? 'Crea un egreso por compra de insumos'
                    : 'Registra la pérdida o baja de inventario'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleFinances}
              className={cn(
                'w-9 h-5 rounded-full transition-colors relative shrink-0',
                affectsFinances ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span className={cn(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                affectsFinances ? 'left-4' : 'left-0.5',
              )} />
            </button>
          </div>

          {/* Finance amount (shown when toggle is on) */}
          {affectsFinances && (
            <div className="space-y-1.5 pl-1">
              <label className="text-xs text-muted-foreground">
                {tipoAjuste === 'entry' ? 'Monto pagado (C$)' : 'Valor a registrar (C$)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  C$
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={financeAmount}
                  onChange={(e) => setFinanceAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary transition-colors"
                />
              </div>
              {producto.costPrice && (
                <p className="text-xs text-muted-foreground">
                  Precio costo unitario: C${producto.costPrice.toFixed(0)}
                  {' · '}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                    onClick={() => {
                      const qty = Number(getValues('quantity')) || 0;
                      if (qty > 0) setFinanceAmount(String(Math.round(qty * producto.costPrice!)));
                    }}
                  >
                    Calcular por cantidad
                  </button>
                </p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={ajustando}>
            {ajustando
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              : affectsFinances
              ? 'Registrar movimiento + egreso'
              : 'Registrar movimiento'}
          </Button>
        </form>
      </div>

      {/* ── Movement history ──────────────────────────────────────────────── */}
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

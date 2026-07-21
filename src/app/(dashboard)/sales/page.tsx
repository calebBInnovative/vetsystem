'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import { createSale } from '@/hooks/useSales';
import { DescuentoInput } from '@/components/common/DiscountInput';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS, FRACTIONAL_UNITS, type ProductCategory, type MeasurementUnit, type ProductLocal } from '@/types/inventory';
import { SALE_PAYMENT_METHODS, type SalePaymentMethod, type SaleItem } from '@/types/sale';
import { PacienteSelector } from '@/components/common/PatientSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type PromotionLocal } from '@/types/promotion';
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  CheckCircle2, X, Loader2, ChevronRight, Tag, ChevronDown,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

// ─── Cart item type ───────────────────────────────────────────────────────────

interface CartItem {
  productId:      string;       // real product id, or promotion item id for services
  description:    string;
  unitPrice:      number;
  quantity:       number;
  unit:           MeasurementUnit;
  subtotal:       number;
  availableStock: number;
  itemType?:      'product' | 'service';
  serviceId?:     string;
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  producto,
  onAdd,
  onAddAll,
}: {
  producto:  ProductLocal;
  onAdd:    () => void;
  onAddAll: () => void;
}) {
  const cat       = PRODUCT_CATEGORIES[producto.category];
  const unitLabel = MEASUREMENT_UNITS[producto.unit];
  const sinStock  = producto.currentStock === 0;

  return (
    <div className={cn(
      'flex flex-col rounded-xl border p-3 gap-2.5 transition-all',
      sinStock ? 'border-border opacity-40' : 'border-border'
    )}>
      {/* Product info */}
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{producto.name}</p>
          <p className="text-xs text-muted-foreground">
            {sinStock
              ? 'Sin stock'
              : `Stock: ${producto.currentStock} ${unitLabel}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{fmt(producto.salePrice ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground">/{unitLabel}</p>
        </div>
      </div>

      {/* Action buttons */}
      {sinStock ? (
        <p className="text-[11px] text-muted-foreground text-center">Sin stock disponible</p>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors px-2 py-1.5 text-xs font-medium"
          >
            <Plus size={11} className="shrink-0" /> 1 {unitLabel}
          </button>
          <button
            type="button"
            onClick={onAddAll}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary transition-colors px-2 py-1.5 text-xs font-medium truncate"
          >
            <ShoppingCart size={11} className="shrink-0" />
            <span className="truncate">Todo ({producto.currentStock})</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type View = 'products' | 'carrito';
type Step = 'cart' | 'cobrar' | 'exito';

export default function SalesPage() {
  const [searchQuery,  setSearchQuery]  = useState('');
  const [categoria,    setCategoria]    = useState<ProductCategory | undefined>();
  const [cart,         setCart]         = useState<CartItem[]>([]);
  const [view,         setView]         = useState<View>('products');
  const [step,         setStep]         = useState<Step>('cart');
  const [method,       setMethod]       = useState<SalePaymentMethod>('cash');
  const [discount,     setDiscount]     = useState('0');
  const [patientId,    setPatientId]    = useState('');
  const [notes,        setNotes]        = useState('');
  const [procesando,   setProcesando]   = useState(false);
  const [invoiceId,    setInvoiceId]    = useState('');
  const [showPromos,   setShowPromos]   = useState(false);
  const router = useRouter();

  const promotions = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const today = new Date().toISOString().slice(0, 10);
    const list = await db.promotions
      .where('clinicId').equals(clinicId)
      .filter((p) => {
        if (p.deletedAt || !p.active) return false;
        if (p.validFrom  && p.validFrom  > today) return false;
        if (p.validUntil && p.validUntil < today) return false;
        return true;
      })
      .toArray();
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, []) ?? [];

  const products = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let q = db.products
      .where('clinicId').equals(clinicId)
      .filter((p) => !!p.active && !p.deletedAt);

    if (categoria) q = q.filter((p) => p.category === categoria);

    const res = await q.toArray();
    if (searchQuery.trim()) {
      const t = searchQuery.toLowerCase();
      return res.filter((p) => p.name.toLowerCase().includes(t));
    }
    return res.sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, categoria]) ?? [];

  const subtotal   = useMemo(() => cart.reduce((s, i) => s + i.subtotal, 0), [cart]);
  const discountN  = Math.max(0, Number(discount) || 0);
  const total      = Math.max(0, subtotal - discountN);
  const totalItems = cart.length;

  // ── Cart operations ─────────────────────────────────────────────────────────

  function buildCartItem(prod: ProductLocal, qty: number): CartItem {
    return {
      productId:      prod.id,
      description:    prod.name,
      unitPrice:      prod.salePrice ?? 0,
      quantity:       qty,
      unit:           prod.unit,
      subtotal:       (prod.salePrice ?? 0) * qty,
      availableStock: prod.currentStock,
    };
  }

  // Adds 1 unit (or 0.5 for fractional) — bumps qty if already in cart
  function agregar(prod: ProductLocal) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const item = next[idx];
        if (!FRACTIONAL_UNITS.has(item.unit) && item.quantity >= item.availableStock) return prev;
        const step = FRACTIONAL_UNITS.has(item.unit) ? 0.5 : 1;
        const newQty = Math.min(item.availableStock, item.quantity + step);
        next[idx] = { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        return next;
      }
      const initialQty = FRACTIONAL_UNITS.has(prod.unit) ? 0.5 : 1;
      return [...prev, buildCartItem(prod, initialQty)];
    });
  }

  // Adds the product with qty = full available stock
  function agregarTodo(prod: ProductLocal) {
    if (prod.currentStock <= 0) return;
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === prod.id);
      const qty = prod.currentStock;
      if (idx >= 0) {
        const next = [...prev];
        const item = next[idx];
        next[idx] = { ...item, quantity: qty, subtotal: qty * item.unitPrice };
        return next;
      }
      return [...prev, buildCartItem(prod, qty)];
    });
  }

  function cambiarCantidad(productId: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      const stepSize = FRACTIONAL_UNITS.has(i.unit) ? 0.5 : 1;
      const min      = stepSize;
      const newQty   = Math.max(min, Math.min(i.availableStock, i.quantity + (delta > 0 ? stepSize : -stepSize)));
      return { ...i, quantity: newQty, subtotal: newQty * i.unitPrice };
    }));
  }

  function setCantidadDirecta(productId: string, valor: string) {
    const num = parseFloat(valor);
    if (isNaN(num) || num <= 0) return;
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      const newQty = Math.min(i.availableStock, num);
      return { ...i, quantity: newQty, subtotal: newQty * i.unitPrice };
    }));
  }

  function setMinQty(productId: string) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      const minQty = FRACTIONAL_UNITS.has(i.unit) ? 0.5 : 1;
      return { ...i, quantity: minQty, subtotal: minQty * i.unitPrice };
    }));
  }

  function venderTodo(productId: string) {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      return { ...i, quantity: i.availableStock, subtotal: i.availableStock * i.unitPrice };
    }));
  }

  function eliminar(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  function limpiarVenta() {
    setCart([]);
    setDiscount('0');
    setPatientId('');
    setNotes('');
    setMethod('cash');
    setStep('cart');
    setView('products');
    setInvoiceId('');
  }

  function agregarPromocion(promo: PromotionLocal) {
    setCart((prev) => {
      const next = [...prev];
      for (const item of promo.items) {
        const isService = item.type === 'service';
        const cartId    = isService ? item.id : item.refId;
        const idx       = next.findIndex((c) => c.productId === cartId);
        if (idx >= 0) {
          const c = next[idx];
          const newQty = c.quantity + item.quantity;
          const capped = isService ? newQty : Math.min(c.availableStock, newQty);
          next[idx] = { ...c, quantity: capped, subtotal: capped * item.finalUnitPrice };
        } else {
          next.push({
            productId:      cartId,
            description:    item.name,
            unitPrice:      item.finalUnitPrice,
            quantity:       item.quantity,
            unit:           'unit' as MeasurementUnit,
            subtotal:       item.finalUnitPrice * item.quantity,
            availableStock: isService ? 9999 : item.quantity,
            itemType:       item.type,
            serviceId:      isService ? item.refId : undefined,
          });
        }
      }
      return next;
    });
  }

  // ── Cobrar ──────────────────────────────────────────────────────────────────

  async function handleCobrar() {
    if (cart.length === 0 || procesando) return;
    setProcesando(true);
    try {
      const items: SaleItem[] = cart.map((i) => ({
        id:          crypto.randomUUID(),
        productId:   i.itemType === 'service' ? undefined : i.productId,
        serviceId:   i.serviceId,
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        subtotal:    i.quantity * i.unitPrice,
        itemType:    i.itemType,
      }));
      const subtotalAmount = items.reduce((s, i) => s + i.subtotal, 0);
      const ventaId = await createSale({
        items,
        subtotal:      subtotalAmount,
        discount:      discountN,
        total:         Math.max(0, subtotalAmount - discountN),
        paymentMethod: method,
        patientId:     patientId || undefined,
        notes:         notes || undefined,
      });
      const venta = await db.sales.get(ventaId);
      if (venta?.invoiceId) setInvoiceId(venta.invoiceId);
      setStep('exito');
    } finally {
      setProcesando(false);
    }
  }

  // ── Panel carrito ────────────────────────────────────────────────────────────

  function PanelCarrito() {
    if (step === 'exito') {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <CheckCircle2 size={56} className="text-green-500" />
          <p className="text-xl font-bold">¡Venta registrada!</p>
          <p className="text-sm text-muted-foreground">{fmt(total)} · {SALE_PAYMENT_METHODS[method].label}</p>
          <div className="flex flex-col gap-2 w-full mt-2">
            {invoiceId && (
              <Button variant="outline" className="w-full gap-2" onClick={() => router.push(`/invoices/${invoiceId}`)}>
                Ver factura / recibo
              </Button>
            )}
            <Button className="w-full" onClick={limpiarVenta}>
              Nueva venta
            </Button>
          </div>
        </div>
      );
    }

    if (step === 'cobrar') {
      return (
        <div className="flex flex-col gap-4">
          {/* Resumen compacto */}
          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
            {cart.map((i) => (
              <div key={i.productId} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[60%]">
                  {i.description} ×{i.quantity} {MEASUREMENT_UNITS[i.unit]}
                </span>
                <span className="font-medium">{fmt(i.subtotal)}</span>
              </div>
            ))}
            {discountN > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400 pt-1 border-t border-border">
                <span>Descuento</span><span>−{fmt(discountN)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
              <span>Total</span><span className="text-primary">{fmt(total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Método de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(SALE_PAYMENT_METHODS) as [SalePaymentMethod, { label: string; emoji: string }][]).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    method === key
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <span>{info.emoji}</span>{info.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cliente opcional */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Cliente <span className="text-muted-foreground font-normal">(opcional)</span></p>
            <PacienteSelector value={patientId || undefined} onChange={setPatientId} placeholder="Asociar a paciente..." />
          </div>

          {/* Notas */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas de la venta (opcional)…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('cart')} disabled={procesando}>
              ← Volver
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCobrar} disabled={procesando || total <= 0}>
              {procesando ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirmar cobro
            </Button>
          </div>
        </div>
      );
    }

    // ── Paso: cart ──────────────────────────────────────────────────────────────
    return (
      <div className="flex flex-col gap-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <ShoppingCart size={40} className="opacity-30 mb-3" />
            <p className="text-sm">El carrito está vacío</p>
            <p className="text-xs mt-1">Agrega productos desde el catálogo</p>
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="space-y-2">
              {cart.map((item) => {
                const isFractional = FRACTIONAL_UNITS.has(item.unit);
                const unitLabel    = MEASUREMENT_UNITS[item.unit];
                const atMax        = item.quantity >= item.availableStock;
                const atMin        = item.quantity <= (isFractional ? 0.5 : 1);
                return (
                  <div key={item.productId} className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-2">
                    {/* Top row: name + price + delete */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(item.unitPrice)}/{unitLabel} · disponible: {item.availableStock} {unitLabel}
                        </p>
                      </div>
                      <button type="button" onClick={() => eliminar(item.productId)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Bottom row: qty controls + subtotal */}
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => cambiarCantidad(item.productId, -1)}
                        disabled={atMin}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0">
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={isFractional ? 0.01 : 1}
                        step={isFractional ? 0.5 : 1}
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => setCantidadDirecta(item.productId, e.target.value)}
                        className="w-14 text-center text-sm font-semibold tabular-nums border border-input rounded-lg px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">{unitLabel}</span>
                      <button type="button" onClick={() => cambiarCantidad(item.productId, 1)}
                        disabled={atMax}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0">
                        <Plus size={12} />
                      </button>
                      {/* Quick-set buttons */}
                      {!atMin && (
                        <button type="button" onClick={() => setMinQty(item.productId)}
                          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded border border-border hover:border-foreground/40">
                          ×1
                        </button>
                      )}
                      {!atMax && (
                        <button type="button" onClick={() => venderTodo(item.productId)}
                          className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors shrink-0 px-1.5 py-0.5 rounded border border-primary/30 hover:border-primary">
                          Max
                        </button>
                      )}
                      <span className="text-sm font-bold ml-auto shrink-0">{fmt(item.subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Descuento */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Descuento</label>
              <DescuentoInput
                subtotal={subtotal}
                value={discountN}
                onChange={(amount) => setDiscount(String(amount))}
              />
            </div>

            {/* Total */}
            <div className="rounded-xl bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {discountN > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>Descuento</span><span>−{fmt(discountN)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>

            <Button className="w-full gap-2 h-11 text-base" onClick={() => setStep('cobrar')}>
              Cobrar <ChevronRight size={16} />
            </Button>

            <button type="button" onClick={limpiarVenta}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors text-center">
              Vaciar carrito
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 sm:-m-6 flex flex-col">

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="flex-1">
          <h1 className="font-bold text-base">Venta rápida</h1>
          <p className="text-xs text-muted-foreground">Productos · Sin necesidad de paciente</p>
        </div>
        {/* Mobile: toggle carrito */}
        <button
          type="button"
          onClick={() => setView(view === 'carrito' ? 'products' : 'carrito')}
          className="lg:hidden relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-sm font-medium"
        >
          <ShoppingCart size={15} />
          {totalItems > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Panel izquierdo: catálogo ─────────────────────────── */}
        <div className={cn(
          'flex-1 flex flex-col overflow-hidden',
          view === 'carrito' ? 'hidden lg:flex' : 'flex'
        )}>
          {/* Búsqueda + filtro */}
          <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setCategoria(undefined)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-xl text-xs font-medium border transition-colors',
                  !categoria ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                Todos
              </button>
              {(Object.entries(PRODUCT_CATEGORIES) as [ProductCategory, { label: string; emoji: string }][]).map(([cat, info]) => (
                <button
                  key={cat}
                  onClick={() => setCategoria(cat === categoria ? undefined : cat)}
                  className={cn(
                    'shrink-0 flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-medium border transition-colors',
                    categoria === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {info.emoji} {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* Promotions section */}
          {promotions.length > 0 && (
            <div className="px-4 pb-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowPromos((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2"
              >
                <Tag size={12} />
                Promociones activas ({promotions.length})
                <ChevronDown size={12} className={cn('transition-transform', showPromos && 'rotate-180')} />
              </button>
              {showPromos && (
                <div className="flex flex-col gap-2">
                  {promotions.map((promo) => (
                    <div key={promo.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{promo.name}</p>
                        {promo.description && (
                          <p className="text-xs text-muted-foreground truncate">{promo.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {promo.items.length} items ·{' '}
                          {promo.originalTotal !== promo.total && (
                            <span className="line-through mr-1">{fmt(promo.originalTotal)}</span>
                          )}
                          <span className="text-primary font-medium">{fmt(promo.total)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { agregarPromocion(promo); setView('carrito'); }}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <ShoppingCart size={11} /> Aplicar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                <p className="text-3xl mb-2">📦</p>
                <p className="text-sm">{searchQuery ? 'Sin resultados' : 'No hay productos en esta categoría'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {products.map((prod) => (
                  <ProductCard
                    key={prod.id}
                    producto={prod}
                    onAdd={() => agregar(prod)}
                    onAddAll={() => agregarTodo(prod)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel derecho: carrito ────────────────────────────── */}
        <div className={cn(
          'w-full lg:w-80 border-l border-border bg-card flex flex-col overflow-hidden shrink-0',
          view === 'products' ? 'hidden lg:flex' : 'flex'
        )}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <p className="font-semibold text-sm">
              {step === 'cobrar' ? 'Confirmar cobro' : step === 'exito' ? 'Venta completada' : `Carrito${totalItems > 0 ? ` (${totalItems})` : ''}`}
            </p>
            {step !== 'exito' && cart.length > 0 && step === 'cart' && (
              <span className="text-xs text-muted-foreground">{fmt(total)}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PanelCarrito />
          </div>
        </div>
      </div>
    </div>
  );
}

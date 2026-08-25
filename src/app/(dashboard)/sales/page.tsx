'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import { createSale } from '@/hooks/useSales';
import { DescuentoInput } from '@/components/common/DiscountInput';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS, FRACTIONAL_UNITS, type ProductCategory, type MeasurementUnit, type ProductLocal } from '@/types/inventory';
import { SALE_PAYMENT_METHODS, type SalePaymentMethod, type SaleItem } from '@/types/sale';
import { SERVICE_CATEGORIES, type ServiceLocal } from '@/types/service';
import { PacienteSelector } from '@/components/common/PatientSelector';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { type PromotionLocal } from '@/types/promotion';
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  CheckCircle2, X, Loader2, ChevronRight, Tag, ChevronDown,
  LayoutList, LayoutGrid,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

// ─── CartNumberInput ──────────────────────────────────────────────────────────

interface CartNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (num: number) => void;
  className?: string;
}

function CartNumberInput({ value, min, max, onChange, className }: CartNumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setLocalValue(String(value));
  }, [value, editing]);

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setEditing(true);
    e.target.select();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalValue(e.target.value);
  }

  function handleBlur() {
    setEditing(false);
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
      onChange(clamped);
    } else {
      setLocalValue(String(value));
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
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
  listMode = false,
}: {
  producto:  ProductLocal;
  onAdd:    () => void;
  onAddAll: () => void;
  listMode?: boolean;
}) {
  const cat       = PRODUCT_CATEGORIES[producto.category];
  const unitLabel = MEASUREMENT_UNITS[producto.unit];
  const sinStock  = producto.currentStock === 0;

  if (listMode) {
    return (
      <div className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
        sinStock ? 'border-border opacity-40' : 'border-border'
      )}>
        <span className="text-xl shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{producto.name}</p>
          <p className="text-xs text-muted-foreground">
            {sinStock ? 'Sin stock' : `${producto.currentStock} ${unitLabel} disp.`}
          </p>
        </div>
        <p className="text-sm font-bold shrink-0">{fmt(producto.salePrice ?? 0)}</p>
        {sinStock ? (
          <span className="text-[10px] text-muted-foreground shrink-0">Sin stock</span>
        ) : (
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors px-2 py-1.5 text-xs font-medium"
            >
              <Plus size={11} />+1
            </button>
            <button
              type="button"
              onClick={onAddAll}
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary transition-colors px-2 py-1.5 text-xs font-medium"
            >
              <ShoppingCart size={11} />
            </button>
          </div>
        )}
      </div>
    );
  }

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

// ─── Promotion card ───────────────────────────────────────────────────────────

function PromotionCard({
  promo,
  onApply,
}: {
  promo: PromotionLocal;
  onApply: () => void;
}) {
  const savings = promo.originalTotal - promo.total;
  const savingsPct = promo.originalTotal > 0
    ? Math.round((savings / promo.originalTotal) * 100)
    : 0;

  return (
    <div className="flex flex-col rounded-xl border border-primary/30 bg-primary/5 p-3 gap-2.5">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <span className="text-xl shrink-0 mt-0.5">🏷️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight truncate">{promo.name}</p>
            {savingsPct > 0 && (
              <span className="shrink-0 text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">
                -{savingsPct}%
              </span>
            )}
          </div>
          {promo.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{promo.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            {savings > 0 && (
              <span className="text-xs text-muted-foreground line-through">{fmt(promo.originalTotal)}</span>
            )}
            <span className="text-sm font-bold text-primary">{fmt(promo.total)}</span>
            {savings > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                ahorrás {fmt(savings)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Items preview */}
      <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
        {promo.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              {item.quantity}× {item.name}
            </span>
            <span className={cn(
              'shrink-0 font-medium',
              item.discountType !== 'none' ? 'text-green-600 dark:text-green-400' : 'text-foreground/70',
            )}>
              {fmt(item.finalUnitPrice)}
            </span>
          </div>
        ))}
        {promo.items.length > 3 && (
          <p className="text-[10px] text-muted-foreground/60">+{promo.items.length - 3} producto{promo.items.length - 3 !== 1 ? 's' : ''} más</p>
        )}
      </div>

      <button
        type="button"
        onClick={onApply}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 hover:bg-primary/90 transition-colors"
      >
        <ShoppingCart size={11} /> Aplicar promoción
      </button>
    </div>
  );
}

// ─── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onAdd,
  listMode = false,
}: {
  service:  ServiceLocal;
  onAdd:    () => void;
  listMode?: boolean;
}) {
  const cat = SERVICE_CATEGORIES[service.category];

  if (listMode) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-all">
        <span className="text-xl shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{service.name}</p>
          <p className="text-xs text-muted-foreground">{cat.label}</p>
        </div>
        <p className="text-sm font-bold shrink-0">{fmt(service.price)}</p>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors px-2 py-1.5 text-xs font-medium shrink-0"
        >
          <Plus size={11} />+1
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-border p-3 gap-2.5 transition-all">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{service.name}</p>
          <p className="text-xs text-muted-foreground">{cat.label}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{fmt(service.price)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1 rounded-lg border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors px-2 py-1.5 text-xs font-medium"
      >
        <Plus size={11} className="shrink-0" /> Agregar
      </button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type View       = 'products' | 'carrito';
type Step       = 'cart' | 'cobrar' | 'exito';
type CatalogView = 'grid' | 'list';

export default function SalesPage() {
  const [searchQuery,  setSearchQuery]  = useState('');
  const [categoria,    setCategoria]    = useState<ProductCategory | undefined>();
  const [catOpen,      setCatOpen]      = useState(false);
  const [catSearch,    setCatSearch]    = useState('');
  const catSearchRef = useRef<HTMLInputElement>(null);
  const [cart,         setCart]         = useState<CartItem[]>([]);
  const [view,         setView]         = useState<View>('products');
  const [step,         setStep]         = useState<Step>('cart');
  const [method,       setMethod]       = useState<SalePaymentMethod>('cash');
  const [discount,     setDiscount]     = useState('0');
  const [patientId,    setPatientId]    = useState('');
  const [notes,        setNotes]        = useState('');
  const [procesando,   setProcesando]   = useState(false);
  const [invoiceId,    setInvoiceId]    = useState('');
  const [catalogTab,   setCatalogTab]   = useState<'products' | 'services' | 'promos'>('products');
  const [catalogView,  setCatalogView]  = useState<CatalogView>('grid');
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

  const services = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const res = await db.services
      .where('clinicId').equals(clinicId)
      .filter((s) => !!s.active && !s.deletedAt)
      .toArray();
    if (searchQuery.trim()) {
      const t = searchQuery.toLowerCase();
      return res.filter((s) => s.name.toLowerCase().includes(t)).sort((a, b) => a.name.localeCompare(b.name));
    }
    return res.sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery]) ?? [];

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

  function cambiarPrecio(productId: string, valor: string) {
    const num = parseFloat(valor);
    if (isNaN(num) || num < 0) return;
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      return { ...i, unitPrice: num, subtotal: num * i.quantity };
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

  function agregarServicio(svc: ServiceLocal) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === svc.id);
      if (idx >= 0) {
        const next = [...prev];
        const item = next[idx];
        const newQty = item.quantity + 1;
        next[idx] = { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        return next;
      }
      return [...prev, {
        productId:      svc.id,
        description:    svc.name,
        unitPrice:      svc.price,
        quantity:       1,
        unit:           'unit' as MeasurementUnit,
        subtotal:       svc.price,
        availableStock: 9999,
        itemType:       'service',
        serviceId:      svc.id,
      }];
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
                  <div key={item.productId} className="rounded-xl border border-border bg-card px-3 py-3 space-y-2.5">
                    {/* Top row: name + delete */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug break-words">{item.description}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <CartNumberInput
                            value={item.unitPrice}
                            min={0}
                            onChange={(num) => cambiarPrecio(item.productId, String(num))}
                            className="w-20 text-xs tabular-nums text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:text-foreground focus:outline-none transition-colors"
                          />
                          <span className="text-xs text-muted-foreground">/{unitLabel} · disp: {item.availableStock}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => eliminar(item.productId)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Bottom row: qty controls + subtotal — wraps on narrow cart */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button type="button" onClick={() => cambiarCantidad(item.productId, -1)}
                        disabled={atMin}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0">
                        <Minus size={12} />
                      </button>
                      <CartNumberInput
                        value={item.quantity}
                        min={isFractional ? 0.01 : 1}
                        max={item.availableStock}
                        onChange={(num) => setCantidadDirecta(item.productId, String(num))}
                        className="w-14 text-center text-sm font-semibold tabular-nums border border-input rounded-lg px-1 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
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
                      <span className="text-sm font-bold ml-auto shrink-0 tabular-nums">{fmt(item.subtotal)}</span>
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
          {/* Búsqueda + tabs + filtro */}
          <div className="px-4 pt-4 pb-3 space-y-3 shrink-0">
            {/* Tab: Productos / Servicios / Promos */}
            <div className="flex rounded-xl border border-border overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => { setCatalogTab('products'); setSearchQuery(''); }}
                className={cn(
                  'flex-1 py-1.5 transition-colors',
                  catalogTab === 'products' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                Productos
              </button>
              <button
                type="button"
                onClick={() => { setCatalogTab('services'); setSearchQuery(''); setCategoria(undefined); }}
                className={cn(
                  'flex-1 py-1.5 transition-colors',
                  catalogTab === 'services' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                Servicios
              </button>
              <button
                type="button"
                onClick={() => { setCatalogTab('promos'); setSearchQuery(''); setCategoria(undefined); }}
                className={cn(
                  'flex-1 py-1.5 transition-colors relative',
                  catalogTab === 'promos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                Promos
                {promotions.length > 0 && catalogTab !== 'promos' && (
                  <span className="absolute top-0.5 right-1 w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                    {promotions.length}
                  </span>
                )}
              </button>
            </div>

            {/* Búsqueda + view toggle — oculta en promos */}
            {catalogTab !== 'promos' && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={catalogTab === 'services' ? 'Buscar servicio…' : 'Buscar producto…'}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={13} />
                  </button>
                )}
              </div>
              {/* Grid / list toggle */}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setCatalogView('grid')}
                  className={cn(
                    'px-2.5 py-2 transition-colors',
                    catalogView === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogView('list')}
                  className={cn(
                    'px-2.5 py-2 transition-colors',
                    catalogView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <LayoutList size={14} />
                </button>
              </div>
            </div>
            )}

            {/* Categorías — solo en tab Productos */}
            {catalogTab === 'products' && (
              <Popover open={catOpen} onOpenChange={(o) => { setCatOpen(o); if (o) setTimeout(() => catSearchRef.current?.focus(), 50); else setCatSearch(''); }}>
                <PopoverTrigger asChild>
                  <button className={cn(
                    'flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                    categoria ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  )}>
                    <span className="flex items-center gap-1.5 truncate">
                      {categoria
                        ? <>{PRODUCT_CATEGORIES[categoria].emoji} {PRODUCT_CATEGORIES[categoria].label}</>
                        : 'Todas las categorías'}
                    </span>
                    <ChevronDown size={12} className={cn('shrink-0 transition-transform', catOpen && 'rotate-180')} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1.5 gap-0">
                  {/* Search input */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5 border border-border rounded-lg mb-1">
                    <Search size={12} className="shrink-0 text-muted-foreground" />
                    <input
                      ref={catSearchRef}
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      placeholder="Buscar categoría..."
                      className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                    {catSearch && (
                      <button onClick={() => setCatSearch('')} className="text-muted-foreground hover:text-foreground">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  {/* Options list */}
                  <div className="flex flex-col overflow-y-auto max-h-48" style={{ scrollbarWidth: 'thin' }}>
                    {!catSearch && (
                      <button
                        onClick={() => { setCategoria(undefined); setCatOpen(false); setCatSearch(''); }}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          !categoria ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                        )}
                      >
                        Todas las categorías
                      </button>
                    )}
                    {(Object.entries(PRODUCT_CATEGORIES) as [ProductCategory, { label: string; emoji: string }][])
                      .filter(([, info]) => !catSearch || info.label.toLowerCase().includes(catSearch.toLowerCase()))
                      .map(([cat, info]) => (
                        <button
                          key={cat}
                          onClick={() => { setCategoria(cat === categoria ? undefined : cat); setCatOpen(false); setCatSearch(''); }}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            categoria === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                          )}
                        >
                          <span>{info.emoji}</span> {info.label}
                        </button>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Catálogo */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {catalogTab === 'products' ? (
              products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                  <p className="text-3xl mb-2">📦</p>
                  <p className="text-sm">{searchQuery ? 'Sin resultados' : 'No hay productos en esta categoría'}</p>
                </div>
              ) : (
                <div className={cn(
                  'gap-2',
                  catalogView === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2' : 'flex flex-col'
                )}>
                  {products.map((prod) => (
                    <ProductCard
                      key={prod.id}
                      producto={prod}
                      onAdd={() => agregar(prod)}
                      onAddAll={() => agregarTodo(prod)}
                      listMode={catalogView === 'list'}
                    />
                  ))}
                </div>
              )
            ) : catalogTab === 'services' ? (
              services.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
                  <p className="text-3xl mb-2">🩺</p>
                  <p className="text-sm">{searchQuery ? 'Sin resultados' : 'No hay servicios activos'}</p>
                </div>
              ) : (
                <div className={cn(
                  'gap-2',
                  catalogView === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2' : 'flex flex-col'
                )}>
                  {services.map((svc) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onAdd={() => { agregarServicio(svc); setView('carrito'); }}
                      listMode={catalogView === 'list'}
                    />
                  ))}
                </div>
              )
            ) : (
              /* Promos tab */
              promotions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center gap-2">
                  <Tag size={36} className="opacity-25" />
                  <p className="text-sm font-medium">Sin promociones activas</p>
                  <p className="text-xs">Crea una en <span className="font-medium">Promociones</span> y vuelve aquí para aplicarla.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {promotions.map((promo) => (
                    <PromotionCard
                      key={promo.id}
                      promo={promo}
                      onApply={() => { agregarPromocion(promo); setView('carrito'); }}
                    />
                  ))}
                </div>
              )
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

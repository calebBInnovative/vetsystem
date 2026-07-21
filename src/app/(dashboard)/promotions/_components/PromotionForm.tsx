'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PromotionForm — shared form used by both the New and Edit pages.
//
// Manages:
//   Section A — name, description, active toggle, valid date range
//   Section B — tabbed product/service catalog picker + added-items list
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { db } from '@/lib/db/database';
import type { ProductLocal } from '@/types/inventory';
import type { ServiceLocal } from '@/types/service';
import { applyDiscount, type DiscountType, type PromotionItem } from '@/types/promotion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Minus, Plus, Search, X } from 'lucide-react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PromotionFormValues {
  name: string;
  description?: string;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  items: PromotionItem[];
}

interface PromotionFormProps {
  /** Pre-fill the form when editing an existing promotion. */
  initial?: PromotionFormValues;
  clinicId: string;
  onSubmit: (values: PromotionFormValues) => Promise<void>;
  submitLabel?: string;
  /** Optional slot rendered to the left of the Save button (e.g. Delete). */
  extraActions?: React.ReactNode;
}

// ─── Local constants ──────────────────────────────────────────────────────────

type Tab = 'products' | 'services';

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  none:       'Sin descuento',
  percentage: '% Descuento',
  fixed:      'Monto fijo',
  free:       'Gratis',
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return `C$${n.toFixed(2)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PromotionForm({
  initial,
  clinicId,
  onSubmit,
  submitLabel = 'Guardar',
  extraActions,
}: PromotionFormProps) {
  // ── Section A state ──────────────────────────────────────────────────────
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [active,      setActive]      = useState(initial?.active      ?? true);
  const [validFrom,   setValidFrom]   = useState(initial?.validFrom   ?? '');
  const [validUntil,  setValidUntil]  = useState(initial?.validUntil  ?? '');

  // ── Section B state ──────────────────────────────────────────────────────
  const [items, setItems] = useState<PromotionItem[]>(initial?.items ?? []);

  // ── Catalog ──────────────────────────────────────────────────────────────
  const [products,       setProducts]       = useState<ProductLocal[]>([]);
  const [services,       setServices]       = useState<ServiceLocal[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // ── UI ───────────────────────────────────────────────────────────────────
  const [tab,           setTab]           = useState<Tab>('products');
  const [productSearch, setProductSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  // Load active products and services from Dexie on mount.
  useEffect(() => {
    (async () => {
      setCatalogLoading(true);
      try {
        const [prods, svcs] = await Promise.all([
          db.products
            .where('clinicId').equals(clinicId)
            .filter((p) => !p.deletedAt && p.active)
            .toArray(),
          db.services
            .where('clinicId').equals(clinicId)
            .filter((s) => !s.deletedAt && s.active)
            .toArray(),
        ]);
        setProducts(prods.sort((a, b) => a.name.localeCompare(b.name)));
        setServices(svcs.sort((a, b) => a.name.localeCompare(b.name)));
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, [clinicId]);

  // ── Filtered catalog lists ────────────────────────────────────────────────

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  const filteredServices = serviceSearch.trim()
    ? services.filter((s) => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
    : services;

  // ── Item helpers ─────────────────────────────────────────────────────────

  const isProductAdded = (id: string) =>
    items.some((i) => i.refId === id && i.type === 'product');

  const isServiceAdded = (id: string) =>
    items.some((i) => i.refId === id && i.type === 'service');

  function addProduct(product: ProductLocal) {
    if (isProductAdded(product.id)) return;
    const price = product.salePrice ?? 0;
    setItems((prev) => [
      ...prev,
      {
        id:             crypto.randomUUID(),
        type:           'product',
        refId:          product.id,
        name:           product.name,
        unit:           product.unit,
        quantity:       1,
        originalPrice:  price,
        discountType:   'none',
        discountValue:  0,
        finalUnitPrice: price,
      },
    ]);
  }

  function addService(service: ServiceLocal) {
    if (isServiceAdded(service.id)) return;
    setItems((prev) => [
      ...prev,
      {
        id:             crypto.randomUUID(),
        type:           'service',
        refId:          service.id,
        name:           service.name,
        quantity:       1,
        originalPrice:  service.price,
        discountType:   'none',
        discountValue:  0,
        finalUnitPrice: service.price,
      },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function setItemQty(id: string, qty: number) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i)),
    );
  }

  function setItemDiscount(id: string, discountType: DiscountType, discountValue: number) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const finalUnitPrice = applyDiscount(i.originalPrice, discountType, discountValue);
        return { ...i, discountType, discountValue, finalUnitPrice };
      }),
    );
  }

  // ── Derived totals ────────────────────────────────────────────────────────

  const originalTotal = items.reduce((sum, i) => sum + i.originalPrice * i.quantity, 0);
  const total         = items.reduce((sum, i) => sum + i.finalUnitPrice * i.quantity, 0);
  const savings       = originalTotal - total;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())       { setError('El nombre es requerido'); return; }
    if (items.length === 0) { setError('Agrega al menos un producto o servicio'); return; }

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        name:        name.trim(),
        description: description.trim() || undefined,
        active,
        validFrom:   validFrom  || undefined,
        validUntil:  validUntil || undefined,
        items,
      });
    } catch {
      setError('Ocurrió un error al guardar. Intenta de nuevo.');
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Section A: Información general ──────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Información general
        </h2>

        {/* Name */}
        <div>
          <label className="text-sm font-medium" htmlFor="promo-name">
            Nombre <span className="text-destructive">*</span>
          </label>
          <input
            id="promo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Pack Vacunación Completa"
            required
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium" htmlFor="promo-desc">
            Descripción{' '}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <textarea
            id="promo-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Describe brevemente la promoción…"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {/* Active toggle + Date range */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          {/* Switch */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive((v) => !v)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                active ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                  active ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
            <span className="text-sm font-medium">
              {active ? 'Activa' : 'Inactiva'}
            </span>
          </div>

          {/* Date range */}
          <div className="flex gap-3 flex-1">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground" htmlFor="promo-from">
                Válida desde
              </label>
              <input
                id="promo-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground" htmlFor="promo-until">
                Válida hasta
              </label>
              <input
                id="promo-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section B: Items builder ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Productos y servicios
        </h2>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
          {(['products', 'services'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'products' ? 'Productos' : 'Servicios'}
            </button>
          ))}
        </div>

        {/* ── Product tab ───────────────────────────────────────────────── */}
        {tab === 'products' && (
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Cargando…
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {productSearch ? 'Sin resultados' : 'No hay productos activos'}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden max-h-56 overflow-y-auto">
                {filteredProducts.map((p) => {
                  const added = isProductAdded(p.id);
                  return (
                    <li
                      key={p.id}
                      onClick={() => !added && addProduct(p)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                        added
                          ? 'bg-primary/5 dark:bg-primary/10'
                          : 'cursor-pointer hover:bg-muted',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtCurrency(p.salePrice ?? 0)}
                          {p.unit ? ` · ${p.unit}` : ''}
                        </p>
                      </div>
                      {added ? (
                        <span className="shrink-0 text-xs font-medium text-primary">
                          Agregado
                        </span>
                      ) : (
                        <Plus size={15} className="shrink-0 text-muted-foreground" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── Service tab ───────────────────────────────────────────────── */}
        {tab === 'services' && (
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Buscar servicio…"
                className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Cargando…
              </div>
            ) : filteredServices.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                {serviceSearch ? 'Sin resultados' : 'No hay servicios activos'}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden max-h-56 overflow-y-auto">
                {filteredServices.map((s) => {
                  const added = isServiceAdded(s.id);
                  return (
                    <li
                      key={s.id}
                      onClick={() => !added && addService(s)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                        added
                          ? 'bg-primary/5 dark:bg-primary/10'
                          : 'cursor-pointer hover:bg-muted',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtCurrency(s.price)}</p>
                      </div>
                      {added ? (
                        <span className="shrink-0 text-xs font-medium text-primary">
                          Agregado
                        </span>
                      ) : (
                        <Plus size={15} className="shrink-0 text-muted-foreground" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── Added items list ──────────────────────────────────────────── */}
        {items.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border">
            <h3 className="text-sm font-medium">
              Artículos en la promoción
              <span className="ml-2 text-muted-foreground font-normal">
                ({items.length})
              </span>
            </h3>

            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-3 space-y-3"
                >
                  {/* Row 1: name + type badge + remove */}
                  <div className="flex items-center gap-2">
                    <p className="flex-1 font-medium text-sm truncate">{item.name}</p>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                        item.type === 'product'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
                      )}
                    >
                      {item.type === 'product' ? 'Producto' : 'Servicio'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Quitar artículo"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Row 2: qty + original price + discount type + value/final */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">

                    {/* Quantity */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Cantidad</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setItemQty(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors"
                          aria-label="Disminuir cantidad"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-7 text-center font-medium tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setItemQty(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors"
                          aria-label="Aumentar cantidad"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Original price (read-only snapshot) */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Precio original</p>
                      <p className="h-7 flex items-center text-muted-foreground tabular-nums">
                        {fmtCurrency(item.originalPrice)}
                      </p>
                    </div>

                    {/* Discount type */}
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Descuento</p>
                      <select
                        value={item.discountType}
                        onChange={(e) =>
                          setItemDiscount(
                            item.id,
                            e.target.value as DiscountType,
                            item.discountValue,
                          )
                        }
                        className="w-full h-7 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {(Object.entries(DISCOUNT_LABELS) as [DiscountType, string][]).map(
                          ([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ),
                        )}
                      </select>
                    </div>

                    {/* Discount value input OR final unit price */}
                    <div className="space-y-1">
                      {item.discountType === 'percentage' || item.discountType === 'fixed' ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {item.discountType === 'percentage' ? 'Porcentaje (%)' : 'Monto (C$)'}
                          </p>
                          <input
                            type="number"
                            min="0"
                            max={item.discountType === 'percentage' ? 100 : undefined}
                            step={item.discountType === 'percentage' ? 1 : 0.01}
                            value={item.discountValue || ''}
                            onChange={(e) =>
                              setItemDiscount(
                                item.id,
                                item.discountType,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full h-7 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">Precio final</p>
                          <p className="h-7 flex items-center font-bold tabular-nums text-green-600 dark:text-green-400">
                            {fmtCurrency(item.finalUnitPrice)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Final unit price when a discount value input is shown */}
                  {(item.discountType === 'percentage' || item.discountType === 'fixed') && (
                    <div className="flex items-center justify-end gap-1.5 text-sm border-t border-border pt-2">
                      <span className="text-muted-foreground">Precio final por unidad:</span>
                      <span className="font-bold tabular-nums text-green-600 dark:text-green-400">
                        {fmtCurrency(item.finalUnitPrice)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Summary footer ────────────────────────────────────────────── */}
        {items.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Precio original:</span>
              <span className="tabular-nums">{fmtCurrency(originalTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Precio final:</span>
              <span className="tabular-nums text-green-600 dark:text-green-400">
                {fmtCurrency(total)}
              </span>
            </div>
            {savings > 0.001 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ahorro:</span>
                <span className="tabular-nums text-green-600 dark:text-green-400">
                  {fmtCurrency(savings)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>{extraActions}</div>
        <Button
          type="submit"
          disabled={saving || !name.trim() || items.length === 0}
          className="gap-2 min-w-[130px]"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

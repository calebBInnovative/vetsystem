'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, CheckCircle2, AlertCircle, Loader2,
  Search, Filter, X, ChevronDown, ChevronUp, ArrowLeft, Minus, Plus,
  Pencil, AlertTriangle, Package, Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { db, getClinicId } from '@/lib/db/database';
import type { SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal, MeasurementUnit } from '@/types/inventory';
import { MEASUREMENT_UNITS } from '@/types/inventory';
import { fetchCatalogProducts } from '@/lib/firebase/catalog';
import type { CatalogProduct, CatalogCategory } from '@/types/catalog';
import {
  CATALOG_CATEGORY_LABELS, CATALOG_CATEGORY_COLORS,
  CATALOG_DOSAGE_FORM_LABELS, CATALOG_TO_PRODUCT_CATEGORY,
} from '@/types/catalog';

// ─── Species labels ───────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, string> = {
  dogs: 'Perros', cats: 'Gatos', roosters: 'Gallos',
  birds: 'Aves', cattle: 'Bovinos', horses: 'Equinos',
  pigs: 'Cerdos', rabbits: 'Conejos',
};

const DRAFT_KEY = 'vetsys-catalog-import-draft';

// ─── Draft types ──────────────────────────────────────────────────────────────

interface ProductDraft {
  name: string;
  quantity: number;
  minimumStock: number;
  salePrice: string;
  costPrice: string;
  unit: MeasurementUnit;
}

interface DraftState {
  supplier: string | null;
  drafts: Record<string, ProductDraft>;
}

function makeDraft(p: CatalogProduct): ProductDraft {
  return {
    name:         p.name,
    quantity:     0,
    minimumStock: 0,
    salePrice:    '',
    costPrice:    '',
    unit:         'unit',
  };
}

function saveDraft(state: DraftState) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch { /* storage full — ignore */ }
}

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ─── Dexie import helper ──────────────────────────────────────────────────────

async function importFromCatalog(
  entries: { product: CatalogProduct; draft: ProductDraft }[]
): Promise<number> {
  if (entries.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const items: ProductLocal[] = entries.map(({ product: p, draft: d }) => ({
    id:                  crypto.randomUUID(),
    clinicId,
    name:                d.name.trim() || p.name,
    category:            CATALOG_TO_PRODUCT_CATEGORY[p.category],
    supplier:            p.supplier,
    description:         p.description || undefined,
    activeIngredient:    p.activeIngredient || undefined,
    administrationRoute: p.administrationRoute || undefined,
    registrationNumber:  p.registrationNumber || undefined,
    currentStock:        d.quantity,
    minimumStock:        d.minimumStock,
    salePrice:           d.salePrice.trim() ? parseFloat(d.salePrice) : undefined,
    costPrice:           d.costPrice.trim() ? parseFloat(d.costPrice) : undefined,
    unit:                d.unit,
    active:              true,
    syncStatus:          'pending' as const,
    updatedAt:           now,
    createdAt:           now,
  }));
  await db.products.bulkPut(items);
  for (const item of items) {
    await db.syncQueue.add({
      collection: 'products', documentId: item.id,
      operation: 'create', data: item, attempts: 0, createdAt: now,
    } as SyncQueueItem);
  }
  return items.length;
}

// ─── Qty stepper ──────────────────────────────────────────────────────────────

function QtyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.preventDefault()}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-6 h-6 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Minus size={10} />
        </button>
        <input
          type="number" min="0" value={value}
          onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(isNaN(n) || n < 0 ? 0 : n); }}
          className="w-12 h-6 text-center text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-6 h-6 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Plus size={10} />
        </button>
      </div>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60';

function ProductCard({
  product,
  draft,
  onToggle,
  onDraftChange,
}: {
  product: CatalogProduct;
  draft: ProductDraft | null;
  onToggle: () => void;
  onDraftChange: (d: ProductDraft) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = draft !== null;
  const missingPrice = selected && !draft.salePrice.trim();

  const hasDetails = !!(
    product.description ||
    product.administrationRoute ||
    (product.presentations && product.presentations.length > 0)
  );

  const set = useCallback((patch: Partial<ProductDraft>) => {
    if (!draft) return;
    onDraftChange({ ...draft, ...patch });
  }, [draft, onDraftChange]);

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-150',
        selected
          ? 'border-primary shadow-sm shadow-primary/10 bg-primary/5'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-sm',
      )}
    >
      {/* Checkbox row */}
      <label className="flex items-start gap-3 p-3 cursor-pointer select-none">
        <div className={cn(
          'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          selected ? 'border-primary bg-primary' : 'border-border bg-background',
        )}>
          {selected && <CheckCircle2 size={10} className="text-primary-foreground" strokeWidth={3} />}
          <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm leading-tight">{product.name}</p>
            {missingPrice && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-1.5 py-0.5 rounded-full">
                <AlertTriangle size={9} /> Sin precio
              </span>
            )}
          </div>
          {product.activeIngredient && (
            <p className="text-xs text-muted-foreground mt-0.5">{product.activeIngredient}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', CATALOG_CATEGORY_COLORS[product.category])}>
              {CATALOG_CATEGORY_LABELS[product.category]}
            </span>
            {product.dosageForm && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                {CATALOG_DOSAGE_FORM_LABELS[product.dosageForm]}
              </span>
            )}
            {product.species?.map((s) => (
              <span key={s} className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                {SPECIES_LABELS[s] ?? s}
              </span>
            ))}
          </div>

          {!selected && (
            <div className="flex items-center justify-between mt-1.5">
              {hasDetails ? (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {expanded ? 'Ocultar detalles' : 'Ver ficha'}
                </button>
              ) : <span />}
              <span className="text-[10px] text-muted-foreground/60 italic">Selecciona para configurar</span>
            </div>
          )}
        </div>
      </label>

      {/* Catalog details (unselected only) */}
      {!selected && expanded && hasDetails && (
        <div className="mx-3 mb-3 space-y-1.5 text-xs text-muted-foreground border-t border-border pt-2">
          {product.description && (
            <p><span className="font-medium text-foreground/80">Características: </span>{product.description}</p>
          )}
          {product.administrationRoute && (
            <p><span className="font-medium text-foreground/80">Vía: </span>{product.administrationRoute}</p>
          )}
          {product.presentations?.length && (
            <p><span className="font-medium text-foreground/80">Presentaciones: </span>{product.presentations.join(' · ')}</p>
          )}
          {product.registrationNumber && (
            <p className="font-mono text-[10px]">{product.registrationNumber}</p>
          )}
        </div>
      )}

      {/* Edit section — only when selected */}
      {selected && draft && (
        <>
          {/* Edit section header */}
          <div className="mx-3 mb-2 flex items-center gap-1.5 border-t border-primary/20 pt-2.5">
            <Pencil size={11} className="text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Configura antes de importar</span>
          </div>

          <div className="px-3 pb-3 space-y-3">
            {/* Name */}
            <div onClick={(e) => e.preventDefault()}>
              <label className="text-[10px] text-muted-foreground block mb-1">Nombre del producto</label>
              <input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                className={INPUT}
                placeholder={product.name}
              />
            </div>

            {/* Prices + unit */}
            <div className="grid grid-cols-3 gap-2" onClick={(e) => e.preventDefault()}>
              <div>
                <label className={cn('text-[10px] block mb-1', missingPrice ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>
                  Precio venta ($){missingPrice && ' *'}
                </label>
                <input
                  type="text" inputMode="numeric"
                  value={draft.salePrice}
                  onChange={(e) => set({ salePrice: e.target.value })}
                  placeholder="0.00"
                  className={cn(INPUT, missingPrice && 'border-amber-300 dark:border-amber-700 focus:ring-amber-300')}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Precio costo ($)</label>
                <input
                  type="text" inputMode="numeric"
                  value={draft.costPrice}
                  onChange={(e) => set({ costPrice: e.target.value })}
                  placeholder="0.00"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Unidad</label>
                <select
                  value={draft.unit}
                  onChange={(e) => set({ unit: e.target.value as MeasurementUnit })}
                  className={INPUT}
                >
                  {(Object.entries(MEASUREMENT_UNITS) as [MeasurementUnit, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stock quantities */}
            <div className="flex gap-4" onClick={(e) => e.preventDefault()}>
              <QtyInput label="Unidades iniciales" value={draft.quantity} onChange={(v) => set({ quantity: v })} />
              <QtyInput label="Stock mínimo" value={draft.minimumStock} onChange={(v) => set({ minimumStock: v })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Supplier tile ────────────────────────────────────────────────────────────

function SupplierTile({
  name,
  count,
  draftCount,
  onClick,
}: {
  name: string;
  count: number;
  draftCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left w-full"
    >
      <div className="flex items-center justify-between w-full">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen size={20} className="text-primary" />
        </div>
        {draftCount > 0 && (
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {draftCount} en borrador
          </span>
        )}
      </div>
      <div>
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-muted-foreground">{count} producto{count !== 1 ? 's' : ''}</p>
      </div>
    </button>
  );
}

// ─── Product browser ──────────────────────────────────────────────────────────

function ProductBrowser({
  products,
  supplier,
  initialDrafts,
  onBack,
  onImported,
  onDraftsChange,
}: {
  products: CatalogProduct[];
  supplier: string;
  initialDrafts: Record<string, ProductDraft>;
  onBack: () => void;
  onImported: (count: number) => void;
  onDraftsChange: (drafts: Record<string, ProductDraft>) => void;
}) {
  const [drafts, setDrafts]       = useState<Record<string, ProductDraft>>(initialDrafts);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState<CatalogCategory | ''>('');
  const [importing, setImporting] = useState(false);

  const selectedIds = Object.keys(drafts);

  const updateDrafts = useCallback((next: Record<string, ProductDraft>) => {
    setDrafts(next);
    onDraftsChange(next);
  }, [onDraftsChange]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.activeIngredient ?? '').toLowerCase().includes(q);
    const matchCat    = !filterCat || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const allSelected = filtered.length > 0 && filtered.every((p) => p.id in drafts);

  const toggle = (p: CatalogProduct) => {
    const next = { ...drafts };
    if (p.id in next) {
      delete next[p.id];
    } else {
      next[p.id] = makeDraft(p);
    }
    updateDrafts(next);
  };

  const setDraft = (id: string, d: ProductDraft) => updateDrafts({ ...drafts, [id]: d });

  const toggleAll = () => {
    if (allSelected) {
      const next = { ...drafts };
      filtered.forEach((p) => delete next[p.id]);
      updateDrafts(next);
    } else {
      const next = { ...drafts };
      filtered.forEach((p) => { if (!(p.id in next)) next[p.id] = makeDraft(p); });
      updateDrafts(next);
    }
  };

  const handleImport = async () => {
    const entries = products
      .filter((p) => p.id in drafts)
      .map((p) => ({ product: p, draft: drafts[p.id] }));
    setImporting(true);
    try {
      const count = await importFromCatalog(entries);
      updateDrafts({});
      onImported(count);
    } finally {
      setImporting(false);
    }
  };

  const missingPriceCount = selectedIds.filter((id) => !drafts[id].salePrice.trim()).length;

  return (
    <div className="space-y-4">
      {/* Supplier header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="font-semibold text-sm">{supplier}</p>
          <p className="text-xs text-muted-foreground">{products.length} productos disponibles</p>
        </div>
      </div>

      {/* Step guide */}
      <div className="flex items-start gap-0 rounded-xl border border-border overflow-hidden text-xs">
        {[
          { n: '1', icon: <Package size={13} />, label: 'Selecciona', desc: 'Marca los productos que quieres agregar' },
          { n: '2', icon: <Pencil size={13} />,  label: 'Configura',  desc: 'Ajusta precio, stock y unidad de cada uno' },
          { n: '3', icon: <CheckCircle2 size={13} />, label: 'Importa', desc: 'Pulsa el botón para guardarlos en tu inventario' },
        ].map((step, i) => (
          <div key={i} className={cn('flex-1 flex flex-col gap-1 px-3 py-2.5', i < 2 && 'border-r border-border')}>
            <div className="flex items-center gap-1.5 font-semibold text-foreground/70">
              <span className="w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">{step.n}</span>
              {step.icon}
              {step.label}
            </div>
            <p className="text-muted-foreground/80 leading-snug hidden sm:block">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-lg border border-border bg-background px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o principio activo…"
            className="bg-transparent text-sm flex-1 focus:outline-none"
          />
        </div>
        <select
          value={filterCat} onChange={(e) => setFilterCat(e.target.value as CatalogCategory | '')}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todas las categorías</option>
          {(Object.entries(CATALOG_CATEGORY_LABELS) as [CatalogCategory, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Stats + select-all */}
      <div className="flex items-center gap-3">
        <button onClick={toggleAll} className="text-primary hover:underline text-xs">
          {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
        <span className="text-muted-foreground text-xs">
          {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
        </span>
        {selectedIds.length > 0 && (
          <span className="ml-auto text-xs font-medium text-primary">
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
          <Filter size={20} className="opacity-40" />
          Sin resultados para ese filtro.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              draft={p.id in drafts ? drafts[p.id] : null}
              onToggle={() => toggle(p)}
              onDraftChange={(d) => setDraft(p.id, d)}
            />
          ))}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border pt-3 pb-3 space-y-2">
        {/* Missing-price warning */}
        {missingPriceCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              <span className="font-semibold">{missingPriceCount} producto{missingPriceCount !== 1 ? 's' : ''}</span> sin precio de venta — puedes importar igual y editarlo después desde el inventario.
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {selectedIds.length === 0 ? (
            <p className="text-xs text-muted-foreground flex-1 flex items-center gap-1.5">
              <Tag size={12} className="shrink-0" />
              Selecciona al menos un producto para continuar.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground flex-1">
              {selectedIds.length} producto{selectedIds.length !== 1 ? 's' : ''} listos para importar.
              {missingPriceCount === 0 && <span className="text-green-600 dark:text-green-400 font-medium"> ✓ Todos con precio</span>}
            </p>
          )}
          <Button
            disabled={selectedIds.length === 0 || importing}
            onClick={handleImport}
            className="gap-2 shrink-0"
          >
            {importing
              ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
              : <><CheckCircle2 size={14} /> Importar {selectedIds.length > 0 ? selectedIds.length : ''} producto{selectedIds.length !== 1 ? 's' : ''}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface CatalogImportPanelProps {
  onClose?: () => void;
}

export function CatalogImportPanel({ onClose }: CatalogImportPanelProps) {
  const [allProducts, setAllProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [activeSupplier, setActiveSupplier] = useState<string | null>(null);
  const [importedCount, setImportedCount]   = useState<number | null>(null);
  // Drafts keyed by supplier name
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, Record<string, ProductDraft>>>({});

  // ── Restore draft from localStorage on mount ───────────────────────────────
  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      setActiveSupplier(saved.supplier);
      // Group the flat drafts by supplier when products arrive
      // Store as-is, will be reconciled once products load
      setSupplierDrafts({ __flat__: saved.drafts } as Record<string, Record<string, ProductDraft>>);
    }
  }, []);

  useEffect(() => {
    fetchCatalogProducts()
      .then((products) => {
        setAllProducts(products);

        // Reconcile flat drafts (from localStorage) into per-supplier structure
        setSupplierDrafts((prev) => {
          const flat = (prev as Record<string, Record<string, ProductDraft>>)['__flat__'];
          if (!flat) return prev;
          const next: Record<string, Record<string, ProductDraft>> = {};
          products.forEach((p) => {
            if (p.id in flat) {
              (next[p.supplier] ??= {})[p.id] = flat[p.id];
            }
          });
          return next;
        });
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'Error al cargar el catálogo'))
      .finally(() => setLoading(false));
  }, []);

  const supplierMap = allProducts.reduce<Record<string, CatalogProduct[]>>((acc, p) => {
    (acc[p.supplier] ??= []).push(p);
    return acc;
  }, {});
  const suppliers = Object.keys(supplierMap).sort();

  const handleSupplierDraftsChange = useCallback((supplier: string, drafts: Record<string, ProductDraft>) => {
    setSupplierDrafts((prev) => {
      const next = { ...prev, [supplier]: drafts };
      // Persist to localStorage
      const allDrafts = Object.values(next).reduce((acc, d) => ({ ...acc, ...d }), {});
      saveDraft({ supplier: activeSupplier, drafts: allDrafts });
      return next;
    });
  }, [activeSupplier]);

  const handleSupplierChange = (supplier: string | null) => {
    setActiveSupplier(supplier);
    const allDrafts = Object.entries(supplierDrafts)
      .filter(([key]) => key !== '__flat__')
      .reduce((acc, [, d]) => ({ ...acc, ...d }), {});
    saveDraft({ supplier, drafts: allDrafts });
  };

  const handleImported = (count: number) => {
    setImportedCount((prev) => (prev ?? 0) + count);
    setActiveSupplier(null);
    // Clear draft for this supplier after import (others remain)
    if (activeSupplier) {
      setSupplierDrafts((prev) => {
        const next = { ...prev };
        delete next[activeSupplier];
        const allDrafts = Object.values(next).reduce((acc, d) => ({ ...acc, ...d }), {});
        if (Object.keys(allDrafts).length === 0) {
          clearDraft();
        } else {
          saveDraft({ supplier: null, drafts: allDrafts });
        }
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" /> Cargando catálogo de proveedores…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <AlertCircle size={32} className="text-red-500" />
        <p className="text-sm text-muted-foreground">{fetchError}</p>
        <p className="text-xs text-muted-foreground">Verifica tu conexión a internet.</p>
      </div>
    );
  }

  if (allProducts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <BookOpen size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground text-sm">El catálogo de proveedores aún no tiene productos.</p>
        <p className="text-xs text-muted-foreground">Un administrador master puede añadirlos desde Admin → Catálogo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {importedCount !== null && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={15} className="shrink-0" />
          {importedCount} producto{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} a tu inventario.
          {onClose && (
            <button onClick={onClose} className="ml-auto hover:opacity-70">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {activeSupplier ? (
        <ProductBrowser
          supplier={activeSupplier}
          products={supplierMap[activeSupplier] ?? []}
          initialDrafts={supplierDrafts[activeSupplier] ?? {}}
          onBack={() => handleSupplierChange(null)}
          onImported={handleImported}
          onDraftsChange={(d) => handleSupplierDraftsChange(activeSupplier, d)}
        />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Selecciona un proveedor</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''} · {allProducts.length} productos en total
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map((supplier) => (
              <SupplierTile
                key={supplier}
                name={supplier}
                count={supplierMap[supplier].length}
                draftCount={Object.keys(supplierDrafts[supplier] ?? {}).length}
                onClick={() => handleSupplierChange(supplier)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen, CheckCircle2, AlertCircle, Loader2,
  Search, Filter, X, ChevronDown, ChevronUp, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { db, getClinicId } from '@/lib/db/database';
import type { SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal } from '@/types/inventory';
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

// ─── Dexie import helper ──────────────────────────────────────────────────────

async function importFromCatalog(selected: CatalogProduct[]): Promise<number> {
  if (selected.length === 0) return 0;
  const now = Date.now();
  const clinicId = await getClinicId();
  const items: ProductLocal[] = selected.map((p) => ({
    id:                  crypto.randomUUID(),
    clinicId,
    name:                p.name,
    category:            CATALOG_TO_PRODUCT_CATEGORY[p.category],
    supplier:            p.supplier,
    description:         p.description || undefined,
    activeIngredient:    p.activeIngredient || undefined,
    administrationRoute: p.administrationRoute || undefined,
    registrationNumber:  p.registrationNumber || undefined,
    currentStock:        0,
    minimumStock:        0,
    unit:                'unit' as const,
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

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  selected,
  onToggle,
}: {
  product: CatalogProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(
    product.description ||
    product.administrationRoute ||
    (product.presentations && product.presentations.length > 0)
  );

  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30',
      )}
    >
      <input
        type="checkbox" checked={selected} onChange={onToggle}
        className="mt-0.5 accent-primary shrink-0"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-sm leading-tight">{product.name}</p>
        {product.activeIngredient && (
          <p className="text-xs text-muted-foreground">{product.activeIngredient}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
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

        {hasDetails && (
          <div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? 'Ocultar detalles' : 'Ver detalles'}
            </button>
            {expanded && (
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground border-t border-border pt-2">
                {product.description && (
                  <p><span className="font-medium text-foreground/80">Características: </span>{product.description}</p>
                )}
                {product.administrationRoute && (
                  <p><span className="font-medium text-foreground/80">Vía de administración: </span>{product.administrationRoute}</p>
                )}
                {product.presentations && product.presentations.length > 0 && (
                  <p><span className="font-medium text-foreground/80">Presentaciones: </span>{product.presentations.join(' · ')}</p>
                )}
                {product.registrationNumber && (
                  <p className="font-mono text-[10px]">{product.registrationNumber}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

// ─── Supplier tile ────────────────────────────────────────────────────────────

function SupplierTile({
  name,
  count,
  onClick,
}: {
  name: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left w-full"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <BookOpen size={20} className="text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-muted-foreground">{count} producto{count !== 1 ? 's' : ''}</p>
      </div>
    </button>
  );
}

// ─── Product browser (within a supplier) ─────────────────────────────────────

function ProductBrowser({
  products,
  supplier,
  onBack,
  onImported,
}: {
  products: CatalogProduct[];
  supplier: string;
  onBack: () => void;
  onImported: (count: number) => void;
}) {
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState<CatalogCategory | ''>('');
  const [importing, setImporting] = useState(false);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.activeIngredient ?? '').toLowerCase().includes(q);
    const matchCat    = !filterCat || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((p) => s.delete(p.id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((p) => s.add(p.id)); return s; });
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleImport = async () => {
    const toImport = products.filter((p) => selected.has(p.id));
    setImporting(true);
    try {
      const count = await importFromCatalog(toImport);
      setSelected(new Set());
      onImported(count);
    } finally {
      setImporting(false);
    }
  };

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
        {selected.size > 0 && (
          <span className="ml-auto text-xs font-medium text-primary">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
          <Filter size={16} /> Sin resultados.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </div>
      )}

      {/* Import action */}
      <div className="flex items-center gap-3 pt-2 border-t border-border sticky bottom-0 bg-background/95 backdrop-blur-sm py-3">
        <p className="text-xs text-muted-foreground flex-1">
          Se agregan con stock 0. Edita precio y stock desde Inventario.
        </p>
        <Button
          disabled={selected.size === 0 || importing}
          onClick={handleImport}
          className="gap-2 shrink-0"
        >
          {importing
            ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
            : <><CheckCircle2 size={14} /> Importar {selected.size > 0 ? selected.size : ''} seleccionado{selected.size !== 1 ? 's' : ''}</>
          }
        </Button>
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

  useEffect(() => {
    fetchCatalogProducts()
      .then(setAllProducts)
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'Error al cargar el catálogo'))
      .finally(() => setLoading(false));
  }, []);

  // Group products by supplier
  const supplierMap = allProducts.reduce<Record<string, CatalogProduct[]>>((acc, p) => {
    (acc[p.supplier] ??= []).push(p);
    return acc;
  }, {});
  const suppliers = Object.keys(supplierMap).sort();

  const handleImported = (count: number) => {
    setImportedCount((prev) => (prev ?? 0) + count);
    // Return to supplier list so user can import from other suppliers
    setActiveSupplier(null);
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
      {/* Success banner */}
      {importedCount !== null && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={15} className="shrink-0" />
          {importedCount} producto{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} a tu inventario.
          {onClose && (
            <button onClick={onClose} className="ml-auto text-green-700 dark:text-green-300 hover:opacity-70">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {activeSupplier ? (
        // ── Product browser for selected supplier ──────────────────────────
        <ProductBrowser
          supplier={activeSupplier}
          products={supplierMap[activeSupplier] ?? []}
          onBack={() => setActiveSupplier(null)}
          onImported={handleImported}
        />
      ) : (
        // ── Supplier selection ─────────────────────────────────────────────
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Selecciona un proveedor</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''} disponible{suppliers.length !== 1 ? 's' : ''} · {allProducts.length} productos en total
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map((supplier) => (
              <SupplierTile
                key={supplier}
                name={supplier}
                count={supplierMap[supplier].length}
                onClick={() => setActiveSupplier(supplier)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

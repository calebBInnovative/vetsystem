'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useProducts, updateProduct, deleteProduct } from '@/hooks/useInventory';
import { ProductoCard } from '@/components/inventory/ProductCard';
import { ProductoRow } from '@/components/inventory/ProductRow';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { AlertasStock } from '@/components/inventory/StockAlerts';
import { BuscadorPacientes } from '@/components/patients/PatientSearch';
import { Button } from '@/components/ui/button';
import {
  PRODUCT_CATEGORIES, MEASUREMENT_UNITS,
  type ProductCategory, type MeasurementUnit,
} from '@/types/inventory';
import type { ProductLocal } from '@/types/inventory';
import {
  Plus, Package, Loader2, LayoutList, LayoutGrid,
  Pencil, X, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Draft types ──────────────────────────────────────────────────────────────

interface ProductDraft {
  id:           string;
  name:         string;
  category:     ProductCategory;
  salePrice:    string;
  costPrice:    string;
  currentStock: string;
  minimumStock: string;
  unit:         MeasurementUnit;
  active:       boolean;
  changed:      boolean;
  nameError?:   string;
}

const CATEGORY_OPTS = Object.entries(PRODUCT_CATEGORIES).map(([v, { label, emoji }]) => ({ value: v, label: `${emoji} ${label}` }));
const UNIT_OPTS     = Object.entries(MEASUREMENT_UNITS).map(([v, label]) => ({ value: v, label }));

function toDraft(p: ProductLocal): ProductDraft {
  return {
    id:           p.id,
    name:         p.name,
    category:     p.category,
    salePrice:    p.salePrice  != null ? String(p.salePrice)  : '',
    costPrice:    p.costPrice  != null ? String(p.costPrice)  : '',
    currentStock: String(p.currentStock),
    minimumStock: String(p.minimumStock),
    unit:         p.unit,
    active:       p.active,
    changed:      false,
  };
}

// ─── Cell components ──────────────────────────────────────────────────────────

const BASE = 'w-full px-2 py-1.5 text-sm rounded border bg-transparent focus:outline-none focus:ring-1 transition-colors';
const OK   = 'border-transparent hover:border-border focus:border-primary focus:ring-primary/20';
const ERR  = 'border-red-400 bg-red-50/40 dark:bg-red-950/20 focus:ring-red-400/20';

function TCell({ value, error, placeholder, type = 'text', onChange }: {
  value: string; error?: string; placeholder?: string;
  type?: 'text' | 'number'; onChange: (v: string) => void;
}) {
  return (
    <div>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(BASE, error ? ERR : OK)}
      />
      {error && <p className="text-[10px] text-red-500 mt-0.5 px-0.5">{error}</p>}
    </div>
  );
}

function SCell({ value, options, onChange }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className={cn(BASE, OK, 'cursor-pointer')}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!value)}
      className={cn('w-9 h-5 rounded-full transition-colors relative', value ? 'bg-primary' : 'bg-muted-foreground/30')}
    >
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', value ? 'left-4' : 'left-0.5')} />
    </button>
  );
}

// ─── Editable table ───────────────────────────────────────────────────────────

function ProductEditTable({ drafts, onChange }: { drafts: ProductDraft[]; onChange: (d: ProductDraft[]) => void }) {
  const update = useCallback((idx: number, patch: Partial<ProductDraft>) => {
    onChange(drafts.map((d, i) => {
      if (i !== idx) return d;
      const next = { ...d, ...patch, changed: true };
      next.nameError = next.name.trim() ? undefined : 'Requerido';
      return next;
    }));
  }, [drafts, onChange]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/60 border-b border-border text-left">
            <th className="px-2 py-2.5 w-6" />
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[160px]">Nombre <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[155px]">Categoría</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[105px]">Precio venta</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[105px]">Precio costo</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[85px]">Stock</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[85px]">Mínimo</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[110px]">Unidad</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[60px] text-center">Activo</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d, idx) => (
            <tr
              key={d.id}
              className={cn(
                'border-b border-border last:border-0 align-top',
                d.nameError ? 'bg-red-50/30 dark:bg-red-950/10'
                  : d.changed ? 'bg-amber-50/30 dark:bg-amber-950/10'
                  : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
              )}
            >
              <td className="px-2 py-2 text-center">
                {d.nameError ? (
                  <AlertCircle size={12} className="text-red-500 mx-auto" />
                ) : d.changed ? (
                  <span className="block w-1.5 h-1.5 rounded-full bg-amber-500 mx-auto mt-1" />
                ) : null}
              </td>
              <td className="px-2 py-1.5 min-w-[160px]">
                <TCell value={d.name} error={d.nameError} placeholder="Nombre" onChange={(v) => update(idx, { name: v })} />
              </td>
              <td className="px-2 py-1.5">
                <SCell value={d.category} options={CATEGORY_OPTS} onChange={(v) => update(idx, { category: v as ProductCategory })} />
              </td>
              <td className="px-2 py-1.5">
                <TCell value={d.salePrice} placeholder="—" type="number" onChange={(v) => update(idx, { salePrice: v })} />
              </td>
              <td className="px-2 py-1.5">
                <TCell value={d.costPrice} placeholder="—" type="number" onChange={(v) => update(idx, { costPrice: v })} />
              </td>
              <td className="px-2 py-1.5">
                <TCell value={d.currentStock} placeholder="0" type="number" onChange={(v) => update(idx, { currentStock: v })} />
              </td>
              <td className="px-2 py-1.5">
                <TCell value={d.minimumStock} placeholder="0" type="number" onChange={(v) => update(idx, { minimumStock: v })} />
              </td>
              <td className="px-2 py-1.5">
                <SCell value={d.unit} options={UNIT_OPTS} onChange={(v) => update(idx, { unit: v as MeasurementUnit })} />
              </td>
              <td className="px-2 py-1.5 text-center">
                <Toggle value={d.active} onChange={(v) => update(idx, { active: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type View = 'lista' | 'cards';

export default function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoria,   setCategoria]   = useState<ProductCategory | undefined>();
  const [view,        setView]        = useState<View>('lista');
  const [editMode,       setEditMode]       = useState(false);
  const [drafts,         setDrafts]         = useState<ProductDraft[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<ProductLocal | null>(null);
  const [deleting,       setDeleting]       = useState(false);

  const { products, loading } = useProducts(searchQuery, categoria);

  const changedDrafts = drafts.filter((d) => d.changed);
  const errorDrafts   = drafts.filter((d) => d.nameError);
  const canSave       = changedDrafts.length > 0 && errorDrafts.length === 0;

  function enterEditMode() {
    setDrafts(products.map(toDraft));
    setEditMode(true);
  }

  function exitEditMode() {
    setDrafts([]);
    setEditMode(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" eliminado del inventario`);
      setDeleteTarget(null);
    } catch {
      toast.error('Error al eliminar el producto');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await Promise.all(
        changedDrafts.map((d) =>
          updateProduct(d.id, {
            name:         d.name.trim(),
            category:     d.category,
            salePrice:    d.salePrice  !== '' ? parseFloat(d.salePrice)  : undefined,
            costPrice:    d.costPrice  !== '' ? parseFloat(d.costPrice)  : undefined,
            currentStock: parseFloat(d.currentStock) || 0,
            minimumStock: parseFloat(d.minimumStock) || 0,
            unit:         d.unit,
            active:       d.active,
          }),
        ),
      );
      toast.success(`${changedDrafts.length} producto${changedDrafts.length !== 1 ? 's' : ''} actualizado${changedDrafts.length !== 1 ? 's' : ''}`);
      exitEditMode();
    } catch {
      toast.error('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Delete confirmation dialog ───────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar producto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminará <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span> del inventario.
            Esta acción no afecta el historial de ventas ni las finanzas.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Cargando...' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editMode && (
            <>
              <Button variant="outline" className="gap-2" onClick={enterEditMode} disabled={loading || products.length === 0}>
                <Pencil size={15} /> Editar lista
              </Button>
              <Link href="/inventory/new">
                <Button className="gap-2">
                  <Plus size={17} />
                  <span className="hidden sm:inline">Nuevo</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Edit mode ───────────────────────────────────────────────────────── */}
      {editMode && (
        <>
          {/* Sticky action bar */}
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b border-border">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-foreground">Edición en lote</span>
                {changedDrafts.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                    {changedDrafts.length} cambio{changedDrafts.length !== 1 ? 's' : ''} pendiente{changedDrafts.length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">Sin cambios aún</span>
                )}
                {errorDrafts.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
                    <AlertCircle size={11} /> {errorDrafts.length} con error
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exitEditMode} disabled={saving} className="gap-1.5">
                  <X size={14} /> Cancelar
                </Button>
                <Button size="sm" disabled={!canSave || saving} onClick={handleSave} className="gap-1.5 min-w-[130px]">
                  {saving
                    ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Guardando…</>
                    : `Guardar ${changedDrafts.length > 0 ? changedDrafts.length : ''} cambio${changedDrafts.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>

          {/* Editable table */}
          <ProductEditTable drafts={drafts} onChange={setDrafts} />
        </>
      )}

      {/* ── Normal mode ─────────────────────────────────────────────────────── */}
      {!editMode && (
        <>
          <AlertasStock />

          <BuscadorPacientes
            onBuscar={setSearchQuery}
            placeholder="Buscar producto, proveedor..."
          />

          {/* Filtro categoría + toggle vista */}
          <div className="flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0">
              <button
                onClick={() => setCategoria(undefined)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                  !categoria ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                Todos
              </button>
              {(Object.entries(PRODUCT_CATEGORIES) as [ProductCategory, { label: string; emoji: string }][]).map(
                ([cat, { label, emoji }]) => (
                  <button
                    key={cat}
                    onClick={() => setCategoria(cat === categoria ? undefined : cat)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                      categoria === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{emoji}</span>
                    {label}
                  </button>
                ),
              )}
            </div>
            <div className="flex shrink-0 rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setView('lista')} title="Vista lista"
                className={cn('p-2 transition-colors', view === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
              >
                <LayoutList size={16} />
              </button>
              <button
                onClick={() => setView('cards')} title="Vista cards"
                className={cn('p-2 transition-colors', view === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {/* Contenido */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <EmptyState searchQuery={searchQuery} categoria={categoria} />
          ) : view === 'lista' ? (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {products.map((p) => (
                <ProductoRow key={p.id} producto={p} onDelete={() => setDeleteTarget(p)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => <ProductoCard key={p.id} producto={p} />)}
            </div>
          )}
        </>
      )}

    </div>
  );
}

function EmptyState({ searchQuery, categoria }: { searchQuery: string; categoria?: string }) {
  if (searchQuery || categoria) {
    return (
      <div className="text-center py-24 space-y-2">
        <p className="text-4xl">🔍</p>
        <p className="font-semibold">Sin resultados</p>
        <p className="text-sm text-muted-foreground">No encontramos productos con ese criterio</p>
      </div>
    );
  }
  return (
    <div className="text-center py-24 space-y-3">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Package className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-lg">Inventario vacío</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Agrega medicamentos, vacunas y productos para comenzar
      </p>
      <div className="pt-2">
        <Link href="/inventory/new">
          <Button size="lg" className="gap-2"><Plus size={17} /> Agregar primer producto</Button>
        </Link>
      </div>
    </div>
  );
}

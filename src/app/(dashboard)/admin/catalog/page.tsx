'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, ArrowLeft, Loader2, Package,
  AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCatalogProducts, addCatalogProduct,
  updateCatalogProduct, deleteCatalogProduct,
} from '@/lib/firebase/catalog';
import { seedRiverfarmaPets, seedRiverfarmaAves } from '@/lib/firebase/seedCatalog';
import type { CatalogProduct, CatalogCategory, CatalogDosageForm } from '@/types/catalog';
import {
  CATALOG_CATEGORY_LABELS, CATALOG_DOSAGE_FORM_LABELS,
  CATALOG_CATEGORY_COLORS,
} from '@/types/catalog';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = Object.entries(CATALOG_CATEGORY_LABELS) as [CatalogCategory, string][];
const DOSAGE_FORMS = Object.entries(CATALOG_DOSAGE_FORM_LABELS) as [CatalogDosageForm, string][];

const ALL_SPECIES = ['dogs', 'cats', 'roosters', 'birds', 'cattle', 'horses', 'pigs', 'rabbits'];
const SPECIES_LABELS: Record<string, string> = {
  dogs: 'Perros', cats: 'Gatos', roosters: 'Gallos',
  birds: 'Aves', cattle: 'Bovinos', horses: 'Equinos',
  pigs: 'Cerdos', rabbits: 'Conejos',
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  activeIngredient: string;
  category: CatalogCategory | '';
  dosageForm: CatalogDosageForm | '';
  presentations: string;   // comma-separated
  supplier: string;
  registrationNumber: string;
  species: string[];
  description: string;
  administrationRoute: string;
}

const EMPTY_FORM: FormState = {
  name: '', activeIngredient: '', category: '', dosageForm: '',
  presentations: '', supplier: '', registrationNumber: '', species: [],
  description: '', administrationRoute: '',
};

function formFromProduct(p: CatalogProduct): FormState {
  return {
    name: p.name,
    activeIngredient: p.activeIngredient ?? '',
    category: p.category,
    dosageForm: p.dosageForm ?? '',
    presentations: (p.presentations ?? []).join(', '),
    supplier: p.supplier,
    registrationNumber: p.registrationNumber ?? '',
    species: p.species ?? [],
    description: p.description ?? '',
    administrationRoute: p.administrationRoute ?? '',
  };
}

function parsePresentations(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─── Product form dialog ──────────────────────────────────────────────────────

function ProductFormDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: FormState;
  onSave: (data: Omit<CatalogProduct, 'id'>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = <K extends keyof FormState>(key: K) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    }
  );

  const toggleSpecies = (s: string) => {
    setForm((prev) => ({
      ...prev,
      species: prev.species.includes(s)
        ? prev.species.filter((x) => x !== s)
        : [...prev.species, s],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category || !form.supplier.trim()) {
      setError('Nombre, categoría y proveedor son obligatorios.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const now = Date.now();
      await onSave({
        name: form.name.trim(),
        activeIngredient: form.activeIngredient.trim() || undefined,
        category: form.category as CatalogCategory,
        dosageForm: (form.dosageForm as CatalogDosageForm) || undefined,
        presentations: parsePresentations(form.presentations),
        supplier: form.supplier.trim(),
        registrationNumber: form.registrationNumber.trim() || undefined,
        species: form.species.length > 0 ? form.species : undefined,
        description: form.description.trim() || undefined,
        administrationRoute: form.administrationRoute.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const INPUT = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-base">
            {initial === EMPTY_FORM ? 'Agregar producto al catálogo' : 'Editar producto'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Nombre del producto <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={field('name')} placeholder="Ej: Avierizol-Enro" className={INPUT} required />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Principio activo</label>
              <input value={form.activeIngredient} onChange={field('activeIngredient')} placeholder="Ej: Enrofloxacina" className={INPUT} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Categoría <span className="text-red-500">*</span></label>
              <select value={form.category} onChange={field('category')} className={INPUT} required>
                <option value="">— Seleccionar —</option>
                {CATEGORIES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Forma farmacéutica</label>
              <select value={form.dosageForm} onChange={field('dosageForm')} className={INPUT}>
                <option value="">— Opcional —</option>
                {DOSAGE_FORMS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Proveedor <span className="text-red-500">*</span></label>
              <input value={form.supplier} onChange={field('supplier')} placeholder="Ej: Riverfarma" className={INPUT} required />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Núm. de registro</label>
              <input value={form.registrationNumber} onChange={field('registrationNumber')} placeholder="Ej: Q-0524-076" className={INPUT} />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Presentaciones (separadas por coma)</label>
              <input value={form.presentations} onChange={field('presentations')} placeholder="Ej: 10ml, 25ml, 50ml, 100ml" className={INPUT} />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Vía de administración</label>
              <input value={form.administrationRoute} onChange={field('administrationRoute')} placeholder="Ej: Intramuscular o subcutánea" className={INPUT} />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1">Características / descripción</label>
              <textarea
                value={form.description} onChange={field('description')}
                placeholder="Breve descripción clínica del producto"
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-2">Especies</label>
              <div className="flex flex-wrap gap-2">
                {ALL_SPECIES.map((s) => (
                  <button
                    key={s} type="button"
                    onClick={() => toggleSpecies(s)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      form.species.includes(s)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {SPECIES_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1 gap-2" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminCatalogPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterCategory, setFilterCategory] = useState<CatalogCategory | ''>('');
  const [seeding, setSeeding] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const isMaster = session?.role === 'master';

  const load = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const data = await fetchCatalogProducts();
      setProducts(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Error al cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <AlertCircle size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground">Acceso solo para administradores master.</p>
        <Button variant="outline" onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }

  const handleSeedPets = async () => {
    setSeeding('pets'); setSeedMsg(null);
    try {
      const result = await seedRiverfarmaPets();
      if (result.skipped) {
        setSeedMsg('Los productos de Riverfarma Pets ya estaban cargados.');
      } else {
        setSeedMsg(`✓ ${result.added} productos de Riverfarma Pets agregados al catálogo.`);
        await load();
      }
    } catch (err) {
      setSeedMsg(`Error: ${err instanceof Error ? err.message : 'No se pudo cargar.'}`);
    } finally {
      setSeeding(null);
    }
  };

  const handleSeedAves = async () => {
    setSeeding('aves'); setSeedMsg(null);
    try {
      const result = await seedRiverfarmaAves();
      if (result.skipped) {
        setSeedMsg('Los productos de Riverfarma Aves ya estaban cargados.');
      } else {
        setSeedMsg(`✓ ${result.added} productos de Riverfarma Aves agregados al catálogo.`);
        await load();
      }
    } catch (err) {
      setSeedMsg(`Error: ${err instanceof Error ? err.message : 'No se pudo cargar.'}`);
    } finally {
      setSeeding(null);
    }
  };

  const handleAdd = async (data: Omit<CatalogProduct, 'id'>) => {
    await addCatalogProduct(data);
    await load();
    setShowAddDialog(false);
  };

  const handleEdit = async (data: Omit<CatalogProduct, 'id'>) => {
    if (!editingProduct) return;
    await updateCatalogProduct(editingProduct.id, data);
    await load();
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto del catálogo público? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    try {
      await deleteCatalogProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const suppliers = [...new Set(products.map((p) => p.supplier))].sort();
  const filtered = products.filter((p) =>
    (!filterSupplier || p.supplier === filterSupplier) &&
    (!filterCategory || p.category === filterCategory)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button
          onClick={() => router.push('/admin')}
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Catálogo de proveedores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Productos públicos que cualquier clínica puede importar a su inventario.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" disabled={!!seeding} onClick={handleSeedPets}>
            {seeding === 'pets'
              ? <><Loader2 size={14} className="animate-spin" /> Cargando…</>
              : '⬇ Riverfarma Pets'}
          </Button>
          <Button variant="outline" className="gap-2" disabled={!!seeding} onClick={handleSeedAves}>
            {seeding === 'aves'
              ? <><Loader2 size={14} className="animate-spin" /> Cargando…</>
              : '⬇ Riverfarma Aves'}
          </Button>
          <Button className="gap-2" onClick={() => setShowAddDialog(true)}>
            <Plus size={15} /> Agregar producto
          </Button>
        </div>
      </div>

      {seedMsg && (
        <div className={cn(
          'flex items-center gap-2 text-sm rounded-lg px-4 py-3',
          seedMsg.startsWith('✓') || seedMsg.includes('ya estaban')
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
        )}>
          {seedMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as CatalogCategory | '')}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" /> Cargando catálogo…
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <AlertCircle size={32} className="text-red-500" />
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Package size={40} className="text-muted-foreground" />
          <p className="text-muted-foreground">No hay productos en el catálogo.</p>
          <Button className="gap-2" onClick={() => setShowAddDialog(true)}>
            <Plus size={14} /> Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Producto</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Categoría</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Forma</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Proveedor</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Especies</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr
                  key={p.id}
                  className={cn('border-b border-border last:border-0', idx % 2 === 0 ? 'bg-background' : 'bg-muted/10')}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium leading-tight">{p.name}</p>
                    {p.activeIngredient && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.activeIngredient}</p>
                    )}
                    {p.registrationNumber && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{p.registrationNumber}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CATALOG_CATEGORY_COLORS[p.category])}>
                      {CATALOG_CATEGORY_LABELS[p.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                    {p.dosageForm ? CATALOG_DOSAGE_FORM_LABELS[p.dosageForm] : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.supplier}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {p.species && p.species.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.species.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                            {SPECIES_LABELS[s] ?? s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {showAddDialog && (
        <ProductFormDialog
          initial={EMPTY_FORM}
          onSave={handleAdd}
          onClose={() => setShowAddDialog(false)}
        />
      )}
      {editingProduct && (
        <ProductFormDialog
          initial={formFromProduct(editingProduct)}
          onSave={handleEdit}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

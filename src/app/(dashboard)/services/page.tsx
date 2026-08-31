'use client';

import { useState, useCallback } from 'react';
import {
  useServices, createService, updateService,
  toggleServicioActivo, deleteService, type ServiceInput,
} from '@/hooks/useServices';
import { SERVICE_CATEGORIES, type ServiceCategory, type ServiceLocal } from '@/types/service';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ExportMenu } from '@/components/common/ExportMenu';
import { getServicesExportData } from '@/lib/export/modules';
import { useAuth } from '@/contexts/AuthContext';

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

const CATEGORIAS_LIST = Object.entries(SERVICE_CATEGORIES) as [ServiceCategory, { label: string; emoji: string; color: string }][];

// ─── Draft types ──────────────────────────────────────────────────────────────

interface ServiceDraft {
  id:          string;
  name:        string;
  category:    ServiceCategory;
  price:       string;
  description: string;
  active:      boolean;
  changed:     boolean;
  nameError?:  string;
  priceError?: string;
}

function toDraft(s: ServiceLocal): ServiceDraft {
  return {
    id:          s.id,
    name:        s.name,
    category:    s.category,
    price:       String(s.price),
    description: s.description ?? '',
    active:      s.active,
    changed:     false,
  };
}

// ─── Edit-mode cells ──────────────────────────────────────────────────────────

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
        type="text"
        inputMode={type === 'number' ? 'numeric' : 'text'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(BASE, error ? ERR : OK)} />
      {error && <p className="text-[10px] text-red-500 mt-0.5 px-0.5">{error}</p>}
    </div>
  );
}

// ─── Editable service table ───────────────────────────────────────────────────

function ServiceEditTable({ drafts, onChange }: { drafts: ServiceDraft[]; onChange: (d: ServiceDraft[]) => void }) {
  const update = useCallback((idx: number, patch: Partial<ServiceDraft>) => {
    onChange(drafts.map((d, i) => {
      if (i !== idx) return d;
      const next = { ...d, ...patch, changed: true };
      next.nameError  = next.name.trim()        ? undefined : 'Requerido';
      next.priceError = Number(next.price) > 0  ? undefined : 'Mayor que 0';
      return next;
    }));
  }, [drafts, onChange]);

  const catOpts = CATEGORIAS_LIST.map(([v, { label, emoji }]) => ({ value: v, label: `${emoji} ${label}` }));

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/60 border-b border-border text-left">
            <th className="px-2 py-2.5 w-6" />
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[180px]">Nombre <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[160px]">Categoría</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[110px]">Precio (C$) <span className="text-red-500">*</span></th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[220px]">Descripción</th>
            <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[60px] text-center">Activo</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d, idx) => {
            const hasError = d.nameError || d.priceError;
            return (
              <tr
                key={d.id}
                className={cn(
                  'border-b border-border last:border-0 align-top',
                  hasError ? 'bg-red-50/30 dark:bg-red-950/10'
                    : d.changed ? 'bg-amber-50/30 dark:bg-amber-950/10'
                    : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                )}
              >
                <td className="px-2 py-2 text-center">
                  {hasError ? (
                    <AlertCircle size={12} className="text-red-500 mx-auto" />
                  ) : d.changed ? (
                    <span className="block w-1.5 h-1.5 rounded-full bg-amber-500 mx-auto mt-1" />
                  ) : null}
                </td>
                <td className="px-2 py-1.5">
                  <TCell value={d.name} error={d.nameError} placeholder="Nombre" onChange={(v) => update(idx, { name: v })} />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={d.category}
                    onChange={(e) => update(idx, { category: e.target.value as ServiceCategory })}
                    className={cn(BASE, OK, 'cursor-pointer')}
                  >
                    {catOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <TCell value={d.price} error={d.priceError} placeholder="0" type="number" onChange={(v) => update(idx, { price: v })} />
                </td>
                <td className="px-2 py-1.5">
                  <TCell value={d.description} placeholder="Opcional" onChange={(v) => update(idx, { description: v })} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => update(idx, { active: !d.active })}
                    className={cn('w-9 h-5 rounded-full transition-colors relative', d.active ? 'bg-primary' : 'bg-muted-foreground/30')}
                  >
                    <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', d.active ? 'left-4' : 'left-0.5')} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Inline create/edit form ──────────────────────────────────────────────────

interface ServicioFormProps {
  inicial?: ServiceLocal;
  onGuardar: (input: ServiceInput) => Promise<void>;
  onCancelar: () => void;
}

function ServicioForm({ inicial, onGuardar, onCancelar }: ServicioFormProps) {
  const [nombre,      setNombre]      = useState(inicial?.name        ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.description ?? '');
  const [categoria,   setCategoria]   = useState<ServiceCategory>(inicial?.category ?? 'consultation');
  const [precio,      setPrecio]      = useState(String(inicial?.price ?? ''));
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState('');

  async function handleGuardar() {
    if (!nombre.trim())      { setError('El nombre es requerido'); return; }
    if (Number(precio) <= 0) { setError('Ingresa un precio válido'); return; }
    setGuardando(true); setError('');
    try {
      await onGuardar({ name: nombre, description: descripcion, category: categoria, price: Number(precio) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-primary/30 p-4 space-y-3">
      <p className="text-sm font-semibold">{inicial ? 'Editar servicio' : 'Nuevo servicio'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Consulta General, Castración…"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Categoría *</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as ServiceCategory)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {CATEGORIAS_LIST.map(([key, info]) => <option key={key} value={key}>{info.emoji} {info.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Precio (C$) *</label>
          <input type="text" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Descripción (opcional)</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción breve del servicio"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
        <Button size="sm" onClick={handleGuardar} disabled={guardando}>
          {inicial ? 'Guardar cambios' : 'Agregar servicio'}
        </Button>
      </div>
    </div>
  );
}

// ─── Normal-mode row ──────────────────────────────────────────────────────────

interface ServicioRowProps {
  servicio: ServiceLocal;
  onEditar: () => void;
}

function ServicioRow({ servicio, onEditar }: ServicioRowProps) {
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [precioTmp,      setPrecioTmp]      = useState(String(servicio.price));
  const [eliminando,     setEliminando]     = useState(false);
  const cat = SERVICE_CATEGORIES[servicio.category];

  async function guardarPrecio() {
    const n = Number(precioTmp);
    if (n > 0 && n !== servicio.price) await updateService(servicio.id, { price: n });
    setEditandoPrecio(false);
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar "${servicio.name}"?`)) return;
    setEliminando(true);
    await deleteService(servicio.id);
  }

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 transition-opacity', !servicio.active && 'opacity-50')}>
      <span className={cn('shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium hidden sm:inline', cat.color)}>
        {cat.emoji} {cat.label}
      </span>
      <span className="shrink-0 text-lg sm:hidden">{cat.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{servicio.name}</p>
        {servicio.description && <p className="text-xs text-muted-foreground truncate">{servicio.description}</p>}
      </div>
      <div className="shrink-0">
        {editandoPrecio ? (
          <div className="flex items-center gap-1">
            <input autoFocus type="text" inputMode="numeric" value={precioTmp}
              onChange={(e) => setPrecioTmp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarPrecio(); if (e.key === 'Escape') setEditandoPrecio(false); }}
              className="w-20 rounded-lg border border-primary px-2 py-1 text-sm text-right focus:outline-none" />
            <button onClick={guardarPrecio} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
            <button onClick={() => setEditandoPrecio(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => { setPrecioTmp(String(servicio.price)); setEditandoPrecio(true); }}
            className="text-sm font-semibold hover:text-primary transition-colors group flex items-center gap-1" title="Clic para editar precio">
            {fmt(servicio.price)}
            <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}
      </div>
      <button onClick={() => toggleServicioActivo(servicio.id)} title={servicio.active ? 'Desactivar' : 'Activar'}
        className={cn('shrink-0 w-10 h-5 rounded-full transition-colors relative', servicio.active ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', servicio.active ? 'left-5' : 'left-0.5')} />
      </button>
      <button onClick={onEditar} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={15} /></button>
      <button onClick={handleEliminar} disabled={eliminando} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const { session } = useAuth();
  const { services, loading } = useServices();

  // Normal-mode state
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando,    setEditando]    = useState<ServiceLocal | null>(null);
  const [filtroCat,   setFiltroCat]   = useState<ServiceCategory | 'todas'>('todas');
  const [soloActivos, setSoloActivos] = useState(false);

  // Edit-mode state
  const [editMode, setEditMode] = useState(false);
  const [drafts,   setDrafts]   = useState<ServiceDraft[]>([]);
  const [saving,   setSaving]   = useState(false);

  const changedDrafts = drafts.filter((d) => d.changed);
  const errorDrafts   = drafts.filter((d) => d.nameError || d.priceError);
  const canSave       = changedDrafts.length > 0 && errorDrafts.length === 0;

  function enterEditMode() {
    setDrafts(services.map(toDraft));
    setEditMode(true);
  }

  function exitEditMode() {
    setDrafts([]);
    setEditMode(false);
  }

  async function handleSaveBatch() {
    if (!canSave) return;
    setSaving(true);
    try {
      await Promise.all(
        changedDrafts.map((d) =>
          updateService(d.id, {
            name:        d.name.trim(),
            category:    d.category,
            price:       parseFloat(d.price),
            description: d.description.trim() || undefined,
            active:      d.active,
          }),
        ),
      );
      toast.success(`${changedDrafts.length} servicio${changedDrafts.length !== 1 ? 's' : ''} actualizado${changedDrafts.length !== 1 ? 's' : ''}`);
      exitEditMode();
    } catch {
      toast.error('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  const filtrados = services.filter((s) => {
    if (soloActivos && !s.active) return false;
    if (filtroCat !== 'todas' && s.category !== filtroCat) return false;
    return true;
  });

  const porCategoria = filtrados.reduce<Record<string, ServiceLocal[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  async function handleCrear(input: ServiceInput) {
    await createService(input);
    setMostrarForm(false);
  }

  async function handleEditar(input: ServiceInput) {
    if (!editando) return;
    await updateService(editando.id, input);
    setEditando(null);
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Servicios</h1>
          <p className="text-sm text-muted-foreground">
            Define los servicios con sus precios. Se pueden agregar en un clic durante la consulta.
          </p>
        </div>
        {!editMode && (
          <div className="flex items-center gap-2 shrink-0">
            <ExportMenu
              label="Servicios"
              filename="servicios"
              getData={getServicesExportData}
              clinicName={session?.clinicName}
            />
            <Button variant="outline" className="gap-1.5" onClick={enterEditMode} disabled={loading || services.length === 0}>
              <Pencil size={15} /> Editar lista
            </Button>
            <Button onClick={() => { setMostrarForm(true); setEditando(null); }} className="gap-1.5">
              <Plus size={15} /> Nuevo servicio
            </Button>
          </div>
        )}
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
                <Button size="sm" disabled={!canSave || saving} onClick={handleSaveBatch} className="gap-1.5 min-w-[130px]">
                  {saving
                    ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Guardando…</>
                    : `Guardar ${changedDrafts.length > 0 ? changedDrafts.length : ''} cambio${changedDrafts.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>

          <ServiceEditTable drafts={drafts} onChange={setDrafts} />
        </>
      )}

      {/* ── Normal mode ─────────────────────────────────────────────────────── */}
      {!editMode && (
        <>
          {mostrarForm && !editando && (
            <ServicioForm onGuardar={handleCrear} onCancelar={() => setMostrarForm(false)} />
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setFiltroCat('todas')}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                  filtroCat === 'todas' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40')}
              >Todas</button>
              {CATEGORIAS_LIST.map(([key, info]) => (
                <button key={key} onClick={() => setFiltroCat(key)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                    filtroCat === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40')}
                >
                  {info.emoji} {info.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSoloActivos(!soloActivos)}
              className={cn('ml-auto px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                soloActivos ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' : 'bg-background border-border text-muted-foreground hover:border-primary/40')}
            >
              {soloActivos ? '✓ Solo activos' : 'Todos'}
            </button>
          </div>

          {/* Lista agrupada */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border flex flex-col items-center justify-center py-16 text-center">
              <p className="text-2xl mb-3">🩺</p>
              <p className="text-muted-foreground">No hay servicios registrados</p>
              <p className="text-xs text-muted-foreground mt-1">Agrega servicios para usarlos rápido en las consultas</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setMostrarForm(true)}>
                <Plus size={14} /> Agregar primer servicio
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(porCategoria).map(([cat, items]) => {
                const catInfo = SERVICE_CATEGORIES[cat as ServiceCategory];
                return (
                  <div key={cat} className="bg-card rounded-2xl border border-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
                      <span>{catInfo.emoji}</span>
                      <span className="text-sm font-semibold">{catInfo.label}</span>
                      <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
                    </div>
                    {items.map((s) =>
                      editando?.id === s.id ? (
                        <div key={s.id} className="p-4">
                          <ServicioForm inicial={s} onGuardar={handleEditar} onCancelar={() => setEditando(null)} />
                        </div>
                      ) : (
                        <ServicioRow key={s.id} servicio={s} onEditar={() => setEditando(s)} />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {services.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {services.filter((s) => s.active).length} activos · {services.filter((s) => !s.active).length} inactivos · {services.length} total
            </p>
          )}
        </>
      )}

    </div>
  );
}

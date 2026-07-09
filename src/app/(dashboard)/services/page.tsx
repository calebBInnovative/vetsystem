'use client';

import { useState } from 'react';
import {
  useServices, createService, updateService,
  toggleServicioActivo, deleteService, type ServicioInput,
} from '@/hooks/useServices';
import { SERVICE_CATEGORIES, type ServiceCategory, type ServiceLocal } from '@/types/service';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

const CATEGORIAS_LIST = Object.entries(SERVICE_CATEGORIES) as [ServiceCategory, { label: string; emoji: string; color: string }][];

// ─── Formulario inline (crear / editar) ──────────────────────────────────────

interface ServicioFormProps {
  inicial?: ServiceLocal;
  onGuardar: (input: ServicioInput) => Promise<void>;
  onCancelar: () => void;
}

function ServicioForm({ inicial, onGuardar, onCancelar }: ServicioFormProps) {
  const [nombre,     setNombre]     = useState(inicial?.nombre     ?? '');
  const [descripcion,setDescripcion]= useState(inicial?.descripcion ?? '');
  const [categoria,  setCategoria]  = useState<ServiceCategory>(inicial?.categoria ?? 'consulta');
  const [precio,     setPrecio]     = useState(String(inicial?.precio ?? ''));
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');

  async function handleGuardar() {
    if (!nombre.trim())      { setError('El nombre es requerido'); return; }
    if (Number(precio) <= 0) { setError('Ingresa un precio válido'); return; }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({ nombre, descripcion, categoria, precio: Number(precio) });
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
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Consultation General, Castración…"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Categoría *</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as ServiceCategory)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CATEGORIAS_LIST.map(([key, info]) => (
              <option key={key} value={key}>{info.emoji} {info.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Precio (C$) *</label>
          <input
            type="number"
            min="0"
            step="1"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground">Descripción (opcional)</label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción breve del servicio"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleGuardar} disabled={guardando}>
          {inicial ? 'Guardar cambios' : 'Agregar servicio'}
        </Button>
      </div>
    </div>
  );
}

// ─── Fila de servicio ─────────────────────────────────────────────────────────

interface ServicioRowProps {
  servicio: ServiceLocal;
  onEditar: () => void;
}

function ServicioRow({ servicio, onEditar }: ServicioRowProps) {
  const [editandoPrecio,  setEditandoPrecio]  = useState(false);
  const [precioTmp,       setPrecioTmp]       = useState(String(servicio.precio));
  const [eliminando,      setEliminando]      = useState(false);
  const cat = SERVICE_CATEGORIES[servicio.categoria];

  async function guardarPrecio() {
    const n = Number(precioTmp);
    if (n > 0 && n !== servicio.precio) {
      await updateService(servicio.id, { precio: n });
    }
    setEditandoPrecio(false);
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar "${servicio.nombre}"?`)) return;
    setEliminando(true);
    await deleteService(servicio.id);
  }

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 transition-opacity',
      !servicio.activo && 'opacity-50'
    )}>
      {/* Categoría badge */}
      <span className={cn('shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium hidden sm:inline', cat.color)}>
        {cat.emoji} {cat.label}
      </span>
      <span className="shrink-0 text-lg sm:hidden">{cat.emoji}</span>

      {/* Nombre + descripción */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{servicio.nombre}</p>
        {servicio.descripcion && (
          <p className="text-xs text-muted-foreground truncate">{servicio.descripcion}</p>
        )}
      </div>

      {/* Precio inline-editable */}
      <div className="shrink-0">
        {editandoPrecio ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              min="0"
              value={precioTmp}
              onChange={(e) => setPrecioTmp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarPrecio(); if (e.key === 'Escape') setEditandoPrecio(false); }}
              className="w-20 rounded-lg border border-primary px-2 py-1 text-sm text-right focus:outline-none"
            />
            <button onClick={guardarPrecio} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
            <button onClick={() => setEditandoPrecio(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
        ) : (
          <button
            onClick={() => { setPrecioTmp(String(servicio.precio)); setEditandoPrecio(true); }}
            className="text-sm font-semibold hover:text-primary transition-colors group flex items-center gap-1"
            title="Clic para editar precio"
          >
            {fmt(servicio.precio)}
            <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}
      </div>

      {/* Toggle activo */}
      <button
        onClick={() => toggleServicioActivo(servicio.id)}
        title={servicio.activo ? 'Desactivar' : 'Activar'}
        className={cn(
          'shrink-0 w-10 h-5 rounded-full transition-colors relative',
          servicio.activo ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
          servicio.activo ? 'left-5' : 'left-0.5'
        )} />
      </button>

      {/* Editar / Eliminar */}
      <button onClick={onEditar} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
        <Pencil size={15} />
      </button>
      <button
        onClick={handleEliminar}
        disabled={eliminando}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ServicesPage() {
  const { services, loading } = useServices();
  const [mostrarForm,  setMostrarForm]  = useState(false);
  const [editando,     setEditando]     = useState<ServiceLocal | null>(null);
  const [filtroCat,    setFiltroCat]    = useState<ServiceCategory | 'todas'>('todas');
  const [soloActivos,  setSoloActivos]  = useState(false);

  const filtrados = services.filter((s) => {
    if (soloActivos && !s.activo) return false;
    if (filtroCat !== 'todas' && s.categoria !== filtroCat) return false;
    return true;
  });

  // Agrupar por categoría para mostrar
  const porCategoria = filtrados.reduce<Record<string, ServiceLocal[]>>((acc, s) => {
    (acc[s.categoria] ??= []).push(s);
    return acc;
  }, {});

  async function handleCrear(input: ServicioInput) {
    await createService(input);
    setMostrarForm(false);
  }

  async function handleEditar(input: ServicioInput) {
    if (!editando) return;
    await updateService(editando.id, input);
    setEditando(null);
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Servicios</h1>
          <p className="text-sm text-muted-foreground">
            Define los services con sus precios. Se pueden agregar en un clic durante la consulta.
          </p>
        </div>
        <Button onClick={() => { setMostrarForm(true); setEditando(null); }} className="shrink-0 gap-1.5">
          <Plus size={15} /> Nuevo servicio
        </Button>
      </div>

      {/* Form nuevo */}
      {mostrarForm && !editando && (
        <ServicioForm
          onGuardar={handleCrear}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFiltroCat('todas')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
              filtroCat === 'todas'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:border-primary/40'
            )}
          >
            Todas
          </button>
          {CATEGORIAS_LIST.map(([key, info]) => (
            <button
              key={key}
              onClick={() => setFiltroCat(key)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                filtroCat === key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {info.emoji} {info.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSoloActivos(!soloActivos)}
          className={cn(
            'ml-auto px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
            soloActivos
              ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
              : 'bg-background border-border text-muted-foreground hover:border-primary/40'
          )}
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
          <p className="text-muted-foreground">No hay services registrados</p>
          <p className="text-xs text-muted-foreground mt-1">Agrega services para usarlos rápido en las consultations</p>
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
                      <ServicioForm
                        inicial={s}
                        onGuardar={handleEditar}
                        onCancelar={() => setEditando(null)}
                      />
                    </div>
                  ) : (
                    <ServicioRow
                      key={s.id}
                      servicio={s}
                      onEditar={() => setEditando(s)}
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen */}
      {services.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {services.filter((s) => s.activo).length} activos · {services.filter((s) => !s.activo).length} inactivos · {services.length} total
        </p>
      )}
    </div>
  );
}

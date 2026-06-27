'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { useLiveQuery } from 'dexie-react-hooks';
import { consultaSchema, type ConsultaFormData, type ConsultaItemData } from '@/lib/validations/consulta.schema';
import { guardarConsulta, finalizarConsulta } from '@/hooks/useConsultas';
import { useServiciosActivos } from '@/hooks/useServicios';
import { CATEGORIAS_SERVICIO } from '@/types/servicio';
import type { ServicioLocal } from '@/types/servicio';
import { TIPOS_CONSULTA } from '@/types/consulta';
import type { ConsultaConPaciente } from '@/types/consulta';
import type { ProductoLocal } from '@/types/inventario';
import { db } from '@/lib/db/database';
import { DatePicker } from '@/components/ui/date-picker';
import { DescuentoInput } from '@/components/common/DescuentoInput';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Loader2, Save, CheckCircle, Search, Plus, Minus, Trash2,
  Activity, FileText, Package, Receipt, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────

function formatMonto(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

const TABS = [
  { id: 'examen',     label: 'Examen',     icon: Activity  },
  { id: 'clinico',    label: 'Clínico',    icon: FileText  },
  { id: 'productos',  label: 'Productos y servicios',  icon: Package   },
  { id: 'cobro',      label: 'Cobro',      icon: Receipt   },
] as const;

type TabId = typeof TABS[number]['id'];

// ─────────────────────────────────────────────────────────────────────────────

interface ConsultaFormProps {
  consultaId: string;
  consulta: ConsultaConPaciente;
  onFinalizada: () => void;
  onCancelada: () => void;
}

export function ConsultaForm({ consultaId, consulta, onFinalizada, onCancelada }: ConsultaFormProps) {
  const [tab, setTab]               = useState<TabId>('examen');
  const [guardando,   setGuardando]   = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [guardadoOk,  setGuardadoOk]  = useState(false);

  // ── Product search state ────────────────────────────────────────────────
  const [busqueda,           setBusqueda]           = useState('');
  const [busquedaServicio,   setBusquedaServicio]   = useState('');
  const [serviciosFocused,   setServiciosFocused]   = useState(false);
  const [servicioDesc,       setServicioDesc]       = useState('');
  const [servicioPrecio,     setServicioPrecio]     = useState('');

  // Mapa tipo consulta → categoría de servicio preferida
  const TIPO_A_CATEGORIA: Record<string, string> = {
    consulta_general: 'consulta',   control:         'consulta',
    vacunacion:       'vacunacion', cirugia:         'cirugia',
    emergencia:       'emergencia', desparasitacion: 'desparasitacion',
    estetica:         'estetica',   otro:            'otro',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConsultaFormData>({
    resolver: zodResolver(consultaSchema),
    defaultValues: {
      pacienteId:            consulta.pacienteId,
      citaId:                consulta.citaId,
      tipo:                  consulta.tipo,
      motivo:                consulta.motivo,
      peso:                  consulta.peso,
      temperatura:           consulta.temperatura,
      frecuenciaCardiaca:    consulta.frecuenciaCardiaca,
      frecuenciaRespiratoria:consulta.frecuenciaRespiratoria,
      anamnesis:             consulta.anamnesis,
      examenFisico:          consulta.examenFisico,
      diagnostico:           consulta.diagnostico,
      tratamiento:           consulta.tratamiento,
      observaciones:         consulta.observaciones,
      proximaVisita:         consulta.proximaVisita,
      veterinario:           consulta.veterinario ?? 'Dra. Patricia Vega',
      items:                 consulta.items ?? ([] as ConsultaItemData[]),
      descuento:             consulta.descuento ?? 0,
    },
  });

  // Búsqueda de productos en tiempo real
  const productosResultado = useLiveQuery(async () => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return db.products
      .where('clinicaId').equals(process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets')
      .filter((p) => p.activo && !p.deletedAt && p.nombre.toLowerCase().includes(q))
      .limit(6)
      .toArray();
  }, [busqueda]);

  // ── Items helpers ───────────────────────────────────────────────────────
  const items    = watch('items') ?? [];
  const descuento = Number(watch('descuento') ?? 0);
  const subtotal  = items.reduce((s, i) => s + i.subtotal, 0);
  const total     = Math.max(0, subtotal - descuento);

  function agregarProducto(prod: ProductoLocal) {
    const existente = items.findIndex((i) => i.productoId === prod.id);
    if (existente >= 0) {
      const next = [...items];
      next[existente] = {
        ...next[existente],
        cantidad:  next[existente].cantidad + 1,
        subtotal: (next[existente].cantidad + 1) * next[existente].precioUnitario,
      };
      setValue('items', next);
    } else {
      const precio = prod.precioVenta ?? 0;
      const item: ConsultaItemData = {
        id:             crypto.randomUUID(),
        productoId:     prod.id,
        descripcion:    prod.nombre,
        cantidad:       1,
        precioUnitario: precio,
        subtotal:       precio,
        esServicio:     false,
      };
      setValue('items', [...items, item]);
    }
    setBusqueda('');
  }

  const serviciosCatalogo = useServiciosActivos();

  function agregarServicioCatalogo(serv: ServicioLocal) {
    const existente = items.findIndex(
      (i) => i.esServicio && !i.productoId && i.descripcion === serv.nombre
    );
    if (existente >= 0) {
      cambiarCantidad(existente, 1);
    } else {
      const item: ConsultaItemData = {
        id:             crypto.randomUUID(),
        productoId:     undefined,
        descripcion:    serv.nombre,
        cantidad:       1,
        precioUnitario: serv.precio,
        subtotal:       serv.precio,
        esServicio:     true,
      };
      setValue('items', [...items, item]);
    }
  }

  function agregarServicioManual() {
    const precio = parseFloat(servicioPrecio) || 0;
    if (!servicioDesc.trim()) return;
    const item: ConsultaItemData = {
      id:             crypto.randomUUID(),
      productoId:     undefined,
      descripcion:    servicioDesc.trim(),
      cantidad:       1,
      precioUnitario: precio,
      subtotal:       precio,
      esServicio:     true,
    };
    setValue('items', [...items, item]);
    setServicioDesc('');
    setServicioPrecio('');
  }

  function cambiarCantidad(index: number, delta: number) {
    const next     = [...items];
    const nueva    = Math.max(1, next[index].cantidad + delta);
    next[index]    = { ...next[index], cantidad: nueva, subtotal: nueva * next[index].precioUnitario };
    setValue('items', next);
  }

  function eliminarItem(index: number) {
    setValue('items', items.filter((_, i) => i !== index));
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  async function handleGuardar() {
    const datos = watch();
    setGuardando(true);
    try {
      await guardarConsulta(consultaId, datos as ConsultaFormData);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
    } finally {
      setGuardando(false);
    }
  }

  async function onSubmit(datos: ConsultaFormData) {
    setFinalizando(true);
    try {
      await finalizarConsulta(consultaId, datos);
      onFinalizada();
    } finally {
      setFinalizando(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full relative">

      {/* Toast — guardado exitoso */}
      <div className={cn(
        'absolute bottom-20 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2 rounded-full',
        'bg-green-600 text-white text-sm font-medium shadow-lg',
        'transition-all duration-300 pointer-events-none',
        guardadoOk ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}>
        <CheckCircle size={14} />
        Guardado
      </div>

      {/* Paciente banner */}
      <div className="bg-primary/10 border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl">
          {consulta.especiePaciente === 'perro' ? '🐕' : consulta.especiePaciente === 'gato' ? '🐈' : '🐾'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{consulta.nombrePaciente}</p>
          <p className="text-xs text-muted-foreground">{consulta.nombreDueno} · {new Date(consulta.fecha).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleGuardar} disabled={guardando} className="text-xs gap-1">
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Guardar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0 bg-card">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors',
              tab === id
                ? 'text-primary border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon size={15} />
            <span className="hidden sm:block">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Tab: Examen ──────────────────────────────────────────────── */}
        {tab === 'examen' && (
          <div className="p-4 space-y-5">

            {/* Tipo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de atención *</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(TIPOS_CONSULTA) as [string, { label: string; emoji: string }][]).map(([key, info]) => {
                  const activo = watch('tipo') === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setValue('tipo', key as ConsultaFormData['tipo'], { shouldValidate: true })}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                        activo
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/40 text-muted-foreground'
                      )}
                    >
                      <span>{info.emoji}</span>
                      <span>{info.label}</span>
                    </button>
                  );
                })}
              </div>
              {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo de la visita <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <textarea
                {...register('motivo')}
                rows={2}
                placeholder="Describa el motivo de la visita..."
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {errors.motivo && <p className="text-xs text-destructive">{errors.motivo.message}</p>}
            </div>

            {/* Signos vitales */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Signos vitales</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { field: 'peso'                 as const, label: 'Peso',        unit: 'kg',  placeholder: '4.5' },
                  { field: 'temperatura'           as const, label: 'Temperatura', unit: '°C',  placeholder: '38.5' },
                  { field: 'frecuenciaCardiaca'    as const, label: 'F. Cardíaca', unit: 'bpm', placeholder: '80' },
                  { field: 'frecuenciaRespiratoria'as const, label: 'F. Respir.',  unit: 'rpm', placeholder: '20' },
                ].map(({ field, label, unit, placeholder }) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <div className="flex items-center rounded-xl border border-input bg-background overflow-hidden">
                      <input
                        {...register(field)}
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={placeholder}
                        className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                      />
                      <span className="px-2 text-xs text-muted-foreground border-l border-input bg-muted/30">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Veterinario */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Veterinario</label>
              <input
                {...register('veterinario')}
                placeholder="Nombre del veterinario"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* ── Tab: Clínico ─────────────────────────────────────────────── */}
        {tab === 'clinico' && (
          <div className="p-4 space-y-4">
            {[
              { field: 'anamnesis'    as const, label: 'Anamnesis', placeholder: 'Historia del problema, antecedentes del paciente...' },
              { field: 'examenFisico'as const, label: 'Examen físico', placeholder: 'Hallazgos del examen: piel, mucosas, auscultación...' },
              { field: 'diagnostico' as const, label: 'Diagnóstico', placeholder: 'Diagnóstico presuntivo o definitivo...' },
              { field: 'tratamiento' as const, label: 'Tratamiento', placeholder: 'Medicamentos, dosis, indicaciones...' },
              { field: 'observaciones'as const, label: 'Observaciones', placeholder: 'Notas adicionales...' },
            ].map(({ field, label, placeholder }) => (
              <div key={field} className="space-y-1.5">
                <label className="text-sm font-medium">{label}</label>
                <textarea
                  {...register(field)}
                  rows={field === 'observaciones' ? 2 : 3}
                  placeholder={placeholder}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Próxima visita</label>
              <DatePicker
                value={watch('proximaVisita')}
                onChange={(v) => setValue('proximaVisita', v, { shouldValidate: true })}
                placeholder="DD/MM/AAAA"
                fromDate={new Date()}
                toDate={new Date(new Date().getFullYear() + 2, 11, 31)}
              />
            </div>
          </div>
        )}

        {/* ── Tab: Productos ───────────────────────────────────────────── */}
        {tab === 'productos' && (
          <div className="p-4 space-y-4">

            {/* Buscar servicio del catálogo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar servicio</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busquedaServicio}
                  onChange={(e) => setBusquedaServicio(e.target.value)}
                  onFocus={() => setServiciosFocused(true)}
                  onBlur={() => setServiciosFocused(false)}
                  placeholder="Buscar en catálogo de servicios…"
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Resultados — solo visibles con focus */}
              {serviciosFocused && (() => {
                const q                 = busquedaServicio.toLowerCase().trim();
                const categoriaPreferida = TIPO_A_CATEGORIA[watch('tipo')] ?? 'consulta';

                const filtrados = (q
                  ? serviciosCatalogo.filter((s) => s.nombre.toLowerCase().includes(q) || s.categoria.includes(q))
                  : serviciosCatalogo
                ).sort((a, b) => {
                  // Servicios del tipo de consulta actual primero
                  const pa = a.categoria === categoriaPreferida ? 0 : 1;
                  const pb = b.categoria === categoriaPreferida ? 0 : 1;
                  return pa - pb || a.nombre.localeCompare(b.nombre);
                });

                if (filtrados.length === 0) return (
                  <p className="text-sm text-muted-foreground text-center py-3">Sin resultados</p>
                );

                return (
                  // onMouseDown prevent → evita que el blur del input se dispare antes del click
                  <div
                    className="rounded-xl border border-border bg-card overflow-hidden max-h-52 overflow-y-auto"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filtrados.map((serv) => {
                      const cat      = CATEGORIAS_SERVICIO[serv.categoria];
                      const esPreferido = serv.categoria === categoriaPreferida;
                      return (
                        <button
                          key={serv.id}
                          type="button"
                          onClick={() => { agregarServicioCatalogo(serv); setBusquedaServicio(''); }}
                          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border last:border-0 text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{cat?.emoji}</span>
                            <span className="text-sm font-medium truncate">{serv.nombre}</span>
                            {esPreferido && !q && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                Sugerido
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold">{formatMonto(serv.precio)}</span>
                            <Plus size={13} className="text-primary" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Buscador */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar producto / medicamento</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar en inventario..."
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Resultados */}
              {busqueda && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {!productosResultado || productosResultado.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
                  ) : (
                    productosResultado.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => agregarProducto(prod)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border last:border-0 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{prod.nombre}</p>
                          <p className="text-xs text-muted-foreground">Stock: {prod.stockActual} {prod.unidad}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{formatMonto(prod.precioVenta ?? 0)}</p>
                          <Plus size={13} className="text-primary ml-auto" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Agregar servicio manual */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Agregar servicio manual</label>
              <div className="flex gap-2">
                <input
                  value={servicioDesc}
                  onChange={(e) => setServicioDesc(e.target.value)}
                  placeholder="Descripción del servicio"
                  className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={servicioPrecio}
                  onChange={(e) => setServicioPrecio(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="C$"
                  className="w-24 rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="button" size="icon" variant="outline" onClick={agregarServicioManual} className="shrink-0">
                  <Plus size={15} />
                </Button>
              </div>
            </div>

            {/* Items agregados */}
            {items.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Productos y servicios ({items.length})</label>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {items.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.descripcion}</p>
                        <p className="text-xs text-muted-foreground">{formatMonto(item.precioUnitario)} c/u {item.esServicio && '· Servicio'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => cambiarCantidad(i, -1)} className="w-6 h-6 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Minus size={11} />
                        </button>
                        <span className="w-6 text-center text-sm font-medium">{item.cantidad}</span>
                        <button type="button" onClick={() => cambiarCantidad(i, +1)} className="w-6 h-6 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Plus size={11} />
                        </button>
                      </div>
                      <p className="text-sm font-semibold w-16 text-right shrink-0">{formatMonto(item.subtotal)}</p>
                      <button type="button" onClick={() => eliminarItem(i)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Cobro ───────────────────────────────────────────────── */}
        {tab === 'cobro' && (
          <div className="p-4 space-y-4">

            {/* Resumen de items */}
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin productos ni servicios</p>
                <button type="button" onClick={() => setTab('productos')} className="text-xs text-primary mt-1 hover:underline">
                  Ir a Productos
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm">{item.descripcion}</p>
                      <p className="text-xs text-muted-foreground">{item.cantidad} × {formatMonto(item.precioUnitario)}</p>
                    </div>
                    <p className="text-sm font-medium">{formatMonto(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Descuento */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descuento</label>
              <DescuentoInput
                subtotal={subtotal}
                value={descuento}
                onChange={(monto) => setValue('descuento', monto, { shouldValidate: true })}
              />
            </div>

            {/* Totales */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMonto(subtotal)}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>Descuento</span>
                  <span>-{formatMonto(descuento)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                <span>Total</span>
                <span>{formatMonto(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer fijo ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-card p-4 space-y-2">
        {/* Total visible desde cualquier tab */}
        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-muted-foreground">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
          <span className="font-bold text-lg">{formatMonto(total)}</span>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancelada} className="text-destructive border-destructive/30 hover:bg-destructive/5">
            Cancelar
          </Button>
          <Button type="submit" className="flex-1 h-11 text-base gap-2" disabled={finalizando}>
            {finalizando
              ? <Loader2 size={16} className="animate-spin" />
              : <CheckCircle size={16} />
            }
            Finalizar consulta
          </Button>
        </div>
      </div>
    </form>
  );
}

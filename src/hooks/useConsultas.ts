'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultaLocal, ConsultaConPaciente, EstadoConsulta, TipoConsulta } from '@/types/consulta';
import type { ConsultaFormData } from '@/lib/validations/consulta.schema';

const CLINICA_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';
const VETERINARIO  = 'Dra. Patricia Vega';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/** Lista de consultas de la clínica con filtros opcionales */
export function useConsultas(filtros?: {
  estado?: EstadoConsulta;
  tipo?: TipoConsulta;
  fechaDesde?: number;
  fechaHasta?: number;
}) {
  const resultado = useLiveQuery(async () => {
    let consultas = await db.consultations
      .where('clinicaId')
      .equals(CLINICA_ID)
      .filter((c) => !c.deletedAt)
      .toArray();

    if (filtros?.estado)     consultas = consultas.filter((c) => c.estado === filtros.estado);
    if (filtros?.tipo)       consultas = consultas.filter((c) => c.tipo   === filtros.tipo);
    if (filtros?.fechaDesde) consultas = consultas.filter((c) => c.fecha  >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) consultas = consultas.filter((c) => c.fecha  <= filtros.fechaHasta!);

    consultas.sort((a, b) => b.fecha - a.fecha);

    const pacienteIds  = [...new Set(consultas.map((c) => c.pacienteId))];
    const pacientes    = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));

    const duenoIds  = [...new Set(consultas.map((c) => c.duenoId).filter(Boolean))];
    const duenos    = await db.owners.bulkGet(duenoIds);
    const duenosMap = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return consultas.map<ConsultaConPaciente>((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
      nombreDueno:     duenosMap.get(c.duenoId)?.nombre,
    }));
  }, [filtros?.estado, filtros?.tipo, filtros?.fechaDesde, filtros?.fechaHasta]);

  return {
    consultas: resultado ?? [],
    cargando:  resultado === undefined,
  };
}

/** Consultas en proceso (activas ahora) */
export function useConsultasEnProceso() {
  const resultado = useLiveQuery(async () => {
    const consultas = await db.consultations
      .where('estado')
      .equals('en_proceso')
      .filter((c) => !c.deletedAt && c.clinicaId === CLINICA_ID)
      .toArray();

    const pacienteIds  = [...new Set(consultas.map((c) => c.pacienteId))];
    const pacientes    = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));

    return consultas.map<ConsultaConPaciente>((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
    }));
  }, []);

  return resultado ?? [];
}

/** Una consulta individual por ID */
export function useConsulta(id: string) {
  const resultado = useLiveQuery(async () => {
    const c = await db.consultations.get(id);
    if (!c || c.deletedAt) return null;

    const paciente = await db.patients.get(c.pacienteId);
    const dueno    = c.duenoId ? await db.owners.get(c.duenoId) : undefined;

    return {
      ...c,
      nombrePaciente:  paciente?.nombre,
      especiePaciente: paciente?.especie,
      nombreDueno:     dueno?.nombre,
      telefonoDueno:   dueno?.telefono,
    };
  }, [id]);

  return {
    consulta: resultado ?? null,
    cargando: resultado === undefined,
  };
}

/** Historial de consultas de un paciente */
export function useConsultasPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    const consultas = await db.consultations
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .toArray();
    return consultas.sort((a, b) => b.fecha - a.fecha);
  }, [pacienteId]);

  return {
    consultas: resultado ?? [],
    cargando:  resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

/** Inicia una nueva consulta en estado "en_proceso" */
export async function iniciarConsulta(datos: {
  pacienteId: string;
  citaId?: string;
  tipo?: ConsultaFormData['tipo'];
  motivo?: string;
}): Promise<string> {
  const ahora = Date.now();
  const id    = crypto.randomUUID();

  const paciente = await db.patients.get(datos.pacienteId);
  if (!paciente) throw new Error('Paciente no encontrado');

  const nueva: ConsultaLocal = {
    id,
    pacienteId: datos.pacienteId,
    duenoId:    paciente.duenoId,
    clinicaId:  CLINICA_ID,
    citaId:     datos.citaId,
    fecha:      ahora,
    tipo:       datos.tipo ?? 'consulta_general',
    estado:     'en_proceso',
    motivo:     datos.motivo ?? '',
    items:      [],
    subtotal:   0,
    descuento:  0,
    total:      0,
    veterinario: VETERINARIO,
    creadoEn:   ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  };

  await db.consultations.add(nueva);
  await encolarSync({ coleccion: 'consultas', documentoId: id, operacion: 'create', datos: nueva, intentos: 0, creadoEn: ahora });

  // Si viene de una cita, marcarla como en_curso
  if (datos.citaId) {
    await db.appointments.update(datos.citaId, { estado: 'en_curso', updatedAt: ahora, syncStatus: 'pending' });
  }

  return id;
}

/** Guarda los datos clínicos sin finalizar (auto-guardado) */
export async function guardarConsulta(id: string, datos: ConsultaFormData): Promise<void> {
  const ahora = Date.now();
  const subtotal = calcularSubtotal(datos.items ?? []);
  const descuento = datos.descuento ?? 0;
  const total = Math.max(0, subtotal - descuento);

  const cambios: Partial<ConsultaLocal> = {
    tipo:                  datos.tipo,
    motivo:                datos.motivo,
    peso:                  datos.peso,
    temperatura:           datos.temperatura,
    frecuenciaCardiaca:    datos.frecuenciaCardiaca,
    frecuenciaRespiratoria:datos.frecuenciaRespiratoria,
    anamnesis:             datos.anamnesis    || undefined,
    examenFisico:          datos.examenFisico || undefined,
    diagnostico:           datos.diagnostico  || undefined,
    tratamiento:           datos.tratamiento  || undefined,
    observaciones:         datos.observaciones|| undefined,
    proximaVisita:         datos.proximaVisita|| undefined,
    veterinario:           datos.veterinario  || undefined,
    items:                 datos.items,
    subtotal,
    descuento,
    total,
    updatedAt:  ahora,
    syncStatus: 'pending',
  };

  await db.consultations.update(id, cambios);
}

/** Finaliza la consulta: completa inventario, genera pago */
export async function finalizarConsulta(id: string, datos: ConsultaFormData): Promise<void> {
  const ahora    = Date.now();
  const subtotal = calcularSubtotal(datos.items ?? []);
  const descuento = datos.descuento ?? 0;
  const total    = Math.max(0, subtotal - descuento);

  await db.transaction('rw',
    [db.consultations, db.products, db.movements, db.syncQueue],
    async () => {
      const consulta = await db.consultations.get(id);
      if (!consulta) throw new Error('Consulta no encontrada');

      // 1 — Guardar datos clínicos completos
      await db.consultations.update(id, {
        tipo:                  datos.tipo,
        motivo:                datos.motivo,
        peso:                  datos.peso,
        temperatura:           datos.temperatura,
        frecuenciaCardiaca:    datos.frecuenciaCardiaca,
        frecuenciaRespiratoria:datos.frecuenciaRespiratoria,
        anamnesis:             datos.anamnesis    || undefined,
        examenFisico:          datos.examenFisico || undefined,
        diagnostico:           datos.diagnostico  || undefined,
        tratamiento:           datos.tratamiento  || undefined,
        observaciones:         datos.observaciones|| undefined,
        proximaVisita:         datos.proximaVisita|| undefined,
        veterinario:           datos.veterinario  || undefined,
        items:                 datos.items,
        subtotal,
        descuento,
        total,
        estado:     'completada',
        updatedAt:  ahora,
        syncStatus: 'pending',
      });

      // 2 — Descontar inventario por cada producto (no servicios)
      for (const item of (datos.items ?? []).filter((i) => !i.esServicio && i.productoId)) {
        const prod = await db.products.get(item.productoId!);
        if (!prod) continue;
        const stockNuevo = Math.max(0, prod.stockActual - item.cantidad);
        await db.products.update(item.productoId!, {
          stockActual: stockNuevo,
          updatedAt:   ahora,
          syncStatus:  'pending',
        });
        await db.movements.add({
          id:           crypto.randomUUID(),
          productoId:   item.productoId!,
          clinicaId:    CLINICA_ID,
          tipo:         'salida',
          cantidad:     item.cantidad,
          stockAntes:   prod.stockActual,
          stockDespues: stockNuevo,
          motivo:       `Consulta #${id.slice(0, 8)}`,
          referenciaId: id,
          creadoEn:     ahora,
          syncStatus:   'pending',
          updatedAt:    ahora,
        });
      }

      // 3 — Marcar cita como completada si aplica (era paso 4)
      if (consulta.citaId) {
        await db.appointments.update(consulta.citaId, { estado: 'completada', updatedAt: ahora, syncStatus: 'pending' });
      }

      // 5 — Encolar sync
      const final = await db.consultations.get(id);
      if (final) {
        await encolarSync({ coleccion: 'consultas', documentoId: id, operacion: 'update', datos: final, intentos: 0, creadoEn: ahora });
      }
    }
  );
}

/** Cancela una consulta en proceso */
export async function cancelarConsulta(id: string): Promise<void> {
  const ahora = Date.now();
  await db.consultations.update(id, { estado: 'cancelada', updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'consultas', documentoId: id, operacion: 'update', datos: { id, estado: 'cancelada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function calcularSubtotal(items: ConsultaFormData['items']): number {
  return items.reduce((s, i) => s + i.subtotal, 0);
}


async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultationLocal, ConsultationWithPatient, ConsultationStatus, ConsultationType } from '@/types/consultation';
import type { ConsultaFormData } from '@/lib/validations/consultation.schema';

const VETERINARIO  = 'Dra. Patricia Vega';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/** Lista de consultations de la clínica con filtros opcionales */
export function useConsultations(filtros?: {
  estado?: ConsultationStatus;
  tipo?: ConsultationType;
  fechaDesde?: number;
  fechaHasta?: number;
}) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    let consultations = await db.consultations
      .where('clinicaId')
      .equals(clinicaId)
      .filter((c) => !c.deletedAt)
      .toArray();

    if (filtros?.estado)     consultations = consultations.filter((c) => c.estado === filtros.estado);
    if (filtros?.tipo)       consultations = consultations.filter((c) => c.tipo   === filtros.tipo);
    if (filtros?.fechaDesde) consultations = consultations.filter((c) => c.fecha  >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) consultations = consultations.filter((c) => c.fecha  <= filtros.fechaHasta!);

    consultations.sort((a, b) => b.fecha - a.fecha);

    const pacienteIds  = [...new Set(consultations.map((c) => c.pacienteId))];
    const patients    = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    const duenoIds  = [...new Set(consultations.map((c) => c.duenoId).filter(Boolean))];
    const duenos    = await db.owners.bulkGet(duenoIds);
    const duenosMap = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return consultations.map<ConsultationWithPatient>((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
      nombreDueno:     duenosMap.get(c.duenoId)?.nombre,
    }));
  }, [filtros?.estado, filtros?.tipo, filtros?.fechaDesde, filtros?.fechaHasta]);

  return {
    consultations: resultado ?? [],
    loading:  resultado === undefined,
  };
}

/** Consultas en proceso (activas ahora) */
export function useConsultasEnProceso() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const consultations = await db.consultations
      .where('estado')
      .equals('en_proceso')
      .filter((c) => !c.deletedAt && c.clinicaId === clinicaId)
      .toArray();

    const pacienteIds  = [...new Set(consultations.map((c) => c.pacienteId))];
    const patients    = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return consultations.map<ConsultationWithPatient>((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
    }));
  }, []);

  return resultado ?? [];
}

/** Una consulta individual por ID */
export function useConsultation(id: string) {
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
    loading: resultado === undefined,
  };
}

/** Historial de consultations de un paciente */
export function useConsultasPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    const consultations = await db.consultations
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .toArray();
    return consultations.sort((a, b) => b.fecha - a.fecha);
  }, [pacienteId]);

  return {
    consultations: resultado ?? [],
    loading:  resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

/** Inicia una nueva consulta en estado "en_proceso" */
export async function startConsultation(datos: {
  pacienteId: string;
  citaId?: string;
  tipo?: ConsultaFormData['tipo'];
  motivo?: string;
}): Promise<string> {
  const ahora = Date.now();
  const id    = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const paciente = await db.patients.get(datos.pacienteId);
  if (!paciente) throw new Error('Patient no encontrado');

  const nueva: ConsultationLocal = {
    id,
    pacienteId: datos.pacienteId,
    duenoId:    paciente.duenoId,
    clinicaId:  clinicaId,
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
  await encolarSync({ coleccion: 'consultations', documentoId: id, operacion: 'create', datos: nueva, intentos: 0, creadoEn: ahora });

  // Si viene de una cita, marcarla como en_curso
  if (datos.citaId) {
    await db.appointments.update(datos.citaId, { estado: 'en_curso', updatedAt: ahora, syncStatus: 'pending' });
    await encolarSync({ coleccion: 'appointments', documentoId: datos.citaId, operacion: 'update', datos: { id: datos.citaId, estado: 'en_curso', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
  }

  return id;
}

/** Guarda los datos clínicos sin finalizar (auto-guardado) */
export async function saveConsultation(id: string, datos: ConsultaFormData): Promise<void> {
  const ahora = Date.now();
  const subtotal = calcularSubtotal(datos.items ?? []);
  const descuento = datos.descuento ?? 0;
  const total = Math.max(0, subtotal - descuento);

  const cambios: Partial<ConsultationLocal> = {
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
  await encolarSync({ coleccion: 'consultations', documentoId: id, operacion: 'update', datos: { id, ...cambios }, intentos: 0, creadoEn: ahora });
}

/** Finaliza la consulta: completa inventario, genera pago */
export async function finalizeConsultation(id: string, datos: ConsultaFormData): Promise<void> {
  const ahora    = Date.now();
  const subtotal = calcularSubtotal(datos.items ?? []);
  const descuento = datos.descuento ?? 0;
  const total    = Math.max(0, subtotal - descuento);
  const clinicaId = await getClinicaId();

  await db.transaction('rw',
    [db.consultations, db.products, db.movements, db.appointments, db.syncQueue],
    async () => {
      const consulta = await db.consultations.get(id);
      if (!consulta) throw new Error('Consultation no encontrada');

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

      // 2 — Descontar inventario por cada producto (no services)
      for (const item of (datos.items ?? []).filter((i) => !i.esServicio && i.productoId)) {
        const prod = await db.products.get(item.productoId!);
        if (!prod) continue;
        const stockNuevo = Math.max(0, prod.stockActual - item.cantidad);
        await db.products.update(item.productoId!, {
          stockActual: stockNuevo,
          updatedAt:   ahora,
          syncStatus:  'pending',
        });
        await encolarSync({ coleccion: 'products', documentoId: item.productoId!, operacion: 'update', datos: { id: item.productoId!, stockActual: stockNuevo, updatedAt: ahora }, intentos: 0, creadoEn: ahora });

        const movId = crypto.randomUUID();
        await db.movements.add({
          id:           movId,
          productoId:   item.productoId!,
          clinicaId:    clinicaId,
          tipo:         'salida',
          cantidad:     item.cantidad,
          stockAntes:   prod.stockActual,
          stockDespues: stockNuevo,
          motivo:       `Consultation #${id.slice(0, 8)}`,
          referenciaId: id,
          creadoEn:     ahora,
          syncStatus:   'pending',
          updatedAt:    ahora,
        });
        await encolarSync({ coleccion: 'movements', documentoId: movId, operacion: 'create', datos: { id: movId, productoId: item.productoId!, clinicaId, tipo: 'salida', cantidad: item.cantidad, stockAntes: prod.stockActual, stockDespues: stockNuevo, motivo: `Consultation #${id.slice(0, 8)}`, referenciaId: id, creadoEn: ahora, syncStatus: 'pending', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
      }

      // 3 — Marcar cita como completada si aplica
      if (consulta.citaId) {
        await db.appointments.update(consulta.citaId, { estado: 'completada', updatedAt: ahora, syncStatus: 'pending' });
        await encolarSync({ coleccion: 'appointments', documentoId: consulta.citaId, operacion: 'update', datos: { id: consulta.citaId, estado: 'completada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
      }

      // 5 — Encolar sync
      const final = await db.consultations.get(id);
      if (final) {
        await encolarSync({ coleccion: 'consultations', documentoId: id, operacion: 'update', datos: final, intentos: 0, creadoEn: ahora });
      }
    }
  );
}

/** Cancela una consulta en proceso */
export async function cancelConsultation(id: string): Promise<void> {
  const ahora = Date.now();
  await db.consultations.update(id, { estado: 'cancelada', updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'consultations', documentoId: id, operacion: 'update', datos: { id, estado: 'cancelada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
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

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — useHistorial
//
// Centraliza toda la lógica de datos del módulo Historial Clínico:
//   - Hooks reactivos (useLiveQuery) para la UI
//   - Mutaciones que escriben en Dexie + encolan en syncQueue
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultationLocal } from '@/types/consultation';
import type { ConsultaFormData } from '@/lib/validations/history.schema';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna todas las consultations activas de un paciente, ordenadas de más
 * reciente a más antigua.
 */
export function usePatientHistory(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.consultations
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    consultations: resultado ?? [],
    loading:  resultado === undefined,
  };
}

/**
 * Retorna una consulta específica por ID.
 * Devuelve `null` si no existe o fue eliminada.
 */
export function useConsultation(id: string) {
  const resultado = useLiveQuery(async () => {
    const consulta = await db.consultations.get(id);
    if (!consulta || consulta.deletedAt) return null;
    return consulta;
  }, [id]);

  return {
    consulta: resultado ?? null,
    loading: resultado === undefined,
  };
}

/**
 * Retorna las últimas `limite` consultations de una clínica, de todas las mascotas.
 * Útil para el dashboard o una vista de "agenda reciente".
 */
export function useRecentConsultations(limite = 10) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    return db.consultations
      .where('clinicaId')
      .equals(clinicaId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha')
      .then((consultations) => consultations.slice(0, limite));
  }, [limite]);

  return {
    consultations: resultado ?? [],
    loading:  resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra una nueva consulta clínica para un paciente.
 *
 * @param pacienteId - ID del paciente
 * @param datos - Datos del formulario validados por Zod
 * @returns ID de la consulta creada
 */
export async function createHistoryEntry(
  pacienteId: string,
  datos: ConsultaFormData
): Promise<string> {
  const ahora      = Date.now();
  const consultaId = crypto.randomUUID();
  const clinicaId  = await getClinicaId();

  const paciente = await db.patients.get(pacienteId);

  const nuevaConsulta: ConsultationLocal = {
    id:            consultaId,
    pacienteId,
    duenoId:       paciente?.duenoId ?? '',
    clinicaId:     clinicaId,
    fecha:         new Date(datos.fecha).getTime(),
    tipo:          datos.tipo,
    estado:        'completada',
    motivo:        datos.motivo,
    temperatura:   datos.temperatura,
    peso:          datos.pesoConsulta,
    diagnostico:   datos.diagnostico   || undefined,
    tratamiento:   datos.tratamiento   || undefined,
    observaciones: datos.observaciones || undefined,
    veterinario:   datos.veterinario   || undefined,
    items:         [],
    subtotal:      0,
    descuento:     0,
    total:         0,
    creadoEn:      ahora,
    syncStatus:    'pending',
    updatedAt:     ahora,
  };

  await db.consultations.add(nuevaConsulta);
  await encolarSync({
    coleccion: 'consultations', documentoId: consultaId, operacion: 'create',
    datos: nuevaConsulta,
    intentos: 0, creadoEn: ahora,
  });

  return consultaId;
}

/**
 * Actualiza campos específicos de una consulta.
 * No sobreescribe campos que no se pasen.
 */
export async function updateHistoryEntry(
  id: string,
  cambios: Partial<Omit<ConsultationLocal, 'id' | 'creadoEn' | 'clinicaId' | 'pacienteId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };

  await db.consultations.update(id, payload);
  await encolarSync({
    coleccion: 'consultations', documentoId: id, operacion: 'update',
    datos: { id, ...payload },
    intentos: 0, creadoEn: ahora,
  });
}

/**
 * Soft delete: marca `deletedAt` sin borrar el registro de Dexie.
 */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const ahora = Date.now();

  await db.consultations.update(id, {
    deletedAt:  ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  });
  await encolarSync({
    coleccion: 'consultations', documentoId: id, operacion: 'delete',
    datos: { id, deletedAt: ahora },
    intentos: 0, creadoEn: ahora,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

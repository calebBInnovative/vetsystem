// ─────────────────────────────────────────────────────────────────────────────
// HOOK — useHistorial
//
// Centraliza toda la lógica de datos del módulo Historial Clínico:
//   - Hooks reactivos (useLiveQuery) para la UI
//   - Mutaciones que escriben en Dexie + encolan en syncQueue
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultaLocal } from '@/types/consulta';
import type { ConsultaFormData } from '@/lib/validations/historial.schema';

// TODO: en producción vendrá del contexto de autenticación
const CLINICA_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna todas las consultas activas de un paciente, ordenadas de más
 * reciente a más antigua.
 */
export function useHistorialPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.consultations
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    consultas: resultado ?? [],
    cargando:  resultado === undefined,
  };
}

/**
 * Retorna una consulta específica por ID.
 * Devuelve `null` si no existe o fue eliminada.
 */
export function useConsulta(id: string) {
  const resultado = useLiveQuery(async () => {
    const consulta = await db.consultations.get(id);
    if (!consulta || consulta.deletedAt) return null;
    return consulta;
  }, [id]);

  return {
    consulta: resultado ?? null,
    cargando: resultado === undefined,
  };
}

/**
 * Retorna las últimas `limite` consultas de una clínica, de todas las mascotas.
 * Útil para el dashboard o una vista de "agenda reciente".
 */
export function useUltimasConsultas(limite = 10) {
  const resultado = useLiveQuery(async () => {
    return db.consultations
      .where('clinicaId')
      .equals(CLINICA_ID)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha')
      .then((consultas) => consultas.slice(0, limite));
  }, [limite]);

  return {
    consultas: resultado ?? [],
    cargando:  resultado === undefined,
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
export async function crearConsulta(
  pacienteId: string,
  datos: ConsultaFormData
): Promise<string> {
  const ahora      = Date.now();
  const consultaId = crypto.randomUUID();

  const paciente = await db.patients.get(pacienteId);

  const nuevaConsulta: ConsultaLocal = {
    id:            consultaId,
    pacienteId,
    duenoId:       paciente?.duenoId ?? '',
    clinicaId:     CLINICA_ID,
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
    coleccion: 'consultas', documentoId: consultaId, operacion: 'create',
    datos: nuevaConsulta,
    intentos: 0, creadoEn: ahora,
  });

  return consultaId;
}

/**
 * Actualiza campos específicos de una consulta.
 * No sobreescribe campos que no se pasen.
 */
export async function actualizarConsulta(
  id: string,
  cambios: Partial<Omit<ConsultaLocal, 'id' | 'creadoEn' | 'clinicaId' | 'pacienteId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };

  await db.consultations.update(id, payload);
  await encolarSync({
    coleccion: 'consultas', documentoId: id, operacion: 'update',
    datos: { id, ...payload },
    intentos: 0, creadoEn: ahora,
  });
}

/**
 * Soft delete: marca `deletedAt` sin borrar el registro de Dexie.
 */
export async function eliminarConsulta(id: string): Promise<void> {
  const ahora = Date.now();

  await db.consultations.update(id, {
    deletedAt:  ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  });
  await encolarSync({
    coleccion: 'consultas', documentoId: id, operacion: 'delete',
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

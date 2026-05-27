'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { CitaLocal, EstadoCita } from '@/types/agenda';
import type { CitaFormData } from '@/lib/validations/agenda.schema';

const CLINICA_ID = 'house-of-pets';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna todas las citas activas de un día específico, ordenadas por hora.
 * @param fecha - "YYYY-MM-DD"
 */
export function useCitasDelDia(fecha: string) {
  const resultado = useLiveQuery(async () => {
    const citas = await db.citas
      .where('fecha')
      .equals(fecha)
      .filter((c) => !c.deletedAt && c.clinicaId === CLINICA_ID)
      .toArray();

    // Ordenar por horaInicio
    citas.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    // Join con pacientes y dueños en una sola pasada
    const pacienteIds = [...new Set(citas.map((c) => c.pacienteId))];
    const duenoIds    = [...new Set(citas.map((c) => c.duenoId))];

    const [pacientes, duenos] = await Promise.all([
      db.pacientes.bulkGet(pacienteIds),
      db.duenos.bulkGet(duenoIds),
    ]);

    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));
    const duenosMap    = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return citas.map((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
      nombreDueno:     duenosMap.get(c.duenoId)?.nombre,
      telefonoDueno:   duenosMap.get(c.duenoId)?.telefono,
    }));
  }, [fecha]);

  return {
    citas:    resultado ?? [],
    cargando: resultado === undefined,
  };
}

/**
 * Retorna las próximas N citas confirmadas/pendientes desde hoy.
 */
export function useCitasProximas(limite = 5) {
  const hoy = new Date().toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const citas = await db.citas
      .where('fecha')
      .aboveOrEqual(hoy)
      .filter(
        (c) =>
          !c.deletedAt &&
          c.clinicaId === CLINICA_ID &&
          (c.estado === 'pendiente' || c.estado === 'confirmada')
      )
      .limit(limite)
      .toArray();

    citas.sort((a, b) =>
      a.fecha === b.fecha
        ? a.horaInicio.localeCompare(b.horaInicio)
        : a.fecha.localeCompare(b.fecha)
    );

    const pacienteIds = [...new Set(citas.map((c) => c.pacienteId))];
    const pacientes   = await db.pacientes.bulkGet(pacienteIds);
    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));

    return citas.map((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
    }));
  }, [hoy, limite]);

  return {
    citas:    resultado ?? [],
    cargando: resultado === undefined,
  };
}

/**
 * Retorna las citas de un paciente específico.
 */
export function useCitasPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.citas
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    citas:    resultado ?? [],
    cargando: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una nueva cita.
 * Requiere que el paciente ya exista en Dexie.
 * @returns ID de la cita creada
 */
export async function crearCita(datos: CitaFormData): Promise<string> {
  const ahora  = Date.now();
  const citaId = crypto.randomUUID();

  // Obtener el dueñoId del paciente
  const paciente = await db.pacientes.get(datos.pacienteId);
  if (!paciente) throw new Error(`Paciente ${datos.pacienteId} no encontrado`);

  const nuevaCita: CitaLocal = {
    id:               citaId,
    pacienteId:       datos.pacienteId,
    duenoId:          paciente.duenoId,
    clinicaId:        CLINICA_ID,
    fecha:            datos.fecha,
    horaInicio:       datos.horaInicio,
    duracionMinutos:  datos.duracionMinutos as number,
    tipo:             datos.tipo,
    estado:           'pendiente',
    motivo:           datos.motivo,
    veterinario:      datos.veterinario || undefined,
    notas:            datos.notas       || undefined,
    creadoEn:         ahora,
    syncStatus:       'pending',
    updatedAt:        ahora,
  };

  await db.citas.add(nuevaCita);
  await encolarSync({
    coleccion: 'citas', documentoId: citaId, operacion: 'create',
    datos: nuevaCita, intentos: 0, creadoEn: ahora,
  });

  return citaId;
}

/**
 * Cambia el estado de una cita (acción rápida desde la tarjeta).
 */
export async function cambiarEstadoCita(id: string, estado: EstadoCita): Promise<void> {
  const ahora = Date.now();
  await db.citas.update(id, { estado, updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({
    coleccion: 'citas', documentoId: id, operacion: 'update',
    datos: { id, estado, updatedAt: ahora },
    intentos: 0, creadoEn: ahora,
  });
}

/**
 * Actualiza campos específicos de una cita.
 */
export async function actualizarCita(
  id: string,
  cambios: Partial<Omit<CitaLocal, 'id' | 'creadoEn' | 'clinicaId' | 'pacienteId' | 'duenoId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };
  await db.citas.update(id, payload);
  await encolarSync({
    coleccion: 'citas', documentoId: id, operacion: 'update',
    datos: { id, ...payload }, intentos: 0, creadoEn: ahora,
  });
}

/** Soft delete */
export async function eliminarCita(id: string): Promise<void> {
  const ahora = Date.now();
  await db.citas.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({
    coleccion: 'citas', documentoId: id, operacion: 'delete',
    datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

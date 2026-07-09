'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { AppointmentLocal, AppointmentStatus } from '@/types/appointment';
import type { CitaFormData } from '@/lib/validations/appointment.schema';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna un mapa fecha→conteo de appointments activas para todo un mes.
 * Usado por el calendario mensual de la agenda.
 */
export function useMonthlyAppointments(year: number, month: number) {
  // month es 0-indexed (como JS Date)
  const primerDia = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const ultimoDia = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const appointments = await db.appointments
      .where('fecha')
      .between(primerDia, ultimoDia, true, true)
      .filter((c) => !c.deletedAt && c.clinicaId === clinicaId && c.estado !== 'cancelada')
      .toArray();

    const map = new Map<string, number>();
    for (const c of appointments) {
      map.set(c.fecha, (map.get(c.fecha) ?? 0) + 1);
    }
    return map;
  }, [primerDia, ultimoDia]);

  return resultado ?? new Map<string, number>();
}

/**
 * Retorna todas las appointments activas de un día específico, ordenadas por hora.
 * @param fecha - "YYYY-MM-DD"
 */
export function useCitasDelDia(fecha: string) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const appointments = await db.appointments
      .where('fecha')
      .equals(fecha)
      .filter((c) => !c.deletedAt && c.clinicaId === clinicaId)
      .toArray();

    // Ordenar por horaInicio
    appointments.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    // Join con patients y dueños en una sola pasada
    const pacienteIds = [...new Set(appointments.map((c) => c.pacienteId))];
    const duenoIds    = [...new Set(appointments.map((c) => c.duenoId))];

    const [patients, duenos] = await Promise.all([
      db.patients.bulkGet(pacienteIds),
      db.owners.bulkGet(duenoIds),
    ]);

    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));
    const duenosMap    = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return appointments.map((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
      nombreDueno:     duenosMap.get(c.duenoId)?.nombre,
      telefonoDueno:   duenosMap.get(c.duenoId)?.telefono,
    }));
  }, [fecha]);

  return {
    appointments:    resultado ?? [],
    loading: resultado === undefined,
  };
}

/**
 * Retorna las próximas N appointments confirmadas/pendientes desde hoy.
 */
export function useCitasProximas(limite = 5) {
  const hoy = new Date().toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const appointments = await db.appointments
      .where('fecha')
      .aboveOrEqual(hoy)
      .filter(
        (c) =>
          !c.deletedAt &&
          c.clinicaId === clinicaId &&
          (c.estado === 'pendiente' || c.estado === 'confirmada')
      )
      .limit(limite)
      .toArray();

    appointments.sort((a, b) =>
      a.fecha === b.fecha
        ? a.horaInicio.localeCompare(b.horaInicio)
        : a.fecha.localeCompare(b.fecha)
    );

    const pacienteIds = [...new Set(appointments.map((c) => c.pacienteId))];
    const patients   = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return appointments.map((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
    }));
  }, [hoy, limite]);

  return {
    appointments:    resultado ?? [],
    loading: resultado === undefined,
  };
}

/**
 * Retorna las appointments de un paciente específico.
 */
export function usePatientAppointments(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.appointments
      .where('pacienteId')
      .equals(pacienteId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    appointments:    resultado ?? [],
    loading: resultado === undefined,
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
export async function createAppointment(datos: CitaFormData): Promise<string> {
  const ahora  = Date.now();
  const citaId = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  // Obtener el dueñoId del paciente
  const paciente = await db.patients.get(datos.pacienteId);
  if (!paciente) throw new Error(`Patient ${datos.pacienteId} no encontrado`);

  const nuevaCita: AppointmentLocal = {
    id:               citaId,
    pacienteId:       datos.pacienteId,
    duenoId:          paciente.duenoId,
    clinicaId:        clinicaId,
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

  await db.appointments.add(nuevaCita);
  await encolarSync({
    coleccion: 'appointments', documentoId: citaId, operacion: 'create',
    datos: nuevaCita, intentos: 0, creadoEn: ahora,
  });

  return citaId;
}

/**
 * Cambia el estado de una cita (acción rápida desde la tarjeta).
 */
export async function cambiarEstadoCita(id: string, estado: AppointmentStatus): Promise<void> {
  const ahora = Date.now();
  await db.appointments.update(id, { estado, updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({
    coleccion: 'appointments', documentoId: id, operacion: 'update',
    datos: { id, estado, updatedAt: ahora },
    intentos: 0, creadoEn: ahora,
  });
}

/**
 * Actualiza campos específicos de una cita.
 */
export async function updateAppointment(
  id: string,
  cambios: Partial<Omit<AppointmentLocal, 'id' | 'creadoEn' | 'clinicaId' | 'pacienteId' | 'duenoId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };
  await db.appointments.update(id, payload);
  await encolarSync({
    coleccion: 'appointments', documentoId: id, operacion: 'update',
    datos: { id, ...payload }, intentos: 0, creadoEn: ahora,
  });
}

/** Soft delete */
export async function eliminarCita(id: string): Promise<void> {
  const ahora = Date.now();
  await db.appointments.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({
    coleccion: 'appointments', documentoId: id, operacion: 'delete',
    datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

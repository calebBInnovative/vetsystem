'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { AppointmentLocal, AppointmentStatus } from '@/types/appointment';
import type { CitaFormData } from '@/lib/validations/appointment.schema';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a date→count map of active appointments for an entire month.
 * Used by the monthly calendar view.
 */
export function useMonthlyAppointments(year: number, month: number) {
  const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay  = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const appointments = await db.appointments
      .where('date')
      .between(firstDay, lastDay, true, true)
      .filter((c) => !c.deletedAt && c.clinicId === clinicId && c.status !== 'cancelled')
      .toArray();

    const map = new Map<string, number>();
    for (const c of appointments) {
      map.set(c.date, (map.get(c.date) ?? 0) + 1);
    }
    return map;
  }, [firstDay, lastDay]);

  return result ?? new Map<string, number>();
}

/**
 * Returns all active appointments for a specific day, sorted by time.
 * @param date - "YYYY-MM-DD"
 */
export function useCitasDelDia(date: string) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const appointments = await db.appointments
      .where('date')
      .equals(date)
      .filter((c) => !c.deletedAt && c.clinicId === clinicId)
      .toArray();

    appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const patientIds = [...new Set(appointments.map((c) => c.patientId))];
    const ownerIds   = [...new Set(appointments.map((c) => c.ownerId))];

    const [patients, owners] = await Promise.all([
      db.patients.bulkGet(patientIds),
      db.owners.bulkGet(ownerIds),
    ]);

    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));
    const ownerMap   = new Map(owners.filter(Boolean).map((d) => [d!.id, d!]));

    return appointments.map((c) => ({
      ...c,
      patientName:    patientMap.get(c.patientId)?.name,
      patientSpecies: patientMap.get(c.patientId)?.species,
      ownerName:      ownerMap.get(c.ownerId)?.name,
      ownerPhone:     ownerMap.get(c.ownerId)?.phone,
    }));
  }, [date]);

  return {
    appointments: result ?? [],
    loading: result === undefined,
  };
}

/**
 * Returns the next N confirmed/pending appointments from today.
 */
export function useCitasProximas(limit = 5) {
  const today = new Date().toISOString().slice(0, 10);

  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const appointments = await db.appointments
      .where('date')
      .aboveOrEqual(today)
      .filter(
        (c) =>
          !c.deletedAt &&
          c.clinicId === clinicId &&
          (c.status === 'pending' || c.status === 'confirmed')
      )
      .limit(limit)
      .toArray();

    appointments.sort((a, b) =>
      a.date === b.date
        ? a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date)
    );

    const patientIds = [...new Set(appointments.map((c) => c.patientId))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return appointments.map((c) => ({
      ...c,
      patientName:    patientMap.get(c.patientId)?.name,
      patientSpecies: patientMap.get(c.patientId)?.species,
    }));
  }, [today, limit]);

  return {
    appointments: result ?? [],
    loading: result === undefined,
  };
}

/**
 * Returns appointments for a specific patient.
 */
export function usePatientAppointments(patientId: string) {
  const result = useLiveQuery(async () => {
    return db.appointments
      .where('patientId')
      .equals(patientId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('date');
  }, [patientId]);

  return {
    appointments: result ?? [],
    loading: result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new appointment.
 * Requires the patient to already exist in Dexie.
 * @returns ID of the created appointment
 */
export async function createAppointment(data: CitaFormData): Promise<string> {
  const now          = Date.now();
  const appointmentId = crypto.randomUUID();
  const clinicId     = await getClinicaId();

  const patient = await db.patients.get(data.patientId);
  if (!patient) throw new Error(`Patient ${data.patientId} not found`);

  const newAppointment: AppointmentLocal = {
    id:              appointmentId,
    patientId:       data.patientId,
    ownerId:         patient.ownerId,
    clinicId:        clinicId,
    date:            data.date,
    startTime:       data.startTime,
    durationMinutes: data.durationMinutes as number,
    type:            data.type,
    status:          'pending',
    reason:          data.reason,
    veterinarian:    data.veterinarian || undefined,
    notes:           data.notes       || undefined,
    createdAt:       now,
    syncStatus:      'pending',
    updatedAt:       now,
  };

  await db.appointments.add(newAppointment);
  await enqueueSync({
    collection: 'appointments', documentId: appointmentId, operation: 'create',
    data: newAppointment, attempts: 0, createdAt: now,
  });

  return appointmentId;
}

/**
 * Changes the status of an appointment (quick action from card).
 */
export async function cambiarEstadoCita(id: string, status: AppointmentStatus): Promise<void> {
  const now = Date.now();
  await db.appointments.update(id, { status, updatedAt: now, syncStatus: 'pending' });
  await enqueueSync({
    collection: 'appointments', documentId: id, operation: 'update',
    data: { id, status, updatedAt: now },
    attempts: 0, createdAt: now,
  });
}

/**
 * Updates specific fields of an appointment.
 */
export async function updateAppointment(
  id: string,
  changes: Partial<Omit<AppointmentLocal, 'id' | 'createdAt' | 'clinicId' | 'patientId' | 'ownerId'>>
): Promise<void> {
  const now     = Date.now();
  const payload = { ...changes, updatedAt: now, syncStatus: 'pending' as const };
  await db.appointments.update(id, payload);
  await enqueueSync({
    collection: 'appointments', documentId: id, operation: 'update',
    data: { id, ...payload }, attempts: 0, createdAt: now,
  });
}

/** Soft delete */
export async function eliminarCita(id: string): Promise<void> {
  const now = Date.now();
  await db.appointments.update(id, { deletedAt: now, syncStatus: 'pending', updatedAt: now });
  await enqueueSync({
    collection: 'appointments', documentId: id, operation: 'delete',
    data: { id, deletedAt: now }, attempts: 0, createdAt: now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function enqueueSync(item: Omit<SyncQueueItem, 'id'> & { data: object }): Promise<void> {
  const { data, ...rest } = item;
  await db.syncQueue.add({ ...rest, data: data } as SyncQueueItem);
}

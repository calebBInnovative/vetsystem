'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';

/** Returns all dashboard KPIs in a single reactive query. */
export function useDashboard() {
  const today = new Date().toISOString().slice(0, 10);

  const data = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const [
      totalPatients,
      appointmentsToday,
      appointmentsPendingToday,
      lowStockProducts,
      consultationsThisMonth,
    ] = await Promise.all([
      // Active patients
      db.patients
        .where('clinicId').equals(clinicId)
        .filter((p) => !p.deletedAt && p.active)
        .count(),

      // All appointments today
      db.appointments
        .where('date').equals(today)
        .filter((c) => !c.deletedAt && c.clinicId === clinicId)
        .count(),

      // Pending or confirmed appointments today
      db.appointments
        .where('date').equals(today)
        .filter(
          (c) =>
            !c.deletedAt &&
            c.clinicId === clinicId &&
            (c.status === 'pending' || c.status === 'confirmed' || c.status === 'in_progress')
        )
        .count(),

      // Products at or below minimum stock
      db.products
        .where('clinicId').equals(clinicId)
        .filter((p) => !p.deletedAt && p.active && p.currentStock <= p.minimumStock)
        .count(),

      // Consultations registered this month
      db.consultations
        .where('clinicId').equals(clinicId)
        .filter((c) => {
          if (c.deletedAt) return false;
          const date  = new Date(c.date);
          const now   = new Date();
          return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth()    === now.getMonth()
          );
        })
        .count(),
    ]);

    return {
      totalPatients,
      appointmentsToday,
      appointmentsPendingToday,
      lowStockProducts,
      consultationsThisMonth,
    };
  }, [today]);

  return {
    kpis:    data,
    loading: data === undefined,
  };
}

/** Upcoming appointments for today with patient data joined */
export function useProximasCitasDia() {
  const today       = new Date().toISOString().slice(0, 10);
  const currentTime = new Date().toTimeString().slice(0, 5);

  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const appointments = await db.appointments
      .where('date').equals(today)
      .filter(
        (c) =>
          !c.deletedAt &&
          c.clinicId === clinicId &&
          (c.status === 'pending' || c.status === 'confirmed' || c.status === 'in_progress') &&
          c.startTime >= currentTime
      )
      .toArray();

    appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const patientIds = [...new Set(appointments.map((c) => c.patientId))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return appointments.slice(0, 6).map((c) => ({
      ...c,
      patientName:    patientMap.get(c.patientId)?.name ?? 'Patient',
      patientSpecies: patientMap.get(c.patientId)?.species,
    }));
  }, [today, currentTime]);

  return {
    appointments: result ?? [],
    loading:      result === undefined,
  };
}

/** Last 5 consultations registered at the clinic */
export function useUltimasConsultasDashboard() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const consultations = await db.consultations
      .where('clinicId').equals(clinicId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('date')
      .then((arr) => arr.slice(0, 5));

    const patientIds = [...new Set(consultations.map((c) => c.patientId))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return consultations.map((c) => ({
      ...c,
      patientName: patientMap.get(c.patientId)?.name ?? 'Patient',
    }));
  }, []);

  return {
    consultations: result ?? [],
    loading:       result === undefined,
  };
}

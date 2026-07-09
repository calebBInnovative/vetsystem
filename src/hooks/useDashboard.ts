'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';

/** Retorna todos los KPIs del dashboard en una sola query reactiva. */
export function useDashboard() {
  const hoy = new Date().toISOString().slice(0, 10);

  const datos = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const [
      totalPacientes,
      citasHoy,
      citasPendientesHoy,
      productosStockBajo,
      consultasEsteMes,
    ] = await Promise.all([
      // Pacientes activos
      db.patients
        .where('clinicaId').equals(clinicaId)
        .filter((p) => !p.deletedAt && p.activo)
        .count(),

      // Citas de hoy (todas)
      db.appointments
        .where('fecha').equals(hoy)
        .filter((c) => !c.deletedAt && c.clinicaId === clinicaId)
        .count(),

      // Citas de hoy pendientes o confirmadas
      db.appointments
        .where('fecha').equals(hoy)
        .filter(
          (c) =>
            !c.deletedAt &&
            c.clinicaId === clinicaId &&
            (c.estado === 'pendiente' || c.estado === 'confirmada' || c.estado === 'en_curso')
        )
        .count(),

      // Productos con stock bajo o sin stock
      db.products
        .where('clinicaId').equals(clinicaId)
        .filter((p) => !p.deletedAt && p.activo && p.stockActual <= p.stockMinimo)
        .count(),

      // Consultas registradas este mes
      db.consultations
        .where('clinicaId').equals(clinicaId)
        .filter((c) => {
          if (c.deletedAt) return false;
          const fecha = new Date(c.fecha);
          const ahora = new Date();
          return (
            fecha.getFullYear() === ahora.getFullYear() &&
            fecha.getMonth()    === ahora.getMonth()
          );
        })
        .count(),
    ]);

    return {
      totalPacientes,
      citasHoy,
      citasPendientesHoy,
      productosStockBajo,
      consultasEsteMes,
    };
  }, [hoy]);

  return {
    kpis:     datos,
    loading: datos === undefined,
  };
}

/** Próximas appointments del día con datos de paciente unidos. */
export function useProximasCitasDia() {
  const hoy = new Date().toISOString().slice(0, 10);
  const horaActual = new Date().toTimeString().slice(0, 5);

  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const appointments = await db.appointments
      .where('fecha').equals(hoy)
      .filter(
        (c) =>
          !c.deletedAt &&
          c.clinicaId === clinicaId &&
          (c.estado === 'pendiente' || c.estado === 'confirmada' || c.estado === 'en_curso') &&
          c.horaInicio >= horaActual
      )
      .toArray();

    appointments.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    const pacienteIds = [...new Set(appointments.map((c) => c.pacienteId))];
    const patients   = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return appointments.slice(0, 6).map((c) => ({
      ...c,
      nombrePaciente:  pacientesMap.get(c.pacienteId)?.nombre ?? 'Patient',
      especiePaciente: pacientesMap.get(c.pacienteId)?.especie,
    }));
  }, [hoy, horaActual]);

  return {
    appointments:    resultado ?? [],
    loading: resultado === undefined,
  };
}

/** Últimas 5 consultations registradas en la clínica. */
export function useUltimasConsultasDashboard() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const consultations = await db.consultations
      .where('clinicaId').equals(clinicaId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('fecha')
      .then((arr) => arr.slice(0, 5));

    const pacienteIds = [...new Set(consultations.map((c) => c.pacienteId))];
    const patients   = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return consultations.map((c) => ({
      ...c,
      nombrePaciente: pacientesMap.get(c.pacienteId)?.nombre ?? 'Patient',
    }));
  }, []);

  return {
    consultations: resultado ?? [],
    loading:  resultado === undefined,
  };
}

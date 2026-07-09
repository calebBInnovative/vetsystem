// ─────────────────────────────────────────────────────────────────────────────
// HOOK — usePatients
//
// Centraliza toda la lógica de datos del módulo Pacientes:
//   - Hooks reactivos (useLiveQuery) para la UI
//   - Mutaciones que escriben en Dexie + encolan en syncQueue
//
// Convención: las funciones que mutan datos son async y se exportan sueltas
// (no como métodos del hook) para poder usarlas fuera de componentes React.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { PatientLocal, OwnerLocal, PatientWithOwner } from '@/types/patient';
import type { PacienteFormData } from '@/lib/validations/patient.schema';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA (reactivos — se actualizan solos cuando cambia Dexie)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna la lista de patients activos con su dueño ya unido.
 * Si se pasa un `busqueda`, filtra por nombre del paciente, raza, especie,
 * nombre del dueño o teléfono del dueño.
 *
 * @param busqueda - Término de búsqueda (case-insensitive). Vacío = todos.
 */
export function usePatients(busqueda = '') {
  const resultado = useLiveQuery(async () => {
    const termino = busqueda.toLowerCase().trim();

    if (!termino) {
      // Sin búsqueda: ruta optimizada usando índice de Dexie
      const patients = await db.patients
        .filter((p) => !p.deletedAt && p.activo)
        .reverse()
        .sortBy('updatedAt');

      // Cargar dueños en una sola consulta (bulkGet es más eficiente que N gets)
      const duenoIds = [...new Set(patients.map((p) => p.duenoId))];
      const duenos   = await db.owners.bulkGet(duenoIds);
      const duenosMap = new Map(
        duenos.filter(Boolean).map((d) => [d!.id, d!])
      );

      return patients.map((p) => ({
        ...p,
        dueno: duenosMap.get(p.duenoId),
      })) as PatientWithOwner[];
    }

    // Con búsqueda: carga todo en memoria y filtra (datos pequeños en IndexedDB,
    // esto es más rápido que múltiples queries con índices parciales)
    const [todosPacientes, todosDuenos] = await Promise.all([
      db.patients.filter((p) => !p.deletedAt && p.activo).toArray(),
      db.owners.toArray(),
    ]);

    const duenosMap = new Map(todosDuenos.map((d) => [d.id, d]));

    const coinciden = todosPacientes.filter((p) => {
      const d = duenosMap.get(p.duenoId);
      return (
        p.nombre.toLowerCase().includes(termino) ||
        (p.raza?.toLowerCase().includes(termino) ?? false) ||
        p.especie.includes(termino) ||
        (d?.nombre.toLowerCase().includes(termino) ?? false) ||
        (d?.telefono.includes(termino) ?? false)
      );
    });

    return coinciden
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ ...p, dueno: duenosMap.get(p.duenoId) })) as PatientWithOwner[];
  }, [busqueda]);

  return {
    patients: resultado ?? [],
    /** `true` mientras useLiveQuery carga por primera vez */
    loading: resultado === undefined,
  };
}

/**
 * Retorna un paciente específico con su dueño.
 * Devuelve `null` si no existe o fue eliminado.
 */
export function usePatient(id: string) {
  const resultado = useLiveQuery(async () => {
    const paciente = await db.patients.get(id);
    if (!paciente || paciente.deletedAt) return null;
    const dueno = await db.owners.get(paciente.duenoId);
    return { ...paciente, dueno } as PatientWithOwner;
  }, [id]);

  return {
    paciente: resultado ?? null,
    loading: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// Siguen el patrón: escribir en Dexie → encolar en syncQueue → retornar.
// La UI no espera a Firebase. Firebase se actualiza cuando hay conexión.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un nuevo paciente y su dueño (o actualiza al dueño existente si el
 * teléfono ya está registrado — deduplicación inteligente).
 *
 * @returns ID del paciente creado
 */
export async function createPatient(datos: PacienteFormData): Promise<string> {
  const ahora = Date.now();
  const clinicaId = await getClinicaId();

  // ── 1. Gestionar dueño ─────────────────────────────────────────────────────
  const duenoExistente = await db.owners
    .filter(
      (d) => d.telefono === datos.dueno.telefono && d.clinicaId === clinicaId
    )
    .first();

  let duenoId: string;

  if (duenoExistente) {
    // El dueño ya existe — solo actualizar sus datos por si cambiaron
    duenoId = duenoExistente.id;
    await db.owners.update(duenoId, {
      nombre:    datos.dueno.nombre,
      email:     datos.dueno.email     || undefined,
      direccion: datos.dueno.direccion || undefined,
      notas:     datos.dueno.notas     || undefined,
      updatedAt: ahora,
      syncStatus: 'pending',
    });
    await encolarSync({
      coleccion: 'owners', documentoId: duenoId, operacion: 'update',
      datos: { id: duenoId, nombre: datos.dueno.nombre, updatedAt: ahora },
      intentos: 0, creadoEn: ahora,
    });
  } else {
    // Crear nuevo dueño
    duenoId = crypto.randomUUID();
    const nuevoDueno: OwnerLocal = {
      id:         duenoId,
      nombre:     datos.dueno.nombre,
      telefono:   datos.dueno.telefono,
      email:      datos.dueno.email     || undefined,
      direccion:  datos.dueno.direccion || undefined,
      notas:      datos.dueno.notas     || undefined,
      clinicaId:  clinicaId,
      creadoEn:   ahora,
      syncStatus: 'pending',
      updatedAt:  ahora,
    };
    await db.owners.add(nuevoDueno);
    await encolarSync({
      coleccion: 'owners', documentoId: duenoId, operacion: 'create',
      datos: nuevoDueno,
      intentos: 0, creadoEn: ahora,
    });
  }

  // ── 2. Crear paciente ──────────────────────────────────────────────────────
  const pacienteId  = crypto.randomUUID();
  const nuevoPaciente: PatientLocal = {
    id:              pacienteId,
    nombre:          datos.nombre,
    especie:         datos.especie,
    raza:            datos.raza            || undefined,
    sexo:            datos.sexo,
    fechaNacimiento: datos.fechaNacimiento || undefined,
    peso:            datos.peso,
    color:           datos.color           || undefined,
    notas:           datos.notas           || undefined,
    fotoUrl:         undefined,
    duenoId,
    activo:          true,
    clinicaId:       clinicaId,
    creadoEn:        ahora,
    syncStatus:      'pending',
    updatedAt:       ahora,
  };

  await db.patients.add(nuevoPaciente);
  await encolarSync({
    coleccion: 'patients', documentoId: pacienteId, operacion: 'create',
    datos: nuevoPaciente,
    intentos: 0, creadoEn: ahora,
  });

  return pacienteId;
}

/**
 * Actualiza campos específicos de un paciente.
 * No sobreescribe campos que no se pasen.
 */
export async function updatePatient(
  id: string,
  cambios: Partial<Omit<PatientLocal, 'id' | 'creadoEn' | 'clinicaId'>>
): Promise<void> {
  const ahora   = Date.now();
  const payload = { ...cambios, updatedAt: ahora, syncStatus: 'pending' as const };

  await db.patients.update(id, payload);
  await encolarSync({
    coleccion: 'patients', documentoId: id, operacion: 'update',
    datos: { id, ...payload },
    intentos: 0, creadoEn: ahora,
  });
}

/**
 * Soft delete: marca `deletedAt` sin borrar el registro de Dexie.
 * Esto permite sincronizar la eliminación con Firestore cuando vuelva internet.
 */
export async function deletePatient(id: string): Promise<void> {
  const ahora = Date.now();

  await db.patients.update(id, {
    deletedAt:  ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  });
  await encolarSync({
    coleccion: 'patients', documentoId: id, operacion: 'delete',
    datos: { id, deletedAt: ahora },
    intentos: 0, creadoEn: ahora,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ─────────────────────────────────────────────────────────────────────────────

/** Agrega una operación a la cola de sincronización con Firestore */
async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

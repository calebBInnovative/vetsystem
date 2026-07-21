// ─────────────────────────────────────────────────────────────────────────────
// HOOK — usePatients
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { PatientLocal, OwnerLocal, PatientWithOwner } from '@/types/patient';
import type { PacienteFormData } from '@/lib/validations/patient.schema';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function usePatients(search = '') {
  const result = useLiveQuery(async () => {
    const term = search.toLowerCase().trim();

    if (!term) {
      const patients = await db.patients
        .filter((p) => !p.deletedAt && p.active)
        .reverse()
        .sortBy('updatedAt');

      const ownerIds = [...new Set(patients.map((p) => p.ownerId))];
      const owners   = await db.owners.bulkGet(ownerIds);
      const ownerMap = new Map(
        owners.filter(Boolean).map((d) => [d!.id, d!])
      );

      return patients.map((p) => ({
        ...p,
        owner: ownerMap.get(p.ownerId),
      })) as PatientWithOwner[];
    }

    const [allPatients, allOwners] = await Promise.all([
      db.patients.filter((p) => !p.deletedAt && p.active).toArray(),
      db.owners.toArray(),
    ]);

    const ownerMap = new Map(allOwners.map((d) => [d.id, d]));

    const matches = allPatients.filter((p) => {
      const o = ownerMap.get(p.ownerId);
      return (
        p.name.toLowerCase().includes(term) ||
        (p.breed?.toLowerCase().includes(term) ?? false) ||
        p.species.includes(term) ||
        (o?.name.toLowerCase().includes(term) ?? false) ||
        (o?.phone.includes(term) ?? false)
      );
    });

    return matches
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ ...p, owner: ownerMap.get(p.ownerId) })) as PatientWithOwner[];
  }, [search]);

  return {
    patients: result ?? [],
    loading:  result === undefined,
  };
}

export function usePatient(id: string) {
  const result = useLiveQuery(async () => {
    const patient = await db.patients.get(id);
    if (!patient || patient.deletedAt) return null;
    const owner = await db.owners.get(patient.ownerId);
    return { ...patient, owner } as PatientWithOwner;
  }, [id]);

  return {
    paciente: result ?? null,
    loading:  result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPatient(data: PacienteFormData): Promise<string> {
  const now      = Date.now();
  const clinicId = await getClinicaId();

  // ── 1. Manage owner ────────────────────────────────────────────────────────
  const existingOwner = await db.owners
    .filter(
      (d) => d.phone === data.owner.phone && d.clinicId === clinicId
    )
    .first();

  let ownerId: string;

  if (existingOwner) {
    ownerId = existingOwner.id;
    await db.owners.update(ownerId, {
      name:      data.owner.name,
      email:     data.owner.email   || undefined,
      address:   data.owner.address || undefined,
      notes:     data.owner.notes   || undefined,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await encolarSync({
      collection: 'owners', documentId: ownerId, operation: 'update',
      data: { id: ownerId, name: data.owner.name, updatedAt: now },
      attempts: 0, createdAt: now,
    });
  } else {
    ownerId = crypto.randomUUID();
    const newOwner: OwnerLocal = {
      id:         ownerId,
      name:       data.owner.name,
      phone:      data.owner.phone,
      email:      data.owner.email   || undefined,
      address:    data.owner.address || undefined,
      notes:      data.owner.notes   || undefined,
      clinicId:   clinicId,
      createdAt:  now,
      syncStatus: 'pending',
      updatedAt:  now,
    };
    await db.owners.add(newOwner);
    await encolarSync({
      collection: 'owners', documentId: ownerId, operation: 'create',
      data: newOwner,
      attempts: 0, createdAt: now,
    });
  }

  // ── 2. Create patient ──────────────────────────────────────────────────────
  const patientId    = crypto.randomUUID();
  const newPatient: PatientLocal = {
    id:         patientId,
    name:       data.name,
    species:    data.species,
    breed:      data.breed        || undefined,
    sex:        data.sex,
    birthDate:  data.birthDate    || undefined,
    weight:     data.weight,
    color:      data.color        || undefined,
    notes:      data.notes        || undefined,
    photoUrl:   undefined,
    ownerId,
    active:     true,
    clinicId:   clinicId,
    createdAt:  now,
    syncStatus: 'pending',
    updatedAt:  now,
  };

  await db.patients.add(newPatient);
  await encolarSync({
    collection: 'patients', documentId: patientId, operation: 'create',
    data: newPatient,
    attempts: 0, createdAt: now,
  });

  return patientId;
}

export async function updatePatient(
  id: string,
  changes: Partial<Omit<PatientLocal, 'id' | 'createdAt' | 'clinicId'>>
): Promise<void> {
  const now     = Date.now();
  const payload = { ...changes, updatedAt: now, syncStatus: 'pending' as const };

  await db.patients.update(id, payload);
  await encolarSync({
    collection: 'patients', documentId: id, operation: 'update',
    data: { id, ...payload },
    attempts: 0, createdAt: now,
  });
}

export async function deletePatient(id: string): Promise<void> {
  const now = Date.now();

  await db.patients.update(id, {
    deletedAt:  now,
    syncStatus: 'pending',
    updatedAt:  now,
  });
  await encolarSync({
    collection: 'patients', documentId: id, operation: 'delete',
    data: { id, deletedAt: now },
    attempts: 0, createdAt: now,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

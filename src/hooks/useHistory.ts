// ─────────────────────────────────────────────────────────────────────────────
// HOOK — useHistory
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultationLocal } from '@/types/consultation';
import type { ConsultaFormData } from '@/lib/validations/history.schema';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function usePatientHistory(patientId: string) {
  const result = useLiveQuery(async () => {
    return db.consultations
      .where('patientId')
      .equals(patientId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('date');
  }, [patientId]);

  return {
    consultations: result ?? [],
    loading:       result === undefined,
  };
}

export function useConsultation(id: string) {
  const result = useLiveQuery(async () => {
    const consultation = await db.consultations.get(id);
    if (!consultation || consultation.deletedAt) return null;
    return consultation;
  }, [id]);

  return {
    consulta: result ?? null,
    loading:  result === undefined,
  };
}

export function useRecentConsultations(limit = 10) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    return db.consultations
      .where('clinicId')
      .equals(clinicId)
      .filter((c) => !c.deletedAt)
      .reverse()
      .sortBy('date')
      .then((consultations) => consultations.slice(0, limit));
  }, [limit]);

  return {
    consultations: result ?? [],
    loading:       result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createHistoryEntry(
  patientId: string,
  data: ConsultaFormData
): Promise<string> {
  const now            = Date.now();
  const consultationId = crypto.randomUUID();
  const clinicId       = await getClinicaId();

  const patient = await db.patients.get(patientId);

  const newConsultation: ConsultationLocal = {
    id:           consultationId,
    patientId,
    ownerId:      patient?.ownerId ?? '',
    clinicId:     clinicId,
    date:         new Date(data.date).getTime(),
    type:         data.type,
    status:       'completed',
    reason:       data.reason,
    temperature:  data.temperature,
    weight:       data.consultationWeight ?? undefined,
    diagnosis:    data.diagnosis    || undefined,
    treatment:    data.treatment    || undefined,
    observations: data.observations || undefined,
    veterinarian: data.veterinarian || undefined,
    items:        [],
    subtotal:     0,
    discount:     0,
    total:        0,
    createdAt:    now,
    syncStatus:   'pending',
    updatedAt:    now,
  };

  await db.consultations.add(newConsultation);
  await encolarSync({
    collection: 'consultations', documentId: consultationId, operation: 'create',
    data: newConsultation,
    attempts: 0, createdAt: now,
  });

  return consultationId;
}

export async function updateHistoryEntry(
  id: string,
  changes: Partial<Omit<ConsultationLocal, 'id' | 'createdAt' | 'clinicId' | 'patientId'>>
): Promise<void> {
  const now     = Date.now();
  const payload = { ...changes, updatedAt: now, syncStatus: 'pending' as const };

  await db.consultations.update(id, payload);
  await encolarSync({
    collection: 'consultations', documentId: id, operation: 'update',
    data: { id, ...payload },
    attempts: 0, createdAt: now,
  });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const now = Date.now();

  await db.consultations.update(id, {
    deletedAt:  now,
    syncStatus: 'pending',
    updatedAt:  now,
  });
  await encolarSync({
    collection: 'consultations', documentId: id, operation: 'delete',
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

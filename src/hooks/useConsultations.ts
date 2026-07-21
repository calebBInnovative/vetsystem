'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ConsultationLocal, ConsultationWithPatient, ConsultationStatus, ConsultationType } from '@/types/consultation';
import type { ConsultaFormData } from '@/lib/validations/consultation.schema';

const DEFAULT_VETERINARIAN = 'Dra. Patricia Vega';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useConsultations(filters?: {
  status?: ConsultationStatus;
  type?: ConsultationType;
  dateFrom?: number;
  dateTo?: number;
}) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let consultations = await db.consultations
      .where('clinicId')
      .equals(clinicId)
      .filter((c) => !c.deletedAt)
      .toArray();

    if (filters?.status)   consultations = consultations.filter((c) => c.status === filters.status);
    if (filters?.type)     consultations = consultations.filter((c) => c.type   === filters.type);
    if (filters?.dateFrom) consultations = consultations.filter((c) => c.date   >= filters.dateFrom!);
    if (filters?.dateTo)   consultations = consultations.filter((c) => c.date   <= filters.dateTo!);

    consultations.sort((a, b) => b.date - a.date);

    const patientIds  = [...new Set(consultations.map((c) => c.patientId))];
    const patients    = await db.patients.bulkGet(patientIds);
    const patientMap  = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    const ownerIds    = [...new Set(consultations.map((c) => c.ownerId).filter(Boolean))];
    const owners      = await db.owners.bulkGet(ownerIds);
    const ownerMap    = new Map(owners.filter(Boolean).map((d) => [d!.id, d!]));

    return consultations.map<ConsultationWithPatient>((c) => ({
      ...c,
      patientName:    patientMap.get(c.patientId)?.name,
      patientSpecies: patientMap.get(c.patientId)?.species,
      ownerName:      ownerMap.get(c.ownerId)?.name,
    }));
  }, [filters?.status, filters?.type, filters?.dateFrom, filters?.dateTo]);

  return {
    consultations: result ?? [],
    loading: result === undefined,
  };
}

/** Consultations currently in progress */
export function useConsultasEnProceso() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const consultations = await db.consultations
      .where('status')
      .equals('in_progress')
      .filter((c) => !c.deletedAt && c.clinicId === clinicId)
      .toArray();

    const patientIds = [...new Set(consultations.map((c) => c.patientId))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return consultations.map<ConsultationWithPatient>((c) => ({
      ...c,
      patientName:    patientMap.get(c.patientId)?.name,
      patientSpecies: patientMap.get(c.patientId)?.species,
    }));
  }, []);

  return result ?? [];
}

/** Single consultation by ID with owner and patient joined */
export function useConsultation(id: string) {
  const result = useLiveQuery(async () => {
    const c = await db.consultations.get(id);
    if (!c || c.deletedAt) return null;

    const patient = await db.patients.get(c.patientId);
    const owner   = c.ownerId ? await db.owners.get(c.ownerId) : undefined;

    return {
      ...c,
      patientName:    patient?.name,
      patientSpecies: patient?.species,
      ownerName:      owner?.name,
      ownerPhone:     owner?.phone,
    };
  }, [id]);

  return {
    consulta: result ?? null,
    loading: result === undefined,
  };
}

/** All consultations for a specific patient */
export function useConsultasPaciente(patientId: string) {
  const result = useLiveQuery(async () => {
    const consultations = await db.consultations
      .where('patientId')
      .equals(patientId)
      .filter((c) => !c.deletedAt)
      .toArray();
    return consultations.sort((a, b) => b.date - a.date);
  }, [patientId]);

  return {
    consultations: result ?? [],
    loading: result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Opens a new consultation in "in_progress" status */
export async function startConsultation(data: {
  patientId: string;
  appointmentId?: string;
  type?: ConsultaFormData['type'];
  reason?: string;
}): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const clinicId = await getClinicaId();

  const patient = await db.patients.get(data.patientId);
  if (!patient) throw new Error('Patient not found');

  const newConsultation: ConsultationLocal = {
    id,
    patientId:     data.patientId,
    ownerId:       patient.ownerId,
    clinicId:      clinicId,
    appointmentId: data.appointmentId,
    date:          now,
    type:          data.type ?? 'general_consultation',
    status:        'in_progress',
    reason:        data.reason ?? '',
    items:         [],
    subtotal:      0,
    discount:      0,
    total:         0,
    veterinarian:  DEFAULT_VETERINARIAN,
    createdAt:     now,
    syncStatus:    'pending',
    updatedAt:     now,
  };

  await db.consultations.add(newConsultation);
  await encolarSync({ collection: 'consultations', documentId: id, operation: 'create', data: newConsultation, attempts: 0, createdAt: now });

  // If from an appointment, mark it as in_progress
  if (data.appointmentId) {
    await db.appointments.update(data.appointmentId, { status: 'in_progress', updatedAt: now, syncStatus: 'pending' });
    await encolarSync({ collection: 'appointments', documentId: data.appointmentId, operation: 'update', data: { id: data.appointmentId, status: 'in_progress', updatedAt: now }, attempts: 0, createdAt: now });
  }

  return id;
}

/** Auto-save: persist clinical data without finalizing */
export async function saveConsultation(id: string, data: ConsultaFormData): Promise<void> {
  const now       = Date.now();
  const subtotal  = calcSubtotal(data.items ?? []);
  const discount  = data.discount ?? 0;
  const total     = Math.max(0, subtotal - discount);

  const changes: Partial<ConsultationLocal> = {
    type:              data.type,
    reason:            data.reason,
    weight:            data.weight,
    temperature:       data.temperature,
    heartRate:         data.heartRate,
    respiratoryRate:   data.respiratoryRate,
    anamnesis:         data.anamnesis    || undefined,
    physicalExam:      data.physicalExam || undefined,
    diagnosis:         data.diagnosis    || undefined,
    treatment:         data.treatment    || undefined,
    observations:      data.observations || undefined,
    nextVisit:         data.nextVisit    || undefined,
    veterinarian:      data.veterinarian || undefined,
    items:             data.items,
    subtotal,
    discount,
    total,
    updatedAt:         now,
    syncStatus:        'pending',
  };

  await db.consultations.update(id, changes);
  await encolarSync({ collection: 'consultations', documentId: id, operation: 'update', data: { id, ...changes }, attempts: 0, createdAt: now });
}

/** Finalize: update inventory, mark appointment completed */
export async function finalizeConsultation(id: string, data: ConsultaFormData): Promise<void> {
  const now       = Date.now();
  const subtotal  = calcSubtotal(data.items ?? []);
  const discount  = data.discount ?? 0;
  const total     = Math.max(0, subtotal - discount);
  const clinicId  = await getClinicaId();

  await db.transaction('rw',
    [db.consultations, db.products, db.movements, db.appointments, db.syncQueue],
    async () => {
      const consultation = await db.consultations.get(id);
      if (!consultation) throw new Error('Consultation not found');

      // 1 — Save full clinical data and mark completed
      await db.consultations.update(id, {
        type:              data.type,
        reason:            data.reason,
        weight:            data.weight,
        temperature:       data.temperature,
        heartRate:         data.heartRate,
        respiratoryRate:   data.respiratoryRate,
        anamnesis:         data.anamnesis    || undefined,
        physicalExam:      data.physicalExam || undefined,
        diagnosis:         data.diagnosis    || undefined,
        treatment:         data.treatment    || undefined,
        observations:      data.observations || undefined,
        nextVisit:         data.nextVisit    || undefined,
        veterinarian:      data.veterinarian || undefined,
        items:             data.items,
        subtotal,
        discount,
        total,
        status:     'completed',
        updatedAt:  now,
        syncStatus: 'pending',
      });

      // 2 — Deduct inventory for each product item (not services)
      for (const item of (data.items ?? []).filter((i) => !i.isService && i.productId)) {
        const prod = await db.products.get(item.productId!);
        if (!prod) continue;
        const newStock = Math.max(0, prod.currentStock - item.quantity);
        await db.products.update(item.productId!, {
          currentStock: newStock,
          updatedAt:    now,
          syncStatus:   'pending',
        });
        await encolarSync({ collection: 'products', documentId: item.productId!, operation: 'update', data: { id: item.productId!, currentStock: newStock, updatedAt: now }, attempts: 0, createdAt: now });

        const movId = crypto.randomUUID();
        await db.movements.add({
          id:          movId,
          productId:   item.productId!,
          clinicId:    clinicId,
          type:        'exit',
          quantity:    item.quantity,
          stockBefore: prod.currentStock,
          stockAfter:  newStock,
          reason:      `Consultation #${id.slice(0, 8)}`,
          referenceId: id,
          createdAt:   now,
          syncStatus:  'pending',
          updatedAt:   now,
        });
        await encolarSync({ collection: 'movements', documentId: movId, operation: 'create', data: { id: movId, productId: item.productId!, clinicId, type: 'exit', quantity: item.quantity, stockBefore: prod.currentStock, stockAfter: newStock, reason: `Consultation #${id.slice(0, 8)}`, referenceId: id, createdAt: now, syncStatus: 'pending', updatedAt: now }, attempts: 0, createdAt: now });
      }

      // 3 — Mark appointment as completed if linked
      if (consultation.appointmentId) {
        await db.appointments.update(consultation.appointmentId, { status: 'completed', updatedAt: now, syncStatus: 'pending' });
        await encolarSync({ collection: 'appointments', documentId: consultation.appointmentId, operation: 'update', data: { id: consultation.appointmentId, status: 'completed', updatedAt: now }, attempts: 0, createdAt: now });
      }

      // 4 — Enqueue full consultation sync
      const final = await db.consultations.get(id);
      if (final) {
        await encolarSync({ collection: 'consultations', documentId: id, operation: 'update', data: final, attempts: 0, createdAt: now });
      }
    }
  );
}

/** Cancel a consultation in progress */
export async function cancelConsultation(id: string): Promise<void> {
  const now = Date.now();
  await db.consultations.update(id, { status: 'cancelled', updatedAt: now, syncStatus: 'pending' });
  await encolarSync({ collection: 'consultations', documentId: id, operation: 'update', data: { id, status: 'cancelled', updatedAt: now }, attempts: 0, createdAt: now });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function calcSubtotal(items: ConsultaFormData['items']): number {
  return items.reduce((s, i) => s + i.subtotal, 0);
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

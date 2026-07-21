'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { Collaborator, CollaboratorPayment, CollaboratorPaymentFrequency } from '@/types/collaborator';
import {
  daysUntilCollaboratorPayment,
  calculateNextCollaboratorPayment,
  initialPaymentDate,
} from '@/types/collaborator';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useCollaborators() {
  const collaborators = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const list = await db.collaborators
      .where('clinicId')
      .equals(clinicId)
      .filter((c) => !c.deletedAt)
      .toArray();
    return list.sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  }, []);

  const collaboratorPayments = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    return db.collaboratorPayments
      .where('clinicId')
      .equals(clinicId)
      .toArray();
  }, []);

  return {
    collaborators: collaborators      ?? [],
    pagosColaboradores: collaboratorPayments ?? [],
    loading:            collaborators === undefined,
  };
}

export function useCollaboratorAlerts() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const list = await db.collaborators
      .where('clinicId')
      .equals(clinicId)
      .filter((c) => !c.deletedAt && c.active)
      .toArray();

    let overdue = 0;
    let urgent  = 0;

    for (const c of list) {
      const days = daysUntilCollaboratorPayment(c.nextPaymentDate);
      if (days < 0)  overdue++;
      else if (days <= 7) urgent++;
    }

    return { total: overdue + urgent, overdue, urgent };
  }, []);

  return result ?? { total: 0, overdue: 0, urgent: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCollaboratorInput {
  name:             string;
  role:             string;
  type:             Collaborator['type'];
  salary:           number;
  paymentFrequency: CollaboratorPaymentFrequency;
  phone?:           string;
  notes?:           string;
}

export async function createCollaborator(input: CreateCollaboratorInput): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const clinicId = await getClinicaId();

  const collaborator: Collaborator = {
    id,
    clinicId,
    name:             input.name,
    role:             input.role,
    type:             input.type,
    salary:           input.salary,
    paymentFrequency: input.paymentFrequency,
    nextPaymentDate:  initialPaymentDate(input.paymentFrequency),
    active:           true,
    phone:            input.phone,
    notes:            input.notes,
    syncStatus:       'pending',
    createdAt:        now,
    updatedAt:        now,
  };

  await db.collaborators.add(collaborator);
  await encolarSync({ collection: 'collaborators', documentId: id, operation: 'create', data: collaborator, attempts: 0, createdAt: now });
  return id;
}

export async function updateCollaborator(
  id: string,
  data: Partial<Pick<Collaborator, 'name' | 'role' | 'type' | 'salary' | 'paymentFrequency' | 'phone' | 'notes'>>,
): Promise<void> {
  const now     = Date.now();
  const updates: Partial<Collaborator> = { ...data, syncStatus: 'pending', updatedAt: now };

  if (data.paymentFrequency !== undefined) {
    updates.nextPaymentDate = initialPaymentDate(data.paymentFrequency);
  }

  await db.collaborators.update(id, updates);
  await encolarSync({ collection: 'collaborators', documentId: id, operation: 'update', data: { id, ...updates }, attempts: 0, createdAt: now });
}

export async function deleteCollaborator(id: string): Promise<void> {
  const now            = Date.now();
  const linkedPayments = await db.collaboratorPayments.where('collaboratorId').equals(id).toArray();

  await db.transaction('rw', [db.collaborators, db.collaboratorPayments, db.syncQueue], async () => {
    await db.collaborators.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });

    for (const payment of linkedPayments) {
      await db.collaboratorPayments.update(payment.id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
      await db.syncQueue.add({ collection: 'collaboratorPayments', documentId: payment.id, operation: 'delete', data: { id: payment.id, deletedAt: now, updatedAt: now }, attempts: 0, createdAt: now } as SyncQueueItem);
    }

    await db.syncQueue.add({ collection: 'collaborators', documentId: id, operation: 'delete', data: { id, deletedAt: now, updatedAt: now }, attempts: 0, createdAt: now } as SyncQueueItem);
  });
}

export async function registerCollaboratorPayment(
  collaboratorId: string,
  amount:         number,
  period:         string,
  paymentDate:    string,
  notes?:         string,
): Promise<void> {
  const now      = Date.now();
  const clinicId = await getClinicaId();

  const collaborator = await db.collaborators.get(collaboratorId);
  if (!collaborator) throw new Error('Collaborator not found');

  const paymentId = crypto.randomUUID();
  const payment: CollaboratorPayment = {
    id:             paymentId,
    clinicId,
    collaboratorId,
    amount,
    period,
    paymentDate,
    notes,
    syncStatus:     'pending',
    createdAt:      now,
    updatedAt:      now,
  };

  const nextPaymentDate  = calculateNextCollaboratorPayment(collaborator.nextPaymentDate, collaborator.paymentFrequency);
  const collabUpdates    = { nextPaymentDate, updatedAt: now, syncStatus: 'pending' as const };

  await db.transaction('rw', [db.collaborators, db.collaboratorPayments, db.syncQueue], async () => {
    await db.collaboratorPayments.add(payment);
    await db.collaborators.update(collaboratorId, collabUpdates);
    await db.syncQueue.add({ collection: 'collaboratorPayments', documentId: paymentId, operation: 'create', data: payment, attempts: 0, createdAt: now } as SyncQueueItem);
    await db.syncQueue.add({ collection: 'collaborators', documentId: collaboratorId, operation: 'update', data: { id: collaboratorId, ...collabUpdates }, attempts: 0, createdAt: now } as SyncQueueItem);
  });
}

export async function toggleCollaboratorActive(id: string): Promise<void> {
  const now          = Date.now();
  const collaborator = await db.collaborators.get(id);
  if (!collaborator) return;
  const updates = { active: !collaborator.active, updatedAt: now, syncStatus: 'pending' as const };
  await db.collaborators.update(id, updates);
  await encolarSync({ collection: 'collaborators', documentId: id, operation: 'update', data: { id, ...updates }, attempts: 0, createdAt: now });
}

/** @deprecated Use useCollaboratorAlerts instead */
export const useAlertasColaboradores = useCollaboratorAlerts;

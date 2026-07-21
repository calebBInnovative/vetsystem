'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { InvoiceLocal, InvoiceWithDetails, InvoiceStatus, InvoicePaymentMethod } from '@/types/invoice';
import type { ConsultationLocal } from '@/types/consultation';
import type { IncomeType } from '@/types/finances';
import { PAYMENT_TYPE_BY_CONSULTATION } from '@/types/consultation';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useInvoices(filters?: {
  status?: InvoiceStatus;
  patientId?: string;
  ownerId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let invoices = await db.invoices
      .where('clinicId')
      .equals(clinicId)
      .filter((f) => !f.deletedAt)
      .toArray();

    if (filters?.status)    invoices = invoices.filter((f) => f.status    === filters.status);
    if (filters?.patientId) invoices = invoices.filter((f) => f.patientId === filters.patientId);
    if (filters?.ownerId)   invoices = invoices.filter((f) => f.ownerId   === filters.ownerId);
    if (filters?.dateFrom)  invoices = invoices.filter((f) => f.date      >= filters.dateFrom!);
    if (filters?.dateTo)    invoices = invoices.filter((f) => f.date      <= filters.dateTo!);

    invoices.sort((a, b) => b.createdAt - a.createdAt);

    const patientIds  = [...new Set(invoices.map((f) => f.patientId).filter((id): id is string => !!id))];
    const ownerIds    = [...new Set(invoices.map((f) => f.ownerId).filter((id): id is string => !!id))];
    const patients    = await db.patients.bulkGet(patientIds);
    const owners      = await db.owners.bulkGet(ownerIds);
    const patientMap  = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));
    const ownerMap    = new Map(owners.filter(Boolean).map((d) => [d!.id, d!]));

    return invoices.map<InvoiceWithDetails>((f) => ({
      ...f,
      patientName:    f.patientId ? patientMap.get(f.patientId)?.name    : undefined,
      patientSpecies: f.patientId ? patientMap.get(f.patientId)?.species : undefined,
      patientBreed:   f.patientId ? patientMap.get(f.patientId)?.breed   : undefined,
      ownerName:      f.ownerId   ? ownerMap.get(f.ownerId)?.name        : undefined,
      ownerPhone:     f.ownerId   ? ownerMap.get(f.ownerId)?.phone       : undefined,
    }));
  }, [filters?.status, filters?.patientId, filters?.ownerId, filters?.dateFrom, filters?.dateTo]);

  return {
    invoices: result ?? [],
    loading: result === undefined,
  };
}

export function useInvoice(id: string) {
  const result = useLiveQuery(async () => {
    const f = await db.invoices.get(id);
    if (!f || f.deletedAt) return null;

    const patient = f.patientId ? await db.patients.get(f.patientId) : undefined;
    const owner   = f.ownerId   ? await db.owners.get(f.ownerId)     : undefined;

    return {
      ...f,
      patientName:    patient?.name,
      patientSpecies: patient?.species,
      patientBreed:   patient?.breed,
      ownerName:      owner?.name,
      ownerPhone:     owner?.phone,
    } as InvoiceWithDetails;
  }, [id]);

  return {
    factura: result ?? null,
    loading: result === undefined,
  };
}

export function usePatientInvoices(patientId: string) {
  const result = useLiveQuery(async () => {
    const invoices = await db.invoices
      .where('patientId')
      .equals(patientId)
      .filter((f) => !f.deletedAt)
      .toArray();
    return invoices.sort((a, b) => b.createdAt - a.createdAt);
  }, [patientId]);

  return {
    invoices: result ?? [],
    loading: result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  consultation: ConsultationLocal;
  paymentMethod: InvoicePaymentMethod;
  status: InvoiceStatus;
  /** Amount already collected — relevant for partially_paid */
  amountPaid?: number;
  /** Override the consultation discount */
  discount?: number;
  notes?: string;
}

/** Creates invoice, creates payment (if any), and links both to the consultation */
export async function createInvoice(input: CreateInvoiceInput): Promise<string> {
  const now       = Date.now();
  const id        = crypto.randomUUID();
  const clinicId  = await getClinicaId();
  const number    = await generateInvoiceNumber(clinicId);
  const discount  = input.discount ?? input.consultation.discount;
  const subtotal  = input.consultation.subtotal;
  const total     = Math.max(0, subtotal - discount);

  const amountPaid =
    input.status === 'paid'            ? total :
    input.status === 'partially_paid'  ? (input.amountPaid ?? 0) :
    0;

  const invoice: InvoiceLocal = {
    id,
    number,
    consultationId: input.consultation.id,
    patientId:      input.consultation.patientId,
    ownerId:        input.consultation.ownerId,
    clinicId:       clinicId,
    date:           new Date(now).toISOString().slice(0, 10),
    items:          input.consultation.items.map((item) => ({
      id:          item.id,
      description: item.description,
      quantity:    item.quantity,
      unitPrice:   item.unitPrice,
      subtotal:    item.subtotal,
      type:        item.isService ? 'service' : 'product',
      productId:   item.productId,
    })),
    subtotal,
    discount,
    total,
    paymentMethod:  input.paymentMethod,
    status:         input.status,
    amountPaid,
    notes:          input.notes,
    createdAt:      now,
    syncStatus:     'pending',
    updatedAt:      now,
  };

  await db.transaction('rw',
    [db.invoices, db.payments, db.consultations, db.syncQueue],
    async () => {
      await db.invoices.add(invoice);

      // Link invoice to consultation
      await db.consultations.update(input.consultation.id, {
        invoiceId:  id,
        updatedAt:  now,
        syncStatus: 'pending',
      });
      await encolarSync({ collection: 'consultations', documentId: input.consultation.id, operation: 'update', data: { id: input.consultation.id, invoiceId: id, updatedAt: now }, attempts: 0, createdAt: now });

      // Create payment if there is something to collect
      if (total > 0) {
        const paymentId    = crypto.randomUUID();
        const paymentType  = (PAYMENT_TYPE_BY_CONSULTATION[input.consultation.type] ?? 'consultation') as IncomeType;
        // 'mixed' is valid in PaymentMethod — pass through directly
        const paymentMethod = input.paymentMethod === 'mixed'
          ? ('other' as const)
          : input.paymentMethod;

        const paymentStatus = input.status === 'paid' ? 'paid' : 'pending';

        await db.payments.add({
          id:             paymentId,
          patientId:      input.consultation.patientId,
          clinicId:       clinicId,
          consultationId: input.consultation.id,
          date:           invoice.date,
          concept:        `${number} — ${input.consultation.reason?.slice(0, 120) ?? ''}`,
          type:           paymentType,
          amount:         input.status === 'paid' ? total : amountPaid || total,
          paymentMethod:  paymentMethod,
          status:         paymentStatus,
          notes:          input.notes,
          createdAt:      now,
          syncStatus:     'pending',
          updatedAt:      now,
        });

        await db.invoices.update(id, { paymentId });
        await encolarSync({ collection: 'payments', documentId: paymentId, operation: 'create', data: { id: paymentId, patientId: input.consultation.patientId, clinicId, consultationId: input.consultation.id, date: invoice.date, type: paymentType, amount: input.status === 'paid' ? total : amountPaid || total, paymentMethod, status: paymentStatus, notes: input.notes, createdAt: now, syncStatus: 'pending', updatedAt: now }, attempts: 0, createdAt: now });
      }

      const final = await db.invoices.get(id);
      if (final) {
        await encolarSync({ collection: 'invoices', documentId: id, operation: 'create', data: final, attempts: 0, createdAt: now });
      }
    }
  );

  return id;
}

/** Marks a pending invoice as paid */
export async function markInvoicePaid(
  id: string,
  paymentMethod: InvoicePaymentMethod,
  notes?: string
): Promise<void> {
  const now     = Date.now();
  const invoice = await db.invoices.get(id);
  if (!invoice) throw new Error('Invoice not found');

  await db.transaction('rw', [db.invoices, db.payments, db.syncQueue], async () => {
    await db.invoices.update(id, {
      status:      'paid',
      amountPaid:  invoice.total,
      paymentMethod,
      notes:       notes ?? invoice.notes,
      updatedAt:   now,
      syncStatus:  'pending',
    });

    if (invoice.paymentId) {
      const pmMethod = paymentMethod === 'mixed' ? ('other' as const) : paymentMethod;
      await db.payments.update(invoice.paymentId, {
        status:        'paid',
        paymentMethod: pmMethod,
        amount:        invoice.total,
        updatedAt:     now,
        syncStatus:    'pending',
      });
      await encolarSync({ collection: 'payments', documentId: invoice.paymentId, operation: 'update', data: { id: invoice.paymentId, status: 'paid', paymentMethod: pmMethod, amount: invoice.total, updatedAt: now }, attempts: 0, createdAt: now });
    }

    await encolarSync({ collection: 'invoices', documentId: id, operation: 'update', data: { id, status: 'paid', updatedAt: now }, attempts: 0, createdAt: now });
  });
}

/** Cancels an invoice */
export async function cancelInvoice(id: string): Promise<void> {
  const now = Date.now();
  await db.invoices.update(id, { status: 'cancelled', updatedAt: now, syncStatus: 'pending' });
  await encolarSync({ collection: 'invoices', documentId: id, operation: 'update', data: { id, status: 'cancelled', updatedAt: now }, attempts: 0, createdAt: now });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function generateInvoiceNumber(clinicId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await db.invoices.where('clinicId').equals(clinicId).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

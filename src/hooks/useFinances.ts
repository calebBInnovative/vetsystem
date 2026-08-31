'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { PaymentLocal, PaymentStatus, PaymentMethod } from '@/types/finances';
import type { InvoiceStatus } from '@/types/invoice';
import type { PagoFormData } from '@/lib/validations/finances.schema';
import { voidAndRectify } from '@/hooks/useInvoices';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payments filtered by date range. Defaults to the current month.
 * Also includes historical pending payments from before the range start.
 */
export function usePayments(dateFrom?: string, dateTo?: string) {
  const today = new Date();
  const from  = dateFrom ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const to    = dateTo   ?? new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    const monthPayments = await db.payments
      .where('date')
      .between(from, to, true, true)
      .filter((p) => !p.deletedAt && p.clinicId === clinicId)
      .toArray();

    // Historical pending payments (outstanding accounts receivable)
    const historicPending = await db.payments
      .where('clinicId')
      .equals(clinicId)
      .filter((p) => !p.deletedAt && p.status === 'pending' && p.date < from)
      .toArray();

    const inMonthIds = new Set(monthPayments.map((p) => p.id));
    const all = [...monthPayments, ...historicPending.filter((p) => !inMonthIds.has(p.id))];
    all.sort((a, b) => b.date.localeCompare(a.date));

    const patientIds = [...new Set(all.map((p) => p.patientId))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return all.map((p) => ({
      ...p,
      patientName:    patientMap.get(p.patientId)?.name ?? 'Patient',
      patientSpecies: patientMap.get(p.patientId)?.species,
    }));
  }, [from, to]);

  return {
    payments: result ?? [],
    loading:  result === undefined,
  };
}

/**
 * Full financial KPIs: income, expenses, net balance for the current month.
 * Expenses come from expensePayments and collaboratorPayments directly.
 */
export function useFinancialSummary() {
  const today = new Date();
  const todayStr   = today.toISOString().slice(0, 10);
  const monthStr   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEndStr = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const weekDay   = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - weekDay);
  const weekStr = weekStart.toISOString().slice(0, 10);

  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();

    // ── Income (paid payments) ────────────────────────────────────────────────
    const monthPayments = await db.payments
      .where('date')
      .between(monthStr, monthEndStr, true, true)
      .filter((p) => !p.deletedAt && p.clinicId === clinicId && p.status === 'paid')
      .toArray();

    const totalToday  = monthPayments.filter((p) => p.date === todayStr).reduce((s, p) => s + p.amount, 0);
    const totalWeek   = monthPayments.filter((p) => p.date >= weekStr).reduce((s, p) => s + p.amount, 0);
    const totalMonth  = monthPayments.reduce((s, p) => s + p.amount, 0);

    const pendingCount = await db.payments
      .where('clinicId').equals(clinicId)
      .filter((p) => !p.deletedAt && p.status === 'pending')
      .count();

    const byType = monthPayments.reduce<Record<string, number>>((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + p.amount;
      return acc;
    }, {});

    const byMethod = monthPayments.reduce<Record<string, number>>((acc, p) => {
      acc[p.paymentMethod] = (acc[p.paymentMethod] ?? 0) + p.amount;
      return acc;
    }, {});

    // ── Expenses: fixed expenses paid this month ───────────────────────────────
    const expensePaymentsMonth = await db.expensePayments
      .where('paymentDate')
      .between(monthStr, monthEndStr, true, true)
      .filter((g) => g.clinicId === clinicId && !g.deletedAt)
      .toArray();

    // Enrich with parent fixedExpense name + category
    const fixedExpenses = await db.fixedExpenses
      .where('clinicId').equals(clinicId)
      .filter((e) => !e.deletedAt)
      .toArray();
    const fixedExpenseMap = new Map(fixedExpenses.map((e) => [e.id, e]));

    const totalExpenses = expensePaymentsMonth.reduce((s, g) => s + g.amount, 0);

    const byExpenseCategory = expensePaymentsMonth.reduce<Record<string, number>>((acc, ep) => {
      const cat = fixedExpenseMap.get(ep.fixedExpenseId)?.category ?? 'other';
      acc[cat] = (acc[cat] ?? 0) + ep.amount;
      return acc;
    }, {});

    const expenseRows = expensePaymentsMonth
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((ep) => {
        const parent = fixedExpenseMap.get(ep.fixedExpenseId);
        return {
          id:       ep.id,
          date:     ep.paymentDate,
          name:     parent?.name ?? '—',
          category: parent?.category ?? 'other',
          amount:   ep.amount,
          notes:    ep.notes,
        };
      });

    // ── Expenses: collaborators paid this month ────────────────────────────────
    const collaboratorPaymentsMonth = await db.collaboratorPayments
      .where('paymentDate')
      .between(monthStr, monthEndStr, true, true)
      .filter((c) => c.clinicId === clinicId && !c.deletedAt)
      .toArray();

    const collaborators = await db.collaborators
      .where('clinicId').equals(clinicId)
      .filter((c) => !c.deletedAt)
      .toArray();
    const collaboratorMap = new Map(collaborators.map((c) => [c.id, c]));

    const totalCollaborators = collaboratorPaymentsMonth.reduce((s, c) => s + c.amount, 0);

    const collaboratorRows = collaboratorPaymentsMonth
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((cp) => {
        const collab = collaboratorMap.get(cp.collaboratorId);
        return {
          id:     cp.id,
          date:   cp.paymentDate,
          name:   collab?.name ?? '—',
          role:   collab?.role ?? '—',
          amount: cp.amount,
          notes:  cp.notes,
        };
      });

    const totalOutgoing = totalExpenses + totalCollaborators;
    const netBalance    = totalMonth - totalOutgoing;

    return {
      totalToday, totalWeek, totalMonth, pendingCount,
      byType, byMethod, countMonth: monthPayments.length,
      totalExpenses, totalCollaborators, totalOutgoing, netBalance,
      byExpenseCategory, expenseRows, collaboratorRows,
    };
  }, [todayStr, monthStr, weekStr]);

  return {
    summary: result,
    loading: result === undefined,
  };
}

/** Payments for a specific patient */
export function usePatientPayments(patientId: string) {
  const result = useLiveQuery(async () => {
    return db.payments
      .where('patientId').equals(patientId)
      .filter((p) => !p.deletedAt)
      .reverse()
      .sortBy('date');
  }, [patientId]);

  return {
    payments: result ?? [],
    loading:  result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPayment(data: PagoFormData): Promise<string> {
  const now      = Date.now();
  const paymentId = crypto.randomUUID();
  const clinicId = await getClinicaId();

  const newPayment: PaymentLocal = {
    id:            paymentId,
    patientId:     data.patientId,
    clinicId:      clinicId,
    date:          data.date,
    concept:       data.concept,
    type:          data.type,
    amount:        data.amount as number,
    paymentMethod: data.paymentMethod,
    status:        data.status ?? 'paid',
    notes:         data.notes || undefined,
    createdAt:     now,
    syncStatus:    'pending',
    updatedAt:     now,
  };

  await db.payments.add(newPayment);
  await encolarSync({ collection: 'payments', documentId: paymentId, operation: 'create', data: newPayment, attempts: 0, createdAt: now });
  return paymentId;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [db.payments, db.consultations, db.invoices, db.syncQueue], async () => {
    await db.payments.update(id, { status, updatedAt: now, syncStatus: 'pending' });

    // Sync the linked invoice: payment → consultation → invoice
    const payment = await db.payments.get(id);
    if (payment?.consultationId) {
      const consultation = await db.consultations.get(payment.consultationId);
      if (consultation?.invoiceId) {
        const invoiceStatus: InvoiceStatus =
          status === 'paid'      ? 'paid'      :
          status === 'cancelled' ? 'cancelled' : 'pending';

        const invoice   = await db.invoices.get(consultation.invoiceId);
        const finalAmt  = invoiceStatus === 'paid' ? (invoice?.total ?? 0) : (invoice?.amountPaid ?? 0);
        await db.invoices.update(consultation.invoiceId, {
          status:     invoiceStatus,
          amountPaid: finalAmt,
          updatedAt:  now,
          syncStatus: 'pending',
        });
        await encolarSync({ collection: 'invoices', documentId: consultation.invoiceId, operation: 'update', data: { id: consultation.invoiceId, status: invoiceStatus, amountPaid: finalAmt, updatedAt: now }, attempts: 0, createdAt: now });
      }
    }

    await encolarSync({ collection: 'payments', documentId: id, operation: 'update', data: { id, status, updatedAt: now }, attempts: 0, createdAt: now });
  });
}

export async function deletePayment(id: string): Promise<void> {
  const now = Date.now();
  await db.payments.update(id, { deletedAt: now, syncStatus: 'pending', updatedAt: now });
  await encolarSync({ collection: 'payments', documentId: id, operation: 'delete', data: { id, deletedAt: now }, attempts: 0, createdAt: now });
}

export interface CorrectPaymentInput {
  amount: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

/**
 * Corrects a payment and cascades to its linked invoice.
 * - If invoice is pending/partially_paid → updates amounts directly.
 * - If invoice is paid → voids it and creates a pending rectification.
 * Returns the new invoice ID when void+rectify happened.
 */
export async function correctPayment(
  paymentId: string,
  input: CorrectPaymentInput,
): Promise<{ rectificationId?: string }> {
  const now      = Date.now();
  const clinicId = await getClinicaId();
  const session  = await db.session.get('singleton');
  const payment  = await db.payments.get(paymentId);
  if (!payment) throw new Error('Payment not found');

  // Resolve linked invoice: via consultationId → consultation.invoiceId
  let invoiceId: string | undefined;
  if (payment.consultationId) {
    const consult = await db.consultations.get(payment.consultationId);
    invoiceId = consult?.invoiceId;
  }
  // Fallback: find invoice that points back to this payment
  if (!invoiceId) {
    const inv = await db.invoices
      .where('clinicId').equals(clinicId)
      .filter((i) => !i.deletedAt && i.paymentId === paymentId)
      .first();
    invoiceId = inv?.id;
  }

  const invoice = invoiceId ? await db.invoices.get(invoiceId) : undefined;

  const paymentUpdates: Partial<PaymentLocal> = {
    amount:     input.amount,
    updatedAt:  now,
    syncStatus: 'pending',
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  // No linked invoice, or invoice is still open → direct update
  if (!invoice || invoice.status === 'pending' || invoice.status === 'partially_paid') {
    await db.transaction('rw', [db.payments, db.invoices, db.syncQueue], async () => {
      await db.payments.update(paymentId, paymentUpdates);
      await encolarSync({ collection: 'payments', documentId: paymentId, operation: 'update', data: { id: paymentId, ...paymentUpdates }, attempts: 0, createdAt: now });

      if (invoice && invoiceId) {
        const newDiscount = Math.max(0, invoice.subtotal - input.amount);
        const newTotal    = Math.max(0, invoice.subtotal - newDiscount);
        await db.invoices.update(invoiceId, {
          discount:   newDiscount,
          total:      newTotal,
          updatedAt:  now,
          syncStatus: 'pending',
        });
        await encolarSync({ collection: 'invoices', documentId: invoiceId, operation: 'update', data: { id: invoiceId, discount: newDiscount, total: newTotal, updatedAt: now }, attempts: 0, createdAt: now });
      }
    });
    return {};
  }

  // Invoice is paid → void + rectify automatically
  const cancelledBy = session?.userName ?? session?.email ?? 'Sistema';
  const reason      = `Corrección de monto: C$${invoice.total.toFixed(0)} → C$${input.amount.toFixed(0)}`;
  const rectId      = await voidAndRectify(invoiceId!, reason, cancelledBy);

  // Adjust new invoice to match the corrected amount via discount
  const rectInvoice = await db.invoices.get(rectId);
  if (rectInvoice) {
    const newDiscount = Math.max(0, rectInvoice.subtotal - input.amount);
    const newTotal    = Math.max(0, rectInvoice.subtotal - newDiscount);
    await db.invoices.update(rectId, { discount: newDiscount, total: newTotal, updatedAt: now, syncStatus: 'pending' });
  }

  // Mark original payment as cancelled
  await db.payments.update(paymentId, { ...paymentUpdates, status: 'cancelled', updatedAt: now, syncStatus: 'pending' });
  await encolarSync({ collection: 'payments', documentId: paymentId, operation: 'update', data: { id: paymentId, status: 'cancelled', updatedAt: now }, attempts: 0, createdAt: now });

  return { rectificationId: rectId };
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

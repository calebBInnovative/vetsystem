'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { SaleLocal, SaleItem, SalePaymentMethod } from '@/types/sale';
import type { InvoiceLocal, InvoiceItem } from '@/types/invoice';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useSales(filters?: {
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
}) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let rows = await db.sales
      .where('clinicId')
      .equals(clinicId)
      .filter((v) => !v.deletedAt && v.status !== 'cancelled')
      .toArray();

    if (filters?.dateFrom)  rows = rows.filter((v) => v.date      >= filters.dateFrom!);
    if (filters?.dateTo)    rows = rows.filter((v) => v.date      <= filters.dateTo!);
    if (filters?.patientId) rows = rows.filter((v) => v.patientId === filters.patientId);

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [filters?.dateFrom, filters?.dateTo, filters?.patientId]);

  return { ventas: result ?? [], loading: result === undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSaleInput {
  items:         SaleItem[];
  subtotal:      number;
  discount:      number;
  total:         number;
  paymentMethod: SalePaymentMethod;
  patientId?:    string;
  notes?:        string;
}

export async function createSale(input: CreateSaleInput): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const date     = new Date(now).toISOString().slice(0, 10);
  const clinicId = await getClinicaId();

  const sale: SaleLocal = {
    id,
    clinicId,
    date,
    items:         input.items,
    subtotal:      input.subtotal,
    discount:      input.discount,
    total:         input.total,
    paymentMethod: input.paymentMethod,
    status:        'completed',
    patientId:     input.patientId || undefined,
    notes:         input.notes     || undefined,
    createdAt:     now,
    syncStatus:    'pending',
    updatedAt:     now,
  };

  await db.transaction('rw',
    [db.sales, db.products, db.movements, db.payments, db.invoices, db.syncQueue],
    async () => {
      await db.sales.add(sale);

      // 1 — Deduct inventory for each product (skip service-only items)
      for (const item of input.items) {
        if (!item.productId || item.itemType === 'service') continue;
        const product = await db.products.get(item.productId);
        if (!product) continue;
        const newStock = Math.max(0, product.currentStock - item.quantity);

        await db.products.update(item.productId, { currentStock: newStock, updatedAt: now, syncStatus: 'pending' });
        await enqueueSync({ collection: 'products', documentId: item.productId, operation: 'update', data: { id: item.productId, currentStock: newStock, updatedAt: now }, attempts: 0, createdAt: now });

        const movementId = crypto.randomUUID();
        const movement = {
          id:          movementId,
          productId:   item.productId,
          clinicId,
          type:        'exit' as const,
          quantity:    item.quantity,
          stockBefore: product.currentStock,
          stockAfter:  newStock,
          reason:      `Sale #${id.slice(0, 8)}`,
          referenceId: id,
          createdAt:   now,
          syncStatus:  'pending' as const,
          updatedAt:   now,
        };
        await db.movements.add(movement);
        await enqueueSync({ collection: 'movements', documentId: movementId, operation: 'create', data: movement, attempts: 0, createdAt: now });
      }

      // 2 — Generate invoice
      const invoiceId     = crypto.randomUUID();
      const invoiceNumber = await generateInvoiceNumber();
      const invoiceItems: InvoiceItem[] = input.items.map((i) => ({
        id:          i.id,
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        subtotal:    i.subtotal,
        type:        'product' as const,
        productId:   i.productId,
      }));

      const invoice: InvoiceLocal = {
        id:            invoiceId,
        number:        invoiceNumber,
        saleId:        id,
        patientId:     input.patientId || undefined,
        ownerId:       undefined,
        clinicId,
        date,
        items:         invoiceItems,
        subtotal:      input.subtotal,
        discount:      input.discount,
        total:         input.total,
        paymentMethod: input.paymentMethod,
        status:        'paid',
        amountPaid:    input.total,
        notes:         input.notes,
        createdAt:     now,
        syncStatus:    'pending',
        updatedAt:     now,
      };
      await db.invoices.add(invoice);

      // 3 — Create payment linked to the invoice
      if (input.total > 0) {
        const paymentId     = crypto.randomUUID();
        // 'mixed' is a valid PaymentMethod too; keep it unless there's a reason to map
        const paymentMethod = input.paymentMethod === 'mixed'
          ? ('other' as const)
          : input.paymentMethod;

        await db.payments.add({
          id:            paymentId,
          patientId:     input.patientId ?? 'anonymous',
          clinicId,
          date,
          concept:       buildSummary(invoiceNumber, input.items),
          type:          'product',
          amount:        input.total,
          paymentMethod: paymentMethod,
          status:        'paid',
          notes:         input.notes,
          createdAt:     now,
          syncStatus:    'pending',
          updatedAt:     now,
        });
        await enqueueSync({ collection: 'payments', documentId: paymentId, operation: 'create', data: { id: paymentId, paymentMethod, amount: input.total, status: 'paid', date, updatedAt: now }, attempts: 0, createdAt: now });

        await db.sales.update(id, { paymentId, invoiceId });
        await db.invoices.update(invoiceId, { paymentId });

        await enqueueSync({ collection: 'sales',    documentId: id,        operation: 'create', data: { ...sale, paymentId, invoiceId }, attempts: 0, createdAt: now });
        await enqueueSync({ collection: 'invoices', documentId: invoiceId, operation: 'create', data: { ...invoice, paymentId },         attempts: 0, createdAt: now });
      } else {
        await db.sales.update(id, { invoiceId });
        await enqueueSync({ collection: 'sales',    documentId: id,        operation: 'create', data: { ...sale, invoiceId }, attempts: 0, createdAt: now });
        await enqueueSync({ collection: 'invoices', documentId: invoiceId, operation: 'create', data: invoice,                attempts: 0, createdAt: now });
      }
    }
  );

  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(invoiceNumber: string, items: SaleItem[]): string {
  const summary  = items.slice(0, 3).map((i) => `${i.description} ×${i.quantity}`).join(', ');
  const overflow = items.length > 3 ? ` +${items.length - 3} more` : '';
  return `${invoiceNumber} — ${summary}${overflow}`.slice(0, 200);
}

async function generateInvoiceNumber(): Promise<string> {
  const year     = new Date().getFullYear();
  const clinicId = await getClinicaId();
  const count    = await db.invoices.where('clinicId').equals(clinicId).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function enqueueSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

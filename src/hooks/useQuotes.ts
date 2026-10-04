'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import { createSale } from '@/hooks/useSales';
import type { QuoteLocal, QuoteStatus, QuoteWithDetails } from '@/types/quote';
import type { SaleItem, SalePaymentMethod } from '@/types/sale';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useQuotes(filters?: {
  status?:    QuoteStatus | 'all';
  dateFrom?:  string;
  dateTo?:    string;
  patientId?: string;
}) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let rows = await db.quotes
      .where('clinicId')
      .equals(clinicId)
      .filter((q) => !q.deletedAt)
      .toArray();

    if (filters?.status && filters.status !== 'all') rows = rows.filter((q) => q.status === filters.status);
    if (filters?.dateFrom)  rows = rows.filter((q) => q.date      >= filters.dateFrom!);
    if (filters?.dateTo)    rows = rows.filter((q) => q.date      <= filters.dateTo!);
    if (filters?.patientId) rows = rows.filter((q) => q.patientId === filters.patientId);

    rows.sort((a, b) => b.createdAt - a.createdAt);

    // Join patient + owner so the list and the printout can show who it is for
    const patientIds = [...new Set(rows.filter((q) => q.patientId).map((q) => q.patientId!))];
    const patients   = await db.patients.bulkGet(patientIds);
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    const ownerIds = [...new Set(
      patients.filter(Boolean).map((p) => p!.ownerId).filter(Boolean) as string[],
    )];
    const owners   = await db.owners.bulkGet(ownerIds);
    const ownerMap = new Map(owners.filter(Boolean).map((o) => [o!.id, o!]));

    const detailed: QuoteWithDetails[] = rows.map((q) => {
      const patient = q.patientId ? patientMap.get(q.patientId) : undefined;
      const owner   = patient?.ownerId ? ownerMap.get(patient.ownerId) : undefined;
      return {
        ...q,
        patientName: patient?.name,
        ownerName:   owner?.name,
        ownerPhone:  owner?.phone,
      };
    });

    return detailed;
  }, [filters?.status, filters?.dateFrom, filters?.dateTo, filters?.patientId]);

  return { quotes: result ?? [], loading: result === undefined };
}

/** Totals for the quotes list header. Open quotes are potential, not revenue. */
export function useQuoteStats() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const rows = await db.quotes
      .where('clinicId')
      .equals(clinicId)
      .filter((q) => !q.deletedAt)
      .toArray();

    const open = rows.filter((q) => q.status === 'open');
    return {
      openCount:      open.length,
      openAmount:     open.reduce((s, q) => s + q.total, 0),
      convertedCount: rows.filter((q) => q.status === 'converted').length,
      total:          rows.length,
    };
  }, []);

  return { stats: result, loading: result === undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateQuoteInput {
  items:       SaleItem[];
  subtotal:    number;
  discount:    number;
  total:       number;
  patientId?:  string;
  notes?:      string;
  /** Defaults to 15 days from today */
  validUntil?: string;
}

/**
 * Creates a quote. Deliberately writes nothing but the quote itself:
 * no stock movement, no invoice, no payment — so it never shows up as revenue.
 */
export async function createQuote(input: CreateQuoteInput): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const clinicId = await getClinicaId();
  const date     = localDateString();

  const quote: QuoteLocal = {
    id,
    number:     await generateQuoteNumber(clinicId),
    clinicId,
    date,
    validUntil: input.validUntil || addDays(date, 15),
    items:      input.items,
    subtotal:   input.subtotal,
    discount:   input.discount,
    total:      input.total,
    status:     'open',
    patientId:  input.patientId || undefined,
    notes:      input.notes     || undefined,
    createdAt:  now,
    syncStatus: 'pending',
    updatedAt:  now,
  };

  await db.transaction('rw', [db.quotes, db.syncQueue], async () => {
    await db.quotes.add(quote);
    await enqueueSync({
      collection: 'quotes', documentId: id, operation: 'create',
      data: quote, attempts: 0, createdAt: now,
    });
  });

  return id;
}

export async function updateQuoteNotes(id: string, notes: string): Promise<void> {
  const now = Date.now();
  await db.quotes.update(id, { notes: notes || undefined, updatedAt: now, syncStatus: 'pending' });
  await enqueueSync({
    collection: 'quotes', documentId: id, operation: 'update',
    data: { id, notes: notes || null, updatedAt: now }, attempts: 0, createdAt: now,
  });
}

export async function cancelQuote(id: string): Promise<void> {
  const now = Date.now();
  await db.quotes.update(id, { status: 'cancelled', updatedAt: now, syncStatus: 'pending' });
  await enqueueSync({
    collection: 'quotes', documentId: id, operation: 'update',
    data: { id, status: 'cancelled', updatedAt: now }, attempts: 0, createdAt: now,
  });
}

export async function deleteQuote(id: string): Promise<void> {
  const now = Date.now();
  await db.quotes.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
  await enqueueSync({
    collection: 'quotes', documentId: id, operation: 'delete',
    data: { id, deletedAt: now }, attempts: 0, createdAt: now,
  });
}

export class QuoteConversionError extends Error {}

/**
 * Turns an accepted quote into a real sale: this is the single moment where
 * stock is deducted and an invoice + payment are generated, all of it handled
 * by createSale(). The quote keeps its number and points at the resulting sale.
 *
 * Prices are taken from the quote as agreed with the client, even if the
 * catalog changed since — that is the point of having quoted them.
 */
export async function convertQuoteToSale(
  id: string,
  paymentMethod: SalePaymentMethod,
): Promise<string> {
  const quote = await db.quotes.get(id);
  if (!quote)                      throw new QuoteConversionError('La cotización ya no existe.');
  if (quote.deletedAt)             throw new QuoteConversionError('La cotización fue eliminada.');
  if (quote.status === 'converted') throw new QuoteConversionError('Esta cotización ya se convirtió en venta.');
  if (quote.status === 'cancelled') throw new QuoteConversionError('No se puede convertir una cotización anulada.');

  // createSale runs its own transaction (stock, invoice, payment), so it has to
  // finish before the quote is marked — otherwise a failure there would leave a
  // quote pointing at a sale that does not exist.
  const saleId = await createSale({
    items:         quote.items,
    subtotal:      quote.subtotal,
    discount:      quote.discount,
    total:         quote.total,
    paymentMethod,
    patientId:     quote.patientId,
    notes:         [quote.notes, `Desde cotización ${quote.number}`].filter(Boolean).join(' · '),
  });

  const now = Date.now();
  await db.quotes.update(id, {
    status: 'converted', saleId, convertedAt: now, updatedAt: now, syncStatus: 'pending',
  });
  await enqueueSync({
    collection: 'quotes', documentId: id, operation: 'update',
    data: { id, status: 'converted', saleId, convertedAt: now, updatedAt: now },
    attempts: 0, createdAt: now,
  });

  return saleId;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Today in the clinic's own timezone — toISOString() would roll over at 18:00 in Nicaragua. */
function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return localDateString(date);
}

async function generateQuoteNumber(clinicId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await db.quotes.where('clinicId').equals(clinicId).count();
  return `COT-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function enqueueSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

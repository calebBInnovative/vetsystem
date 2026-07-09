'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { SaleLocal, SaleItem, SalePaymentMethod } from '@/types/sale';
import type { InvoiceLocal, InvoiceItem } from '@/types/invoice';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useSales(filters?: {
  fechaDesde?: string;
  fechaHasta?: string;
  pacienteId?: string;
}) {
  const result = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    let rows = await db.sales
      .where('clinicaId')
      .equals(clinicaId)
      .filter((v) => !v.deletedAt && v.estado !== 'cancelada')
      .toArray();

    if (filters?.fechaDesde) rows = rows.filter((v) => v.fecha >= filters.fechaDesde!);
    if (filters?.fechaHasta) rows = rows.filter((v) => v.fecha <= filters.fechaHasta!);
    if (filters?.pacienteId) rows = rows.filter((v) => v.pacienteId === filters.pacienteId);

    return rows.sort((a, b) => b.creadoEn - a.creadoEn);
  }, [filters?.fechaDesde, filters?.fechaHasta, filters?.pacienteId]);

  return { ventas: result ?? [], loading: result === undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSaleInput {
  items:      SaleItem[];
  subtotal:   number;
  descuento:  number;
  total:      number;
  metodoPago: SalePaymentMethod;
  pacienteId?: string;
  notas?:     string;
}

export async function createSale(input: CreateSaleInput): Promise<string> {
  const now       = Date.now();
  const id        = crypto.randomUUID();
  const date      = new Date(now).toISOString().slice(0, 10);
  const clinicaId = await getClinicaId();

  const sale: SaleLocal = {
    id,
    clinicaId,
    fecha:      date,
    items:      input.items,
    subtotal:   input.subtotal,
    descuento:  input.descuento,
    total:      input.total,
    metodoPago: input.metodoPago,
    estado:     'completada',
    pacienteId: input.pacienteId || undefined,
    notas:      input.notas || undefined,
    creadoEn:   now,
    syncStatus: 'pending',
    updatedAt:  now,
  };

  await db.transaction('rw',
    [db.sales, db.products, db.movements, db.payments, db.invoices, db.syncQueue],
    async () => {
      await db.sales.add(sale);

      // 1 — Deduct inventory for each product
      for (const item of input.items) {
        const product = await db.products.get(item.productoId);
        if (!product) continue;
        const newStock = Math.max(0, product.stockActual - item.cantidad);

        await db.products.update(item.productoId, { stockActual: newStock, updatedAt: now, syncStatus: 'pending' });
        await enqueueSync({ coleccion: 'products', documentoId: item.productoId, operacion: 'update', datos: { id: item.productoId, stockActual: newStock, updatedAt: now }, intentos: 0, creadoEn: now });

        const movementId = crypto.randomUUID();
        const movement = {
          id:           movementId,
          productoId:   item.productoId,
          clinicaId,
          tipo:         'salida' as const,
          cantidad:     item.cantidad,
          stockAntes:   product.stockActual,
          stockDespues: newStock,
          motivo:       `Sale #${id.slice(0, 8)}`,
          referenciaId: id,
          creadoEn:     now,
          syncStatus:   'pending' as const,
          updatedAt:    now,
        };
        await db.movements.add(movement);
        await enqueueSync({ coleccion: 'movements', documentoId: movementId, operacion: 'create', datos: movement, intentos: 0, creadoEn: now });
      }

      // 2 — Generate invoice
      const invoiceId    = crypto.randomUUID();
      const invoiceNumber = await generateInvoiceNumber();
      const invoiceItems: InvoiceItem[] = input.items.map((i) => ({
        id:             i.id,
        descripcion:    i.descripcion,
        cantidad:       i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal:       i.subtotal,
        tipo:           'producto' as const,
        productoId:     i.productoId,
      }));

      const invoice: InvoiceLocal = {
        id:          invoiceId,
        numero:      invoiceNumber,
        ventaId:     id,
        pacienteId:  input.pacienteId || undefined,
        duenoId:     undefined,
        clinicaId,
        fecha:       date,
        items:       invoiceItems,
        subtotal:    input.subtotal,
        descuento:   input.descuento,
        total:       input.total,
        metodoPago:  input.metodoPago,
        estado:      'pagada',
        montoPagado: input.total,
        notas:       input.notas,
        creadoEn:    now,
        syncStatus:  'pending',
        updatedAt:   now,
      };
      await db.invoices.add(invoice);

      // 3 — Create payment linked to the invoice
      if (input.total > 0) {
        const paymentId     = crypto.randomUUID();
        const paymentMethod = input.metodoPago === 'mixto' ? 'otro' : input.metodoPago;

        await db.payments.add({
          id:         paymentId,
          pacienteId: input.pacienteId ?? 'anonimo',
          clinicaId,
          fecha:      date,
          concepto:   buildSummary(invoiceNumber, input.items),
          tipo:       'producto',
          monto:      input.total,
          metodoPago: paymentMethod,
          estado:     'pagado',
          notas:      input.notas,
          creadoEn:   now,
          syncStatus: 'pending',
          updatedAt:  now,
        });
        await enqueueSync({ coleccion: 'payments', documentoId: paymentId, operacion: 'create', datos: { id: paymentId, metodoPago: paymentMethod, monto: input.total, estado: 'pagado', fecha: date, updatedAt: now }, intentos: 0, creadoEn: now });

        await db.sales.update(id, { pagoId: paymentId, facturaId: invoiceId });
        await db.invoices.update(invoiceId, { pagoId: paymentId });

        await enqueueSync({ coleccion: 'sales',    documentoId: id,        operacion: 'create', datos: { ...sale, pagoId: paymentId, facturaId: invoiceId }, intentos: 0, creadoEn: now });
        await enqueueSync({ coleccion: 'invoices', documentoId: invoiceId, operacion: 'create', datos: { ...invoice, pagoId: paymentId },                    intentos: 0, creadoEn: now });
      } else {
        await db.sales.update(id, { facturaId: invoiceId });
        await enqueueSync({ coleccion: 'sales',    documentoId: id,        operacion: 'create', datos: { ...sale, facturaId: invoiceId }, intentos: 0, creadoEn: now });
        await enqueueSync({ coleccion: 'invoices', documentoId: invoiceId, operacion: 'create', datos: invoice,                           intentos: 0, creadoEn: now });
      }
    }
  );

  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(invoiceNumber: string, items: SaleItem[]): string {
  const summary = items
    .slice(0, 3)
    .map((i) => `${i.descripcion} ×${i.cantidad}`)
    .join(', ');
  const overflow = items.length > 3 ? ` +${items.length - 3} more` : '';
  return `${invoiceNumber} — ${summary}${overflow}`.slice(0, 200);
}

async function generateInvoiceNumber(): Promise<string> {
  const year      = new Date().getFullYear();
  const clinicaId = await getClinicaId();
  const count     = await db.invoices.where('clinicaId').equals(clinicaId).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function enqueueSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { VentaLocal, VentaItem, MetodoPagoVenta } from '@/types/venta';
import type { FacturaLocal, FacturaItem } from '@/types/factura';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useVentas(filtros?: {
  fechaDesde?: string;
  fechaHasta?: string;
  pacienteId?: string;
}) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    let ventas = await db.sales
      .where('clinicaId')
      .equals(clinicaId)
      .filter((v) => !v.deletedAt && v.estado !== 'cancelada')
      .toArray();

    if (filtros?.fechaDesde) ventas = ventas.filter((v) => v.fecha >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) ventas = ventas.filter((v) => v.fecha <= filtros.fechaHasta!);
    if (filtros?.pacienteId) ventas = ventas.filter((v) => v.pacienteId === filtros.pacienteId);

    return ventas.sort((a, b) => b.creadoEn - a.creadoEn);
  }, [filtros?.fechaDesde, filtros?.fechaHasta, filtros?.pacienteId]);

  return { ventas: resultado ?? [], cargando: resultado === undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearVentaInput {
  items:      VentaItem[];
  subtotal:   number;
  descuento:  number;
  total:      number;
  metodoPago: MetodoPagoVenta;
  pacienteId?: string;
  notas?:     string;
}

export async function crearVenta(input: CrearVentaInput): Promise<string> {
  const ahora   = Date.now();
  const id      = crypto.randomUUID();
  const fecha   = new Date(ahora).toISOString().slice(0, 10);
  const clinicaId = await getClinicaId();

  const venta: VentaLocal = {
    id,
    clinicaId:  clinicaId,
    fecha,
    items:      input.items,
    subtotal:   input.subtotal,
    descuento:  input.descuento,
    total:      input.total,
    metodoPago: input.metodoPago,
    estado:     'completada',
    pacienteId: input.pacienteId || undefined,
    notas:      input.notas || undefined,
    creadoEn:   ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  };

  await db.transaction('rw',
    [db.sales, db.products, db.movements, db.payments, db.invoices, db.syncQueue],
    async () => {
      await db.sales.add(venta);

      // 1 — Descontar inventario
      for (const item of input.items) {
        const prod = await db.products.get(item.productoId);
        if (!prod) continue;
        const stockNuevo = Math.max(0, prod.stockActual - item.cantidad);
        await db.products.update(item.productoId, { stockActual: stockNuevo, updatedAt: ahora, syncStatus: 'pending' });
        await db.movements.add({
          id:           crypto.randomUUID(),
          productoId:   item.productoId,
          clinicaId:    clinicaId,
          tipo:         'salida',
          cantidad:     item.cantidad,
          stockAntes:   prod.stockActual,
          stockDespues: stockNuevo,
          motivo:       `Venta #${id.slice(0, 8)}`,
          referenciaId: id,
          creadoEn:     ahora,
          syncStatus:   'pending',
          updatedAt:    ahora,
        });
      }

      // 2 — Generar factura
      const facturaId    = crypto.randomUUID();
      const numero       = await generarNumeroFactura();
      const facturaItems: FacturaItem[] = input.items.map((i) => ({
        id:             i.id,
        descripcion:    i.descripcion,
        cantidad:       i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal:       i.subtotal,
        tipo:           'producto' as const,
        productoId:     i.productoId,
      }));

      const factura: FacturaLocal = {
        id:          facturaId,
        numero,
        ventaId:     id,
        pacienteId:  input.pacienteId || undefined,
        duenoId:     undefined,
        clinicaId:   clinicaId,
        fecha,
        items:       facturaItems,
        subtotal:    input.subtotal,
        descuento:   input.descuento,
        total:       input.total,
        metodoPago:  input.metodoPago,
        estado:      'pagada',
        montoPagado: input.total,
        notas:       input.notas,
        creadoEn:    ahora,
        syncStatus:  'pending',
        updatedAt:   ahora,
      };
      await db.invoices.add(factura);

      // 3 — Crear pago vinculado a la factura
      if (input.total > 0) {
        const pagoId         = crypto.randomUUID();
        const metodoPagoPago = input.metodoPago === 'mixto' ? 'otro' : input.metodoPago;
        await db.payments.add({
          id:         pagoId,
          pacienteId: input.pacienteId ?? 'anonimo',
          clinicaId:  clinicaId,
          fecha,
          concepto:   construirConcepto(numero, input.items),
          tipo:       'producto',
          monto:      input.total,
          metodoPago: metodoPagoPago,
          estado:     'pagado',
          notas:      input.notas,
          creadoEn:   ahora,
          syncStatus: 'pending',
          updatedAt:  ahora,
        });
        await db.sales.update(id,   { pagoId, facturaId });
        await db.invoices.update(facturaId, { pagoId });
      } else {
        await db.sales.update(id, { facturaId });
      }

      await encolarSync({ coleccion: 'ventas',   documentoId: id,        operacion: 'create', datos: venta,   intentos: 0, creadoEn: ahora });
      await encolarSync({ coleccion: 'facturas', documentoId: facturaId, operacion: 'create', datos: factura, intentos: 0, creadoEn: ahora });
    }
  );

  return id;
}

function construirConcepto(numero: string, items: VentaItem[]): string {
  const resumen = items
    .slice(0, 3)
    .map((i) => `${i.descripcion} ×${i.cantidad}`)
    .join(', ');
  const extra = items.length > 3 ? ` +${items.length - 3} más` : '';
  return `${numero} — ${resumen}${extra}`.slice(0, 200);
}

async function generarNumeroFactura(): Promise<string> {
  const year      = new Date().getFullYear();
  const clinicaId = await getClinicaId();
  const count     = await db.invoices.where('clinicaId').equals(clinicaId).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

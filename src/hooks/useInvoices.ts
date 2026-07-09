'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { InvoiceLocal, InvoiceWithDetails, InvoiceStatus, InvoicePaymentMethod } from '@/types/invoice';
import type { ConsultationLocal } from '@/types/consultation';
import type { IncomeType } from '@/types/finances';
import { PAYMENT_TYPE_BY_CONSULTATION } from '@/types/consultation';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useInvoices(filtros?: {
  estado?: InvoiceStatus;
  pacienteId?: string;
  duenoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    let invoices = await db.invoices
      .where('clinicaId')
      .equals(clinicaId)
      .filter((f) => !f.deletedAt)
      .toArray();

    if (filtros?.estado)     invoices = invoices.filter((f) => f.estado     === filtros.estado);
    if (filtros?.pacienteId) invoices = invoices.filter((f) => f.pacienteId === filtros.pacienteId);
    if (filtros?.duenoId)    invoices = invoices.filter((f) => f.duenoId    === filtros.duenoId);
    if (filtros?.fechaDesde) invoices = invoices.filter((f) => f.fecha      >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) invoices = invoices.filter((f) => f.fecha      <= filtros.fechaHasta!);

    invoices.sort((a, b) => b.creadoEn - a.creadoEn);

    const pacienteIds  = [...new Set(invoices.map((f) => f.pacienteId).filter((id): id is string => !!id))];
    const duenoIds     = [...new Set(invoices.map((f) => f.duenoId).filter((id): id is string => !!id))];
    const patients    = await db.patients.bulkGet(pacienteIds);
    const duenos       = await db.owners.bulkGet(duenoIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));
    const duenosMap    = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return invoices.map<InvoiceWithDetails>((f) => ({
      ...f,
      nombrePaciente:  f.pacienteId ? pacientesMap.get(f.pacienteId)?.nombre    : undefined,
      especiePaciente: f.pacienteId ? pacientesMap.get(f.pacienteId)?.especie   : undefined,
      razaPaciente:    f.pacienteId ? pacientesMap.get(f.pacienteId)?.raza      : undefined,
      nombreDueno:     f.duenoId    ? duenosMap.get(f.duenoId)?.nombre          : undefined,
      telefonoDueno:   f.duenoId    ? duenosMap.get(f.duenoId)?.telefono        : undefined,
    }));
  }, [filtros?.estado, filtros?.pacienteId, filtros?.duenoId, filtros?.fechaDesde, filtros?.fechaHasta]);

  return {
    invoices: resultado ?? [],
    loading: resultado === undefined,
  };
}

export function useInvoice(id: string) {
  const resultado = useLiveQuery(async () => {
    const f = await db.invoices.get(id);
    if (!f || f.deletedAt) return null;

    const paciente = f.pacienteId ? await db.patients.get(f.pacienteId) : undefined;
    const dueno    = f.duenoId ? await db.owners.get(f.duenoId) : undefined;

    return {
      ...f,
      nombrePaciente:  paciente?.nombre,
      especiePaciente: paciente?.especie,
      razaPaciente:    paciente?.raza,
      nombreDueno:     dueno?.nombre,
      telefonoDueno:   dueno?.telefono,
    } as InvoiceWithDetails;
  }, [id]);

  return {
    factura:  resultado ?? null,
    loading: resultado === undefined,
  };
}

export function usePatientInvoices(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    const invoices = await db.invoices
      .where('pacienteId')
      .equals(pacienteId)
      .filter((f) => !f.deletedAt)
      .toArray();
    return invoices.sort((a, b) => b.creadoEn - a.creadoEn);
  }, [pacienteId]);

  return {
    invoices: resultado ?? [],
    loading: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  consulta: ConsultationLocal;
  metodoPago: InvoicePaymentMethod;
  estado: InvoiceStatus;
  /** Monto efectivamente cobrado — solo para parcialmente_pagada */
  montoPagado?: number;
  /** Override del descuento de la consulta */
  descuento?: number;
  notas?: string;
}

/** Crea la factura, crea el pago (si aplica) y enlaza ambos a la consulta */
export async function createInvoice(input: CreateInvoiceInput): Promise<string> {
  const ahora     = Date.now();
  const id        = crypto.randomUUID();
  const clinicaId = await getClinicaId();
  const numero    = await generarNumeroFactura(clinicaId);
  const descuento = input.descuento ?? input.consulta.descuento;
  const subtotal  = input.consulta.subtotal;
  const total     = Math.max(0, subtotal - descuento);

  const montoPagado =
    input.estado === 'pagada'              ? total :
    input.estado === 'parcialmente_pagada' ? (input.montoPagado ?? 0) :
    0;

  const factura: InvoiceLocal = {
    id,
    numero,
    consultaId:  input.consulta.id,
    pacienteId:  input.consulta.pacienteId,
    duenoId:     input.consulta.duenoId,
    clinicaId:   clinicaId,
    fecha:       new Date(ahora).toISOString().slice(0, 10),
    items:       input.consulta.items.map((item) => ({
      id:              item.id,
      descripcion:     item.descripcion,
      cantidad:        item.cantidad,
      precioUnitario:  item.precioUnitario,
      subtotal:        item.subtotal,
      tipo:            item.esServicio ? 'servicio' : 'producto',
      productoId:      item.productoId,
    })),
    subtotal,
    descuento,
    total,
    metodoPago:  input.metodoPago,
    estado:      input.estado,
    montoPagado,
    notas:       input.notas,
    creadoEn:    ahora,
    syncStatus:  'pending',
    updatedAt:   ahora,
  };

  await db.transaction('rw',
    [db.invoices, db.payments, db.consultations, db.syncQueue],
    async () => {
      await db.invoices.add(factura);

      // Enlazar factura a la consulta
      await db.consultations.update(input.consulta.id, {
        facturaId:  id,
        updatedAt:  ahora,
        syncStatus: 'pending',
      });
      await encolarSync({ coleccion: 'consultations', documentoId: input.consulta.id, operacion: 'update', datos: { id: input.consulta.id, facturaId: id, updatedAt: ahora }, intentos: 0, creadoEn: ahora });

      // Crear pago si hay algo cobrado o la factura está pendiente (cuenta por cobrar)
      if (total > 0) {
        const pagoId   = crypto.randomUUID();
        const tipoPago = (PAYMENT_TYPE_BY_CONSULTATION[input.consulta.tipo] ?? 'consulta') as IncomeType;

        // 'mixto' no existe en PaymentMethod → usar 'otro'
        const metodoPagoPago =
          input.metodoPago === 'mixto' ? 'otro' : input.metodoPago;

        const estadoPago =
          input.estado === 'pagada' ? 'pagado' : 'pendiente';

        await db.payments.add({
          id:          pagoId,
          pacienteId:  input.consulta.pacienteId,
          clinicaId:   clinicaId,
          consultaId:  input.consulta.id,
          fecha:       factura.fecha,
          concepto:    `${numero} — ${input.consulta.motivo?.slice(0, 120) ?? ''}`,
          tipo:        tipoPago,
          monto:       input.estado === 'pagada' ? total : montoPagado || total,
          metodoPago:  metodoPagoPago,
          estado:      estadoPago,
          notas:       input.notas,
          creadoEn:    ahora,
          syncStatus:  'pending',
          updatedAt:   ahora,
        });

        await db.invoices.update(id, { pagoId });
        await encolarSync({ coleccion: 'payments', documentoId: pagoId, operacion: 'create', datos: { id: pagoId, pacienteId: input.consulta.pacienteId, clinicaId, consultaId: input.consulta.id, fecha: factura.fecha, tipo: tipoPago, monto: input.estado === 'pagada' ? total : montoPagado || total, metodoPago: metodoPagoPago, estado: estadoPago, notas: input.notas, creadoEn: ahora, syncStatus: 'pending', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
      }

      // Sync queue
      const final = await db.invoices.get(id);
      if (final) {
        await encolarSync({ coleccion: 'invoices', documentoId: id, operacion: 'create', datos: final, intentos: 0, creadoEn: ahora });
      }
    }
  );

  return id;
}

/** Marca una factura pendiente como pagada */
export async function markInvoicePaid(
  id: string,
  metodoPago: InvoicePaymentMethod,
  notas?: string
): Promise<void> {
  const ahora   = Date.now();
  const factura = await db.invoices.get(id);
  if (!factura) throw new Error('Invoice no encontrada');

  await db.transaction('rw', [db.invoices, db.payments, db.syncQueue], async () => {
    await db.invoices.update(id, {
      estado:      'pagada',
      montoPagado: factura.total,
      metodoPago,
      notas:       notas ?? factura.notas,
      updatedAt:   ahora,
      syncStatus:  'pending',
    });

    if (factura.pagoId) {
      const metodoPagoPago = metodoPago === 'mixto' ? 'otro' : metodoPago;
      await db.payments.update(factura.pagoId, {
        estado:     'pagado',
        metodoPago: metodoPagoPago,
        monto:      factura.total,
        updatedAt:  ahora,
        syncStatus: 'pending',
      });
      await encolarSync({ coleccion: 'payments', documentoId: factura.pagoId, operacion: 'update', datos: { id: factura.pagoId, estado: 'pagado', metodoPago: metodoPagoPago, monto: factura.total, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
    }

    await encolarSync({ coleccion: 'invoices', documentoId: id, operacion: 'update', datos: { id, estado: 'pagada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
  });
}

/** Cancela una factura */
export async function cancelInvoice(id: string): Promise<void> {
  const ahora = Date.now();
  await db.invoices.update(id, { estado: 'cancelada', updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'invoices', documentoId: id, operacion: 'update', datos: { id, estado: 'cancelada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function generarNumeroFactura(clinicaId: string): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await db.invoices.where('clinicaId').equals(clinicaId).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

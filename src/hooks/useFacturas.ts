'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { FacturaLocal, FacturaCompleta, EstadoFactura, MetodoPagoFactura } from '@/types/factura';
import type { ConsultaLocal } from '@/types/consulta';
import type { TipoIngreso } from '@/types/finanzas';
import { TIPO_PAGO_POR_CONSULTA } from '@/types/consulta';

const CLINICA_ID = 'house-of-pets';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useFacturas(filtros?: {
  estado?: EstadoFactura;
  pacienteId?: string;
  duenoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}) {
  const resultado = useLiveQuery(async () => {
    let facturas = await db.facturas
      .where('clinicaId')
      .equals(CLINICA_ID)
      .filter((f) => !f.deletedAt)
      .toArray();

    if (filtros?.estado)     facturas = facturas.filter((f) => f.estado     === filtros.estado);
    if (filtros?.pacienteId) facturas = facturas.filter((f) => f.pacienteId === filtros.pacienteId);
    if (filtros?.duenoId)    facturas = facturas.filter((f) => f.duenoId    === filtros.duenoId);
    if (filtros?.fechaDesde) facturas = facturas.filter((f) => f.fecha      >= filtros.fechaDesde!);
    if (filtros?.fechaHasta) facturas = facturas.filter((f) => f.fecha      <= filtros.fechaHasta!);

    facturas.sort((a, b) => b.creadoEn - a.creadoEn);

    const pacienteIds  = [...new Set(facturas.map((f) => f.pacienteId))];
    const duenoIds     = [...new Set(facturas.map((f) => f.duenoId).filter(Boolean))];
    const pacientes    = await db.pacientes.bulkGet(pacienteIds);
    const duenos       = await db.duenos.bulkGet(duenoIds);
    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));
    const duenosMap    = new Map(duenos.filter(Boolean).map((d) => [d!.id, d!]));

    return facturas.map<FacturaCompleta>((f) => ({
      ...f,
      nombrePaciente:  pacientesMap.get(f.pacienteId)?.nombre,
      especiePaciente: pacientesMap.get(f.pacienteId)?.especie,
      razaPaciente:    pacientesMap.get(f.pacienteId)?.raza,
      nombreDueno:     duenosMap.get(f.duenoId)?.nombre,
      telefonoDueno:   duenosMap.get(f.duenoId)?.telefono,
    }));
  }, [filtros?.estado, filtros?.pacienteId, filtros?.duenoId, filtros?.fechaDesde, filtros?.fechaHasta]);

  return {
    facturas: resultado ?? [],
    cargando: resultado === undefined,
  };
}

export function useFactura(id: string) {
  const resultado = useLiveQuery(async () => {
    const f = await db.facturas.get(id);
    if (!f || f.deletedAt) return null;

    const paciente = await db.pacientes.get(f.pacienteId);
    const dueno    = f.duenoId ? await db.duenos.get(f.duenoId) : undefined;

    return {
      ...f,
      nombrePaciente:  paciente?.nombre,
      especiePaciente: paciente?.especie,
      razaPaciente:    paciente?.raza,
      nombreDueno:     dueno?.nombre,
      telefonoDueno:   dueno?.telefono,
    } as FacturaCompleta;
  }, [id]);

  return {
    factura:  resultado ?? null,
    cargando: resultado === undefined,
  };
}

export function useFacturasPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    const facturas = await db.facturas
      .where('pacienteId')
      .equals(pacienteId)
      .filter((f) => !f.deletedAt)
      .toArray();
    return facturas.sort((a, b) => b.creadoEn - a.creadoEn);
  }, [pacienteId]);

  return {
    facturas: resultado ?? [],
    cargando: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearFacturaInput {
  consulta: ConsultaLocal;
  metodoPago: MetodoPagoFactura;
  estado: EstadoFactura;
  /** Monto efectivamente cobrado — solo para parcialmente_pagada */
  montoPagado?: number;
  /** Override del descuento de la consulta */
  descuento?: number;
  notas?: string;
}

/** Crea la factura, crea el pago (si aplica) y enlaza ambos a la consulta */
export async function crearFactura(input: CrearFacturaInput): Promise<string> {
  const ahora     = Date.now();
  const id        = crypto.randomUUID();
  const numero    = await generarNumeroFactura();
  const descuento = input.descuento ?? input.consulta.descuento;
  const subtotal  = input.consulta.subtotal;
  const total     = Math.max(0, subtotal - descuento);

  const montoPagado =
    input.estado === 'pagada'              ? total :
    input.estado === 'parcialmente_pagada' ? (input.montoPagado ?? 0) :
    0;

  const factura: FacturaLocal = {
    id,
    numero,
    consultaId:  input.consulta.id,
    pacienteId:  input.consulta.pacienteId,
    duenoId:     input.consulta.duenoId,
    clinicaId:   CLINICA_ID,
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
    [db.facturas, db.pagos, db.consultas, db.syncQueue],
    async () => {
      await db.facturas.add(factura);

      // Enlazar factura a la consulta
      await db.consultas.update(input.consulta.id, {
        facturaId:  id,
        updatedAt:  ahora,
        syncStatus: 'pending',
      });

      // Crear pago si hay algo cobrado o la factura está pendiente (cuenta por cobrar)
      if (total > 0) {
        const pagoId   = crypto.randomUUID();
        const tipoPago = (TIPO_PAGO_POR_CONSULTA[input.consulta.tipo] ?? 'consulta') as TipoIngreso;

        // 'mixto' no existe en MetodoPago → usar 'otro'
        const metodoPagoPago =
          input.metodoPago === 'mixto' ? 'otro' : input.metodoPago;

        const estadoPago =
          input.estado === 'pagada' ? 'pagado' : 'pendiente';

        await db.pagos.add({
          id:          pagoId,
          pacienteId:  input.consulta.pacienteId,
          clinicaId:   CLINICA_ID,
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

        await db.facturas.update(id, { pagoId });
      }

      // Sync queue
      const final = await db.facturas.get(id);
      if (final) {
        await encolarSync({ coleccion: 'facturas', documentoId: id, operacion: 'create', datos: final, intentos: 0, creadoEn: ahora });
      }
    }
  );

  return id;
}

/** Marca una factura pendiente como pagada */
export async function marcarFacturaPagada(
  id: string,
  metodoPago: MetodoPagoFactura,
  notas?: string
): Promise<void> {
  const ahora   = Date.now();
  const factura = await db.facturas.get(id);
  if (!factura) throw new Error('Factura no encontrada');

  await db.transaction('rw', [db.facturas, db.pagos, db.syncQueue], async () => {
    await db.facturas.update(id, {
      estado:      'pagada',
      montoPagado: factura.total,
      metodoPago,
      notas:       notas ?? factura.notas,
      updatedAt:   ahora,
      syncStatus:  'pending',
    });

    if (factura.pagoId) {
      const metodoPagoPago = metodoPago === 'mixto' ? 'otro' : metodoPago;
      await db.pagos.update(factura.pagoId, {
        estado:     'pagado',
        metodoPago: metodoPagoPago,
        monto:      factura.total,
        updatedAt:  ahora,
        syncStatus: 'pending',
      });
    }

    await encolarSync({ coleccion: 'facturas', documentoId: id, operacion: 'update', datos: { id, estado: 'pagada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
  });
}

/** Cancela una factura */
export async function cancelarFactura(id: string): Promise<void> {
  const ahora = Date.now();
  await db.facturas.update(id, { estado: 'cancelada', updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'facturas', documentoId: id, operacion: 'update', datos: { id, estado: 'cancelada', updatedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function generarNumeroFactura(): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await db.facturas.where('clinicaId').equals(CLINICA_ID).count();
  return `FAC-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

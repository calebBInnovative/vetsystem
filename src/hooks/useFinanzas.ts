'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { PagoLocal, EstadoPago } from '@/types/finanzas';
import type { EstadoFactura } from '@/types/factura';
import type { PagoFormData } from '@/lib/validations/finanzas.schema';

const CLINICA_ID = 'house-of-pets';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista de pagos filtrados por rango de fechas.
 * Por defecto retorna los del mes actual.
 */
export function usePagos(fechaInicio?: string, fechaFin?: string) {
  const hoy   = new Date();
  const desde = fechaInicio ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hasta = fechaFin    ?? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const pagos = await db.pagos
      .where('fecha')
      .between(desde, hasta, true, true)
      .filter((p) => !p.deletedAt && p.clinicaId === CLINICA_ID)
      .toArray();

    pagos.sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Join con pacientes
    const pacienteIds  = [...new Set(pagos.map((p) => p.pacienteId))];
    const pacientes    = await db.pacientes.bulkGet(pacienteIds);
    const pacientesMap = new Map(pacientes.filter(Boolean).map((p) => [p!.id, p!]));

    return pagos.map((p) => ({
      ...p,
      nombrePaciente:  pacientesMap.get(p.pacienteId)?.nombre ?? 'Paciente',
      especiePaciente: pacientesMap.get(p.pacienteId)?.especie,
    }));
  }, [desde, hasta]);

  return {
    pagos:    resultado ?? [],
    cargando: resultado === undefined,
  };
}

/**
 * KPIs financieros: total hoy, semana, mes y conteo por método.
 */
export function useResumenFinanciero() {
  const hoy  = new Date();
  const hoyStr  = hoy.toISOString().slice(0, 10);
  const mesStr  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const mesFinStr = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Inicio de la semana (lunes)
  const diaSemana  = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - diaSemana);
  const semanaStr = inicioSemana.toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const pagosMes = await db.pagos
      .where('fecha')
      .between(mesStr, mesFinStr, true, true)
      .filter((p) => !p.deletedAt && p.clinicaId === CLINICA_ID && p.estado === 'pagado')
      .toArray();

    const totalHoy     = pagosMes.filter((p) => p.fecha === hoyStr).reduce((s, p) => s + p.monto, 0);
    const totalSemana  = pagosMes.filter((p) => p.fecha >= semanaStr).reduce((s, p) => s + p.monto, 0);
    const totalMes     = pagosMes.reduce((s, p) => s + p.monto, 0);
    const pendientes   = await db.pagos
      .where('clinicaId').equals(CLINICA_ID)
      .filter((p) => !p.deletedAt && p.estado === 'pendiente')
      .count();

    // Agrupado por tipo de ingreso
    const porTipo = pagosMes.reduce<Record<string, number>>((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] ?? 0) + p.monto;
      return acc;
    }, {});

    // Agrupado por método de pago
    const porMetodo = pagosMes.reduce<Record<string, number>>((acc, p) => {
      acc[p.metodoPago] = (acc[p.metodoPago] ?? 0) + p.monto;
      return acc;
    }, {});

    return { totalHoy, totalSemana, totalMes, pendientes, porTipo, porMetodo, cantidadMes: pagosMes.length };
  }, [hoyStr, mesStr, semanaStr]);

  return {
    resumen:  resultado,
    cargando: resultado === undefined,
  };
}

/**
 * Pagos de un paciente específico.
 */
export function usePagosPaciente(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.pagos
      .where('pacienteId').equals(pacienteId)
      .filter((p) => !p.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    pagos:    resultado ?? [],
    cargando: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export async function crearPago(datos: PagoFormData): Promise<string> {
  const ahora  = Date.now();
  const pagoId = crypto.randomUUID();

  const nuevo: PagoLocal = {
    id:         pagoId,
    pacienteId: datos.pacienteId,
    clinicaId:  CLINICA_ID,
    fecha:      datos.fecha,
    concepto:   datos.concepto,
    tipo:       datos.tipo,
    monto:      datos.monto as number,
    metodoPago: datos.metodoPago,
    estado:     datos.estado ?? 'pagado',
    notas:      datos.notas || undefined,
    creadoEn:   ahora,
    syncStatus: 'pending',
    updatedAt:  ahora,
  };

  await db.pagos.add(nuevo);
  await encolarSync({ coleccion: 'pagos', documentoId: pagoId, operacion: 'create', datos: nuevo, intentos: 0, creadoEn: ahora });
  return pagoId;
}

export async function cambiarEstadoPago(id: string, estado: EstadoPago): Promise<void> {
  const ahora = Date.now();

  await db.transaction('rw', [db.pagos, db.consultas, db.facturas, db.syncQueue], async () => {
    await db.pagos.update(id, { estado, updatedAt: ahora, syncStatus: 'pending' });

    // Sincronizar la factura vinculada: pago → consulta → factura
    const pago = await db.pagos.get(id);
    if (pago?.consultaId) {
      const consulta = await db.consultas.get(pago.consultaId);
      if (consulta?.facturaId) {
        const estadoFactura: EstadoFactura =
          estado === 'pagado'    ? 'pagada'   :
          estado === 'cancelado' ? 'cancelada' : 'pendiente';

        const factura = await db.facturas.get(consulta.facturaId);
        await db.facturas.update(consulta.facturaId, {
          estado:      estadoFactura,
          montoPagado: estadoFactura === 'pagada' ? (factura?.total ?? 0) : (factura?.montoPagado ?? 0),
          updatedAt:   ahora,
          syncStatus:  'pending',
        });
      }
    }

    await encolarSync({ coleccion: 'pagos', documentoId: id, operacion: 'update', datos: { id, estado, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
  });
}

export async function eliminarPago(id: string): Promise<void> {
  const ahora = Date.now();
  await db.pagos.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({ coleccion: 'pagos', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

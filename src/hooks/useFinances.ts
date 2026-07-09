'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { PaymentLocal, PaymentStatus } from '@/types/finances';
import type { InvoiceStatus } from '@/types/invoice';
import type { PagoFormData } from '@/lib/validations/finances.schema';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista de payments filtrados por rango de fechas.
 * Por defecto retorna los del mes actual.
 */
export function usePayments(fechaInicio?: string, fechaFin?: string) {
  const hoy   = new Date();
  const desde = fechaInicio ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hasta = fechaFin    ?? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    // Pagos del rango de fechas (mes actual por defecto)
    const pagosMes = await db.payments
      .where('fecha')
      .between(desde, hasta, true, true)
      .filter((p) => !p.deletedAt && p.clinicaId === clinicaId)
      .toArray();

    // Cuentas por cobrar de meses anteriores (pendientes históricos)
    const pendientesHistoricos = await db.payments
      .where('clinicaId')
      .equals(clinicaId)
      .filter((p) => !p.deletedAt && p.estado === 'pendiente' && p.fecha < desde)
      .toArray();

    // Combinar sin duplicados (los pendientes del mes ya están en pagosMes)
    const idsEnMes = new Set(pagosMes.map((p) => p.id));
    const todos = [...pagosMes, ...pendientesHistoricos.filter((p) => !idsEnMes.has(p.id))];
    todos.sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Join con patients
    const pacienteIds  = [...new Set(todos.map((p) => p.pacienteId))];
    const patients    = await db.patients.bulkGet(pacienteIds);
    const pacientesMap = new Map(patients.filter(Boolean).map((p) => [p!.id, p!]));

    return todos.map((p) => ({
      ...p,
      nombrePaciente:  pacientesMap.get(p.pacienteId)?.nombre ?? 'Patient',
      especiePaciente: pacientesMap.get(p.pacienteId)?.especie,
    }));
  }, [desde, hasta]);

  return {
    payments:    resultado ?? [],
    loading: resultado === undefined,
  };
}

/**
 * KPIs financieros completos: ingresos, egresos y balance neto del mes.
 * Egresos se leen directamente de pagosGastos y pagosColaboradores (Opción A —
 * no se duplican en la tabla payments, cada módulo es dueño de sus datos).
 */
export function useFinancialSummary() {
  const hoy  = new Date();
  const hoyStr    = hoy.toISOString().slice(0, 10);
  const mesStr    = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const mesFinStr = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  const diaSemana    = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - diaSemana);
  const semanaStr = inicioSemana.toISOString().slice(0, 10);

  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();

    // ── Ingresos (payments de patients/consultations) ──────────────────────────────
    const pagosMes = await db.payments
      .where('fecha')
      .between(mesStr, mesFinStr, true, true)
      .filter((p) => !p.deletedAt && p.clinicaId === clinicaId && p.estado === 'pagado')
      .toArray();

    const totalHoy    = pagosMes.filter((p) => p.fecha === hoyStr).reduce((s, p) => s + p.monto, 0);
    const totalSemana = pagosMes.filter((p) => p.fecha >= semanaStr).reduce((s, p) => s + p.monto, 0);
    const totalMes    = pagosMes.reduce((s, p) => s + p.monto, 0);

    const pendientes = await db.payments
      .where('clinicaId').equals(clinicaId)
      .filter((p) => !p.deletedAt && p.estado === 'pendiente')
      .count();

    const porTipo = pagosMes.reduce<Record<string, number>>((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] ?? 0) + p.monto;
      return acc;
    }, {});

    const porMetodo = pagosMes.reduce<Record<string, number>>((acc, p) => {
      acc[p.metodoPago] = (acc[p.metodoPago] ?? 0) + p.monto;
      return acc;
    }, {});

    // ── Egresos: gastos fijos pagados este mes ───────────────────────────────
    const gastosDelMes = await db.expensePayments
      .where('fechaPago')
      .between(mesStr, mesFinStr, true, true)
      .filter((g) => g.clinicaId === clinicaId && !g.deletedAt)
      .toArray();
    const totalGastos = gastosDelMes.reduce((s, g) => s + g.monto, 0);

    // ── Egresos: colaboradores pagados este mes ──────────────────────────────
    const colabDelMes = await db.collaboratorPayments
      .where('fechaPago')
      .between(mesStr, mesFinStr, true, true)
      .filter((c) => c.clinicaId === clinicaId && !c.deletedAt)
      .toArray();
    const totalColaboradores = colabDelMes.reduce((s, c) => s + c.monto, 0);

    const totalEgresos  = totalGastos + totalColaboradores;
    const balanceNeto   = totalMes - totalEgresos;

    return {
      totalHoy, totalSemana, totalMes, pendientes,
      porTipo, porMetodo, cantidadMes: pagosMes.length,
      totalGastos, totalColaboradores, totalEgresos, balanceNeto,
    };
  }, [hoyStr, mesStr, semanaStr]);

  return {
    summary:  resultado,
    loading: resultado === undefined,
  };
}

/**
 * Pagos de un paciente específico.
 */
export function usePatientPayments(pacienteId: string) {
  const resultado = useLiveQuery(async () => {
    return db.payments
      .where('pacienteId').equals(pacienteId)
      .filter((p) => !p.deletedAt)
      .reverse()
      .sortBy('fecha');
  }, [pacienteId]);

  return {
    payments:    resultado ?? [],
    loading: resultado === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export async function createPayment(datos: PagoFormData): Promise<string> {
  const ahora  = Date.now();
  const pagoId = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const nuevo: PaymentLocal = {
    id:         pagoId,
    pacienteId: datos.pacienteId,
    clinicaId:  clinicaId,
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

  await db.payments.add(nuevo);
  await encolarSync({ coleccion: 'payments', documentoId: pagoId, operacion: 'create', datos: nuevo, intentos: 0, creadoEn: ahora });
  return pagoId;
}

export async function updatePaymentStatus(id: string, estado: PaymentStatus): Promise<void> {
  const ahora = Date.now();

  await db.transaction('rw', [db.payments, db.consultations, db.invoices, db.syncQueue], async () => {
    await db.payments.update(id, { estado, updatedAt: ahora, syncStatus: 'pending' });

    // Sincronizar la factura vinculada: pago → consulta → factura
    const pago = await db.payments.get(id);
    if (pago?.consultaId) {
      const consulta = await db.consultations.get(pago.consultaId);
      if (consulta?.facturaId) {
        const estadoFactura: InvoiceStatus =
          estado === 'pagado'    ? 'pagada'   :
          estado === 'cancelado' ? 'cancelada' : 'pendiente';

        const factura = await db.invoices.get(consulta.facturaId);
        const montoFinal = estadoFactura === 'pagada' ? (factura?.total ?? 0) : (factura?.montoPagado ?? 0);
        await db.invoices.update(consulta.facturaId, {
          estado:      estadoFactura,
          montoPagado: montoFinal,
          updatedAt:   ahora,
          syncStatus:  'pending',
        });
        await encolarSync({ coleccion: 'invoices', documentoId: consulta.facturaId, operacion: 'update', datos: { id: consulta.facturaId, estado: estadoFactura, montoPagado: montoFinal, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
      }
    }

    await encolarSync({ coleccion: 'payments', documentoId: id, operacion: 'update', datos: { id, estado, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
  });
}

export async function deletePayment(id: string): Promise<void> {
  const ahora = Date.now();
  await db.payments.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({ coleccion: 'payments', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

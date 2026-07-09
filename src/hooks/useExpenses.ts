'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { FixedExpense, ExpensePayment, ExpenseCategory, ExpenseFrequency } from '@/types/expense';
import {
  alertLevel,
  calculateNextDueDate,
} from '@/types/expense';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useFixedExpenses() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const gastos = await db.fixedExpenses
      .where('clinicaId')
      .equals(clinicaId)
      .filter((g) => !g.deletedAt)
      .toArray();
    return gastos.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, []);

  return { gastos: resultado ?? [], loading: resultado === undefined };
}

export function useExpensePayments() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    return db.expensePayments
      .where('clinicaId')
      .equals(clinicaId)
      .toArray();
  }, []);

  return { payments: resultado ?? [], loading: resultado === undefined };
}

export function useAlertasGastos() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const gastos = await db.fixedExpenses
      .where('clinicaId')
      .equals(clinicaId)
      .filter((g) => !g.deletedAt && g.activo)
      .toArray();

    let vencidos = 0;
    let urgentes = 0;
    let proximos = 0;

    for (const g of gastos) {
      const nivel = alertLevel(g.nextDueDate);
      if (nivel === 'vencido') vencidos++;
      else if (nivel === 'urgente') urgentes++;
      else if (nivel === 'proximo') proximos++;
    }

    return { total: vencidos + urgentes + proximos, vencidos, urgentes, proximos };
  }, []);

  return resultado ?? { total: 0, vencidos: 0, urgentes: 0, proximos: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Calcula el primer vencimiento a partir de hoy para un diaPago dado. */
function calcularPrimerVencimiento(diaPago: number): string {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const anio = hoy.getFullYear();
  const mes  = hoy.getMonth(); // 0-indexed

  // Último día válido del mes actual
  const ultimoDiaMesActual = new Date(anio, mes + 1, 0).getDate();
  const diaEfectivo = Math.min(diaPago, ultimoDiaMesActual);

  const fechaEsteMes = new Date(anio, mes, diaEfectivo);

  if (fechaEsteMes >= hoy) {
    return fechaEsteMes.toISOString().slice(0, 10);
  }

  // Ya pasó — siguiente mes
  const mesSig = mes + 1;
  const anioSig = mesSig > 11 ? anio + 1 : anio;
  const mesAjustado = mesSig % 12;
  const ultimoDiaMesSig = new Date(anioSig, mesAjustado + 1, 0).getDate();
  const diaEfectivoSig = Math.min(diaPago, ultimoDiaMesSig);
  return new Date(anioSig, mesAjustado, diaEfectivoSig).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearGastoFijoInput {
  nombre:    string;
  monto:     number;
  categoria: ExpenseCategory;
  frecuencia: ExpenseFrequency;
  diaPago:   number;
}

export async function createFixedExpense(input: CrearGastoFijoInput): Promise<string> {
  const ahora     = Date.now();
  const id        = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const gasto: FixedExpense = {
    id,
    clinicaId,
    nombre:             input.nombre,
    monto:              input.monto,
    categoria:          input.categoria,
    frecuencia:         input.frecuencia,
    diaPago:            input.diaPago,
    nextDueDate: calcularPrimerVencimiento(input.diaPago),
    activo:             true,
    syncStatus:         'pending',
    createdAt:          ahora,
    updatedAt:          ahora,
  };

  await db.fixedExpenses.add(gasto);
  await encolarSync({ coleccion: 'fixedExpenses', documentoId: id, operacion: 'create', datos: gasto, intentos: 0, creadoEn: ahora });
  return id;
}

export async function updateFixedExpense(
  id: string,
  data: Partial<Pick<FixedExpense, 'nombre' | 'monto' | 'categoria' | 'frecuencia' | 'diaPago'>>,
): Promise<void> {
  const ahora = Date.now();
  const updates: Partial<FixedExpense> = { ...data, syncStatus: 'pending', updatedAt: ahora };

  if (data.diaPago !== undefined) {
    const existing = await db.fixedExpenses.get(id);
    if (existing) updates.nextDueDate = calcularPrimerVencimiento(data.diaPago);
  }

  await db.fixedExpenses.update(id, updates);
  await encolarSync({ coleccion: 'fixedExpenses', documentoId: id, operacion: 'update', datos: { id, ...updates }, intentos: 0, creadoEn: ahora });
}

export async function deleteFixedExpense(id: string): Promise<void> {
  const ahora = Date.now();
  const pagosVinculados = await db.expensePayments.where('gastoFijoId').equals(id).toArray();

  await db.transaction('rw', [db.fixedExpenses, db.expensePayments, db.syncQueue], async () => {
    await db.fixedExpenses.update(id, { deletedAt: ahora, updatedAt: ahora, syncStatus: 'pending' });

    // Soft-delete de cada pago para que Firebase también los elimine
    for (const pago of pagosVinculados) {
      await db.expensePayments.update(pago.id, { deletedAt: ahora, updatedAt: ahora, syncStatus: 'pending' });
      await db.syncQueue.add({ coleccion: 'expensePayments', documentoId: pago.id, operacion: 'delete', datos: { id: pago.id, deletedAt: ahora, updatedAt: ahora }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
    }

    await db.syncQueue.add({ coleccion: 'fixedExpenses', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora, updatedAt: ahora }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
  });
}

export async function markAsPaid(
  gastoFijoId: string,
  monto:       number,
  fechaPago:   string,
  notas?:      string,
): Promise<void> {
  const ahora     = Date.now();
  const clinicaId = await getClinicaId();

  const gasto = await db.fixedExpenses.get(gastoFijoId);
  if (!gasto) throw new Error('Gasto no encontrado');

  const pagoId = crypto.randomUUID();
  const pago: ExpensePayment = {
    id:          pagoId,
    clinicaId,
    gastoFijoId,
    monto,
    fechaPago,
    notas,
    syncStatus:  'pending',
    createdAt:   ahora,
    updatedAt:   ahora,
  };

  const nuevoVencimiento = calculateNextDueDate(
    gasto.nextDueDate,
    gasto.frecuencia,
    gasto.diaPago,
  );
  const gastoUpdates = { nextDueDate: nuevoVencimiento, updatedAt: ahora, syncStatus: 'pending' as const };

  await db.transaction('rw', [db.fixedExpenses, db.expensePayments, db.syncQueue], async () => {
    await db.expensePayments.add(pago);
    await db.fixedExpenses.update(gastoFijoId, gastoUpdates);
    await db.syncQueue.add({ coleccion: 'expensePayments', documentoId: pagoId, operacion: 'create', datos: pago, intentos: 0, creadoEn: ahora } as SyncQueueItem);
    await db.syncQueue.add({ coleccion: 'fixedExpenses', documentoId: gastoFijoId, operacion: 'update', datos: { id: gastoFijoId, ...gastoUpdates }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
  });
}

export async function toggleExpenseActive(id: string): Promise<void> {
  const ahora = Date.now();
  const gasto = await db.fixedExpenses.get(id);
  if (!gasto) return;
  const updates = { activo: !gasto.activo, updatedAt: ahora, syncStatus: 'pending' as const };
  await db.fixedExpenses.update(id, updates);
  await encolarSync({ coleccion: 'fixedExpenses', documentoId: id, operacion: 'update', datos: { id, ...updates }, intentos: 0, creadoEn: ahora });
}

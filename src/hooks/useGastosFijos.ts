'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId } from '@/lib/db/database';
import type { GastoFijo, PagoGasto, CategoriaGasto, FrecuenciaGasto } from '@/types/gasto';
import {
  nivelAlerta,
  calcularProximoVencimiento,
} from '@/types/gasto';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useGastosFijos() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const gastos = await db.gastosFijos
      .where('clinicaId')
      .equals(clinicaId)
      .filter((g) => !g.deletedAt)
      .toArray();
    return gastos.sort((a, b) => a.proximoVencimiento.localeCompare(b.proximoVencimiento));
  }, []);

  return { gastos: resultado ?? [], cargando: resultado === undefined };
}

export function usePagosGastos() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    return db.pagosGastos
      .where('clinicaId')
      .equals(clinicaId)
      .toArray();
  }, []);

  return { pagos: resultado ?? [], cargando: resultado === undefined };
}

export function useAlertasGastos() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const gastos = await db.gastosFijos
      .where('clinicaId')
      .equals(clinicaId)
      .filter((g) => !g.deletedAt && g.activo)
      .toArray();

    let vencidos = 0;
    let urgentes = 0;
    let proximos = 0;

    for (const g of gastos) {
      const nivel = nivelAlerta(g.proximoVencimiento);
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
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearGastoFijoInput {
  nombre:    string;
  monto:     number;
  categoria: CategoriaGasto;
  frecuencia: FrecuenciaGasto;
  diaPago:   number;
}

export async function crearGastoFijo(input: CrearGastoFijoInput): Promise<string> {
  const ahora     = Date.now();
  const id        = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const gasto: GastoFijo = {
    id,
    clinicaId,
    nombre:             input.nombre,
    monto:              input.monto,
    categoria:          input.categoria,
    frecuencia:         input.frecuencia,
    diaPago:            input.diaPago,
    proximoVencimiento: calcularPrimerVencimiento(input.diaPago),
    activo:             true,
    syncStatus:         'pending',
    createdAt:          ahora,
    updatedAt:          ahora,
  };

  await db.gastosFijos.add(gasto);
  return id;
}

export async function editarGastoFijo(
  id: string,
  data: Partial<Pick<GastoFijo, 'nombre' | 'monto' | 'categoria' | 'frecuencia' | 'diaPago'>>,
): Promise<void> {
  const ahora = Date.now();
  const updates: Partial<GastoFijo> = { ...data, syncStatus: 'pending', updatedAt: ahora };

  // If diaPago changed, recalculate proximoVencimiento from today
  if (data.diaPago !== undefined) {
    const existing = await db.gastosFijos.get(id);
    if (existing) {
      updates.proximoVencimiento = calcularPrimerVencimiento(data.diaPago);
    }
  }

  await db.gastosFijos.update(id, updates);
}

export async function eliminarGastoFijo(id: string): Promise<void> {
  const ahora = Date.now();
  await db.gastosFijos.update(id, {
    deletedAt:  ahora,
    updatedAt:  ahora,
    syncStatus: 'pending',
  });
}

export async function marcarComoPagado(
  gastoFijoId: string,
  monto:       number,
  fechaPago:   string,
  notas?:      string,
): Promise<void> {
  const ahora     = Date.now();
  const clinicaId = await getClinicaId();

  const gasto = await db.gastosFijos.get(gastoFijoId);
  if (!gasto) throw new Error('Gasto no encontrado');

  const pago: PagoGasto = {
    id:          crypto.randomUUID(),
    clinicaId,
    gastoFijoId,
    monto,
    fechaPago,
    notas,
    syncStatus:  'pending',
    createdAt:   ahora,
    updatedAt:   ahora,
  };

  const nuevoVencimiento = calcularProximoVencimiento(
    gasto.proximoVencimiento,
    gasto.frecuencia,
    gasto.diaPago,
  );

  await db.transaction('rw', [db.gastosFijos, db.pagosGastos], async () => {
    await db.pagosGastos.add(pago);
    await db.gastosFijos.update(gastoFijoId, {
      proximoVencimiento: nuevoVencimiento,
      updatedAt:          ahora,
      syncStatus:         'pending',
    });
  });
}

export async function toggleActivo(id: string): Promise<void> {
  const ahora = Date.now();
  const gasto = await db.gastosFijos.get(id);
  if (!gasto) return;
  await db.gastosFijos.update(id, {
    activo:     !gasto.activo,
    updatedAt:  ahora,
    syncStatus: 'pending',
  });
}

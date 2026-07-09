'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { Collaborator, CollaboratorPayment, CollaboratorPaymentFrequency } from '@/types/collaborator';
import {
  daysUntilCollaboratorPayment,
  calculateNextCollaboratorPayment,
  initialPaymentDate,
} from '@/types/collaborator';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useCollaborators() {
  const colaboradores = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const lista = await db.collaborators
      .where('clinicaId')
      .equals(clinicaId)
      .filter((c) => !c.deletedAt)
      .toArray();
    return lista.sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  }, []);

  const pagosColaboradores = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    return db.collaboratorPayments
      .where('clinicaId')
      .equals(clinicaId)
      .toArray();
  }, []);

  return {
    colaboradores:      colaboradores      ?? [],
    pagosColaboradores: pagosColaboradores ?? [],
    loading:           colaboradores === undefined,
  };
}

export function useAlertasColaboradores() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const lista = await db.collaborators
      .where('clinicaId')
      .equals(clinicaId)
      .filter((c) => !c.deletedAt && c.activo)
      .toArray();

    let vencidos = 0;
    let urgentes = 0;

    for (const c of lista) {
      const dias = daysUntilCollaboratorPayment(c.nextPaymentDate);
      if (dias < 0) vencidos++;
      else if (dias <= 7) urgentes++;
    }

    return { total: vencidos + urgentes, vencidos, urgentes };
  }, []);

  return resultado ?? { total: 0, vencidos: 0, urgentes: 0 };
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

export interface CrearColaboradorInput {
  nombre:         string;
  rol:            string;
  tipo:           Collaborator['tipo'];
  salario:        number;
  frecuenciaPago: CollaboratorPaymentFrequency;
  telefono?:      string;
  notas?:         string;
}

export async function createCollaborator(input: CrearColaboradorInput): Promise<string> {
  const ahora     = Date.now();
  const id        = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const colaborador: Collaborator = {
    id,
    clinicaId,
    nombre:         input.nombre,
    rol:            input.rol,
    tipo:           input.tipo,
    salario:        input.salario,
    frecuenciaPago: input.frecuenciaPago,
    nextPaymentDate:    initialPaymentDate(input.frecuenciaPago),
    activo:         true,
    telefono:       input.telefono,
    notas:          input.notas,
    syncStatus:     'pending',
    createdAt:      ahora,
    updatedAt:      ahora,
  };

  await db.collaborators.add(colaborador);
  await encolarSync({ coleccion: 'collaborators', documentoId: id, operacion: 'create', datos: colaborador, intentos: 0, creadoEn: ahora });
  return id;
}

export async function updateCollaborator(
  id: string,
  data: Partial<Pick<Collaborator, 'nombre' | 'rol' | 'tipo' | 'salario' | 'frecuenciaPago' | 'telefono' | 'notas'>>,
): Promise<void> {
  const ahora = Date.now();
  const updates: Partial<Collaborator> = { ...data, syncStatus: 'pending', updatedAt: ahora };

  if (data.frecuenciaPago !== undefined) {
    updates.nextPaymentDate = initialPaymentDate(data.frecuenciaPago);
  }

  await db.collaborators.update(id, updates);
  await encolarSync({ coleccion: 'collaborators', documentoId: id, operacion: 'update', datos: { id, ...updates }, intentos: 0, creadoEn: ahora });
}

export async function deleteCollaborator(id: string): Promise<void> {
  const ahora = Date.now();
  const pagosVinculados = await db.collaboratorPayments.where('colaboradorId').equals(id).toArray();

  await db.transaction('rw', [db.collaborators, db.collaboratorPayments, db.syncQueue], async () => {
    await db.collaborators.update(id, { deletedAt: ahora, updatedAt: ahora, syncStatus: 'pending' });

    for (const pago of pagosVinculados) {
      await db.collaboratorPayments.update(pago.id, { deletedAt: ahora, updatedAt: ahora, syncStatus: 'pending' });
      await db.syncQueue.add({ coleccion: 'collaboratorPayments', documentoId: pago.id, operacion: 'delete', datos: { id: pago.id, deletedAt: ahora, updatedAt: ahora }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
    }

    await db.syncQueue.add({ coleccion: 'collaborators', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora, updatedAt: ahora }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
  });
}

export async function registerCollaboratorPayment(
  colaboradorId: string,
  monto:         number,
  periodo:       string,
  fechaPago:     string,
  notas?:        string,
): Promise<void> {
  const ahora     = Date.now();
  const clinicaId = await getClinicaId();

  const colaborador = await db.collaborators.get(colaboradorId);
  if (!colaborador) throw new Error('Collaborator no encontrado');

  const pagoId = crypto.randomUUID();
  const pago: CollaboratorPayment = {
    id:            pagoId,
    clinicaId,
    colaboradorId,
    monto,
    periodo,
    fechaPago,
    notas,
    syncStatus:    'pending',
    createdAt:     ahora,
    updatedAt:     ahora,
  };

  const nuevoProximoPago = calculateNextCollaboratorPayment(colaborador.nextPaymentDate, colaborador.frecuenciaPago);
  const colabUpdates = { nextPaymentDate: nuevoProximoPago, updatedAt: ahora, syncStatus: 'pending' as const };

  await db.transaction('rw', [db.collaborators, db.collaboratorPayments, db.syncQueue], async () => {
    await db.collaboratorPayments.add(pago);
    await db.collaborators.update(colaboradorId, colabUpdates);
    await db.syncQueue.add({ coleccion: 'collaboratorPayments', documentoId: pagoId, operacion: 'create', datos: pago, intentos: 0, creadoEn: ahora } as SyncQueueItem);
    await db.syncQueue.add({ coleccion: 'collaborators', documentoId: colaboradorId, operacion: 'update', datos: { id: colaboradorId, ...colabUpdates }, intentos: 0, creadoEn: ahora } as SyncQueueItem);
  });
}

export async function toggleCollaboratorActive(id: string): Promise<void> {
  const ahora = Date.now();
  const colaborador = await db.collaborators.get(id);
  if (!colaborador) return;
  const updates = { activo: !colaborador.activo, updatedAt: ahora, syncStatus: 'pending' as const };
  await db.collaborators.update(id, updates);
  await encolarSync({ coleccion: 'collaborators', documentoId: id, operacion: 'update', datos: { id, ...updates }, intentos: 0, creadoEn: ahora });
}

'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ServiceLocal, ServiceCategory } from '@/types/service';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useServices() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const services = await db.services
      .where('clinicaId')
      .equals(clinicaId)
      .filter((s) => !s.deletedAt)
      .toArray();
    return services.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  }, []);

  return {
    services: resultado ?? [],
    loading:  resultado === undefined,
  };
}

/** Solo los services activos — para el selector rápido en ConsultaForm */
export function useServiciosActivos() {
  const resultado = useLiveQuery(async () => {
    const clinicaId = await getClinicaId();
    const services = await db.services
      .where('clinicaId')
      .equals(clinicaId)
      .filter((s) => !s.deletedAt && s.activo)
      .toArray();
    return services.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  }, []);

  return resultado ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface ServicioInput {
  nombre: string;
  descripcion?: string;
  categoria: ServiceCategory;
  precio: number;
}

export async function createService(input: ServicioInput): Promise<string> {
  const ahora = Date.now();
  const id    = crypto.randomUUID();
  const clinicaId = await getClinicaId();

  const servicio: ServiceLocal = {
    id,
    nombre:      input.nombre.trim(),
    descripcion: input.descripcion?.trim() || undefined,
    categoria:   input.categoria,
    precio:      input.precio,
    activo:      true,
    clinicaId:   clinicaId,
    creadoEn:    ahora,
    syncStatus:  'pending',
    updatedAt:   ahora,
  };

  await db.services.add(servicio);
  await encolarSync({ coleccion: 'services', documentoId: id, operacion: 'create', datos: servicio, intentos: 0, creadoEn: ahora });
  return id;
}

export async function updateService(id: string, cambios: Partial<Pick<ServiceLocal, 'nombre' | 'descripcion' | 'categoria' | 'precio' | 'activo'>>): Promise<void> {
  const ahora = Date.now();
  await db.services.update(id, { ...cambios, updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'services', documentoId: id, operacion: 'update', datos: { id, ...cambios, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
}

export async function toggleServicioActivo(id: string): Promise<void> {
  const s = await db.services.get(id);
  if (!s) return;
  await updateService(id, { activo: !s.activo });
}

export async function deleteService(id: string): Promise<void> {
  const ahora = Date.now();
  await db.services.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({ coleccion: 'services', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

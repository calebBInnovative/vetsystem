'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncQueueItem } from '@/lib/db/database';
import type { ServicioLocal, CategoriaServicio } from '@/types/servicio';

const CLINICA_ID = 'house-of-pets';

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS DE LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export function useServicios() {
  const resultado = useLiveQuery(async () => {
    const servicios = await db.servicios
      .where('clinicaId')
      .equals(CLINICA_ID)
      .filter((s) => !s.deletedAt)
      .toArray();
    return servicios.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  }, []);

  return {
    servicios: resultado ?? [],
    cargando:  resultado === undefined,
  };
}

/** Solo los servicios activos — para el selector rápido en ConsultaForm */
export function useServiciosActivos() {
  const resultado = useLiveQuery(async () => {
    const servicios = await db.servicios
      .where('clinicaId')
      .equals(CLINICA_ID)
      .filter((s) => !s.deletedAt && s.activo)
      .toArray();
    return servicios.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  }, []);

  return resultado ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTACIONES
// ─────────────────────────────────────────────────────────────────────────────

export interface ServicioInput {
  nombre: string;
  descripcion?: string;
  categoria: CategoriaServicio;
  precio: number;
}

export async function crearServicio(input: ServicioInput): Promise<string> {
  const ahora = Date.now();
  const id    = crypto.randomUUID();

  const servicio: ServicioLocal = {
    id,
    nombre:      input.nombre.trim(),
    descripcion: input.descripcion?.trim() || undefined,
    categoria:   input.categoria,
    precio:      input.precio,
    activo:      true,
    clinicaId:   CLINICA_ID,
    creadoEn:    ahora,
    syncStatus:  'pending',
    updatedAt:   ahora,
  };

  await db.servicios.add(servicio);
  await encolarSync({ coleccion: 'servicios', documentoId: id, operacion: 'create', datos: servicio, intentos: 0, creadoEn: ahora });
  return id;
}

export async function actualizarServicio(id: string, cambios: Partial<Pick<ServicioLocal, 'nombre' | 'descripcion' | 'categoria' | 'precio' | 'activo'>>): Promise<void> {
  const ahora = Date.now();
  await db.servicios.update(id, { ...cambios, updatedAt: ahora, syncStatus: 'pending' });
  await encolarSync({ coleccion: 'servicios', documentoId: id, operacion: 'update', datos: { id, ...cambios, updatedAt: ahora }, intentos: 0, creadoEn: ahora });
}

export async function toggleServicioActivo(id: string): Promise<void> {
  const s = await db.servicios.get(id);
  if (!s) return;
  await actualizarServicio(id, { activo: !s.activo });
}

export async function eliminarServicio(id: string): Promise<void> {
  const ahora = Date.now();
  await db.servicios.update(id, { deletedAt: ahora, syncStatus: 'pending', updatedAt: ahora });
  await encolarSync({ coleccion: 'servicios', documentoId: id, operacion: 'delete', datos: { id, deletedAt: ahora }, intentos: 0, creadoEn: ahora });
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

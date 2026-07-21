'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ServiceLocal, ServiceCategory } from '@/types/service';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export function useServices() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const services = await db.services
      .where('clinicId')
      .equals(clinicId)
      .filter((s) => !s.deletedAt)
      .toArray();
    return services.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, []);

  return {
    services: result ?? [],
    loading:  result === undefined,
  };
}

/** Active services only — for the quick-add selector in ConsultationForm */
export function useServiciosActivos() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    const services = await db.services
      .where('clinicId')
      .equals(clinicId)
      .filter((s) => !s.deletedAt && s.active)
      .toArray();
    return services.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, []);

  return result ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceInput {
  name:         string;
  description?: string;
  category:     ServiceCategory;
  price:        number;
}

export async function createService(input: ServiceInput): Promise<string> {
  const now      = Date.now();
  const id       = crypto.randomUUID();
  const clinicId = await getClinicaId();

  const service: ServiceLocal = {
    id,
    name:        input.name.trim(),
    description: input.description?.trim() || undefined,
    category:    input.category,
    price:       input.price,
    active:      true,
    clinicId:    clinicId,
    createdAt:   now,
    syncStatus:  'pending',
    updatedAt:   now,
  };

  await db.services.add(service);
  await encolarSync({ collection: 'services', documentId: id, operation: 'create', data: service, attempts: 0, createdAt: now });
  return id;
}

export async function updateService(
  id: string,
  changes: Partial<Pick<ServiceLocal, 'name' | 'description' | 'category' | 'price' | 'active'>>
): Promise<void> {
  const now = Date.now();
  await db.services.update(id, { ...changes, updatedAt: now, syncStatus: 'pending' });
  await encolarSync({ collection: 'services', documentId: id, operation: 'update', data: { id, ...changes, updatedAt: now }, attempts: 0, createdAt: now });
}

export async function toggleServicioActivo(id: string): Promise<void> {
  const s = await db.services.get(id);
  if (!s) return;
  await updateService(id, { active: !s.active });
}

export async function deleteService(id: string): Promise<void> {
  const now = Date.now();
  await db.services.update(id, { deletedAt: now, syncStatus: 'pending', updatedAt: now });
  await encolarSync({ collection: 'services', documentId: id, operation: 'delete', data: { id, deletedAt: now }, attempts: 0, createdAt: now });
}

// ─────────────────────────────────────────────────────────────────────────────

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

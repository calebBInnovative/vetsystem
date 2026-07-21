// ─────────────────────────────────────────────────────────────────────────────
// Promotions — plain async data functions (no React hooks)
//
// Read with:  getPromotions / getActivePromotions
// Write with: createPromotion / updatePromotion / deletePromotion / togglePromotion
//
// Every write goes to Dexie first, then enqueues a sync operation so the
// SyncEngine can push it to Firestore when connectivity is available.
// ─────────────────────────────────────────────────────────────────────────────

import { db, type SyncQueueItem } from '@/lib/db/database';
import { applyDiscount, type PromotionLocal, type PromotionItem } from '@/types/promotion';

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Re-computes originalTotal and total from an items array so they are always
 * consistent with the individual item prices and quantities.
 */
function computeTotals(items: PromotionItem[]): { originalTotal: number; total: number } {
  const originalTotal = items.reduce((sum, item) => sum + item.originalPrice * item.quantity, 0);
  const total         = items.reduce((sum, item) => sum + item.finalUnitPrice * item.quantity, 0);
  return { originalTotal, total };
}

async function enqueueSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All non-deleted promotions for a clinic, sorted newest-first. */
export async function getPromotions(clinicId: string): Promise<PromotionLocal[]> {
  const list = await db.promotions
    .where('clinicId')
    .equals(clinicId)
    .filter((p) => !p.deletedAt)
    .toArray();
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Active promotions whose validity window includes today.
 * validFrom and validUntil are inclusive bounds (YYYY-MM-DD strings).
 * Promotions without date bounds are always considered valid.
 */
export async function getActivePromotions(clinicId: string): Promise<PromotionLocal[]> {
  const today = new Date().toISOString().slice(0, 10);
  const list  = await db.promotions
    .where('clinicId')
    .equals(clinicId)
    .filter((p) => {
      if (p.deletedAt || !p.active) return false;
      if (p.validFrom  && p.validFrom  > today) return false;
      if (p.validUntil && p.validUntil < today) return false;
      return true;
    })
    .toArray();
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createPromotion(input: {
  clinicId: string;
  name: string;
  description?: string;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  items: PromotionItem[];
}): Promise<string> {
  const now = Date.now();
  const id  = crypto.randomUUID();
  const { originalTotal, total } = computeTotals(input.items);

  const promotion: PromotionLocal = {
    id,
    clinicId:      input.clinicId,
    name:          input.name.trim(),
    description:   input.description?.trim() || undefined,
    active:        input.active,
    validFrom:     input.validFrom  || undefined,
    validUntil:    input.validUntil || undefined,
    items:         input.items,
    originalTotal,
    total,
    createdAt:     now,
    syncStatus:    'pending',
    updatedAt:     now,
  };

  await db.promotions.add(promotion);
  await enqueueSync({
    collection: 'promotions',
    documentId: id,
    operation:  'create',
    data:       promotion,
    attempts:   0,
    createdAt:  now,
  });

  return id;
}

export async function updatePromotion(
  id: string,
  patch: Partial<Omit<PromotionLocal, 'id' | 'clinicId' | 'createdAt'>>,
): Promise<void> {
  const now     = Date.now();
  let   changes = { ...patch, updatedAt: now, syncStatus: 'pending' as const };

  // If items are included in the patch, recompute the denormalized totals.
  if (patch.items) {
    const { originalTotal, total } = computeTotals(patch.items);
    changes = { ...changes, originalTotal, total };
  }

  await db.promotions.update(id, changes);
  await enqueueSync({
    collection: 'promotions',
    documentId: id,
    operation:  'update',
    data:       { id, ...changes },
    attempts:   0,
    createdAt:  now,
  });
}

/** Soft-delete: sets deletedAt so the deletion can be synced to Firestore. */
export async function deletePromotion(id: string): Promise<void> {
  const now = Date.now();
  await db.promotions.update(id, { deletedAt: now, syncStatus: 'pending', updatedAt: now });
  await enqueueSync({
    collection: 'promotions',
    documentId: id,
    operation:  'delete',
    data:       { id, deletedAt: now },
    attempts:   0,
    createdAt:  now,
  });
}

export async function togglePromotion(id: string, active: boolean): Promise<void> {
  await updatePromotion(id, { active });
}

// Re-export applyDiscount so callers don't need a second import.
export { applyDiscount };

import { db, branchOf, getClinicId, type SyncQueueItem } from '@/lib/db/database';
import { DEFAULT_MAIN_BRANCH, MAIN_BRANCH_ID } from '@/types/branch';
import type { ProductLocal, StockMovementLocal } from '@/types/inventory';

export interface StockTransferInput {
  productId: string;
  toBranchId: string;
  quantity: number;
  note?: string;
}

export interface StockTransferResult {
  transferId: string;
  /** The product row in the destination branch */
  targetProductId: string;
  /** true when the destination had no such product and a copy was created */
  createdInTarget: boolean;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

async function branchName(id: string): Promise<string> {
  return (await db.branches.get(id))?.name ?? (id === MAIN_BRANCH_ID ? DEFAULT_MAIN_BRANCH.name : 'otra sucursal');
}

/**
 * Moves stock of a product from its branch to another one. Each branch keeps
 * its own product rows, so "the same product" in the destination is the one
 * with the same name and unit; when there is none, a copy (same catalog data
 * and prices, no stock) is created there. Both stock changes and their
 * movements ("Traslado a …" / "Traslado desde …", one shared referenceId) are
 * written in a single transaction, so a failure leaves neither branch changed.
 */
export async function transferStock(input: StockTransferInput): Promise<StockTransferResult> {
  const quantity = Number(input.quantity);
  const source = await db.products.get(input.productId);
  if (!source || source.deletedAt) throw new Error('Product not found');
  const fromBranchId = branchOf(source);
  if (input.toBranchId === fromBranchId) throw new Error('Source and destination branch are the same');
  if (!(quantity > 0) || quantity > source.currentStock) throw new Error('Invalid transfer quantity');

  // Read everything outside the transaction (it only lists the tables it writes).
  const clinicId = await getClinicId();
  const [fromName, toName] = await Promise.all([branchName(fromBranchId), branchName(input.toBranchId)]);
  const existingTarget = await db.products.where('clinicId').equals(clinicId)
    .filter((p) => !p.deletedAt && branchOf(p) === input.toBranchId
      && normalize(p.name) === normalize(source.name) && p.unit === source.unit)
    .first();

  const now = Date.now();
  const transferId = crypto.randomUUID();
  const note = input.note?.trim();
  const sourceAfter = source.currentStock - quantity;
  const targetBefore = existingTarget?.currentStock ?? 0;
  const targetAfter = targetBefore + quantity;
  const targetProductId = existingTarget?.id ?? crypto.randomUUID();

  const movement = (productId: string, branchId: string, type: 'entry' | 'exit', before: number, after: number, reason: string) => ({
    id: crypto.randomUUID(), productId, clinicId, branchId, type, quantity, stockBefore: before, stockAfter: after,
    reason: note ? `${reason} · ${note}` : reason, referenceId: transferId,
    createdAt: now, syncStatus: 'pending' as const, updatedAt: now,
  }) as StockMovementLocal & { branchId: string };
  const outMovement = movement(source.id, fromBranchId, 'exit', source.currentStock, sourceAfter, `Traslado a ${toName}`);
  const inMovement = movement(targetProductId, input.toBranchId, 'entry', targetBefore, targetAfter, `Traslado desde ${fromName}`);

  const enqueue = (item: Omit<SyncQueueItem, 'id'>) => db.syncQueue.add(item as SyncQueueItem);

  await db.transaction('rw', [db.products, db.movements, db.syncQueue], async () => {
    await db.products.update(source.id, { currentStock: sourceAfter, updatedAt: now, syncStatus: 'pending' });
    await enqueue({ collection: 'products', documentId: source.id, operation: 'update', data: { id: source.id, currentStock: sourceAfter, updatedAt: now }, attempts: 0, createdAt: now });

    if (existingTarget) {
      await db.products.update(existingTarget.id, { currentStock: targetAfter, updatedAt: now, syncStatus: 'pending' });
      await enqueue({ collection: 'products', documentId: existingTarget.id, operation: 'update', data: { id: existingTarget.id, currentStock: targetAfter, updatedAt: now }, attempts: 0, createdAt: now });
    } else {
      // Same catalog data and prices; the branch is set explicitly so the
      // `creating` hook does not stamp the device's active branch on it.
      const { syncStatus: _s, cloudUpdatedAt: _c, deletedAt: _d, ...catalog } = source as ProductLocal & { cloudUpdatedAt?: number };
      void _s; void _c; void _d;
      const copy = { ...catalog, id: targetProductId, branchId: input.toBranchId, currentStock: targetAfter, createdAt: now, updatedAt: now, syncStatus: 'pending' as const };
      await db.products.add(copy as ProductLocal);
      const { syncStatus: _cs, ...copyData } = copy;
      void _cs;
      await enqueue({ collection: 'products', documentId: targetProductId, operation: 'create', data: copyData, attempts: 0, createdAt: now });
    }

    for (const m of [outMovement, inMovement]) {
      await db.movements.add(m);
      await enqueue({ collection: 'movements', documentId: m.id, operation: 'create', data: m, attempts: 0, createdAt: now });
    }
  });

  return { transferId, targetProductId, createdInTarget: !existingTarget };
}

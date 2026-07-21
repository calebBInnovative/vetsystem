'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getClinicaId, type SyncQueueItem } from '@/lib/db/database';
import type { ProductLocal, StockMovementLocal, ProductCategory } from '@/types/inventory';
import type { ProductoFormData, AjusteStockFormData } from '@/lib/validations/inventory.schema';

// ─────────────────────────────────────────────────────────────────────────────
// READ HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/** Active products, filtered optionally by category or search term */
export function useProducts(search = '', category?: ProductCategory) {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    let products = await db.products
      .where('clinicId')
      .equals(clinicId)
      .filter((p) => !p.deletedAt && p.active)
      .toArray();

    if (category) {
      products = products.filter((p) => p.category === category);
    }

    const term = search.toLowerCase().trim();
    if (term) {
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.description?.toLowerCase().includes(term) ?? false) ||
          (p.supplier?.toLowerCase().includes(term) ?? false)
      );
    }

    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [search, category]);

  return {
    products: result ?? [],
    loading:  result === undefined,
  };
}

/** Products at or below minimum stock */
export function useStockAlerts() {
  const result = useLiveQuery(async () => {
    const clinicId = await getClinicaId();
    return db.products
      .where('clinicId')
      .equals(clinicId)
      .filter((p) => !p.deletedAt && p.active && p.currentStock <= p.minimumStock)
      .toArray();
  }, []);

  return {
    alerts:  result ?? [],
    loading: result === undefined,
  };
}

/** Single product by ID */
export function useProduct(id: string) {
  const result = useLiveQuery(async () => {
    const p = await db.products.get(id);
    return p?.deletedAt ? null : (p ?? null);
  }, [id]);

  return {
    producto: result ?? null,
    loading:  result === undefined,
  };
}

/** Movement history for a product, most recent first */
export function useProductMovements(productId: string) {
  const result = useLiveQuery(async () => {
    return db.movements
      .where('productId')
      .equals(productId)
      .reverse()
      .sortBy('createdAt');
  }, [productId]);

  return {
    movements: result ?? [],
    loading:   result === undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a new product in the inventory */
export async function createProduct(data: ProductoFormData): Promise<string> {
  const now       = Date.now();
  const productId = crypto.randomUUID();
  const clinicId  = await getClinicaId();

  const newProduct: ProductLocal = {
    id:             productId,
    name:           data.name,
    category:       data.category,
    description:    data.description    || undefined,
    currentStock:   data.currentStock as number,
    minimumStock:   data.minimumStock as number,
    unit:           data.unit,
    salePrice:      data.salePrice,
    costPrice:      data.costPrice,
    expirationDate: data.expirationDate || undefined,
    batch:          data.batch          || undefined,
    supplier:       data.supplier       || undefined,
    active:         true,
    clinicId:       clinicId,
    createdAt:      now,
    syncStatus:     'pending',
    updatedAt:      now,
  };

  await db.products.add(newProduct);

  // Record initial stock movement
  if (newProduct.currentStock > 0) {
    await recordMovement({
      productId,
      type:        'entry',
      quantity:    newProduct.currentStock,
      stockBefore: 0,
      stockAfter:  newProduct.currentStock,
      reason:      'Initial stock',
    });
  }

  await encolarSync({ collection: 'products', documentId: productId, operation: 'create', data: newProduct, attempts: 0, createdAt: now });
  return productId;
}

/** Updates product fields */
export async function updateProduct(
  id: string,
  changes: Partial<Omit<ProductLocal, 'id' | 'createdAt' | 'clinicId'>>
): Promise<void> {
  const now     = Date.now();
  const payload = { ...changes, updatedAt: now, syncStatus: 'pending' as const };
  await db.products.update(id, payload);
  await encolarSync({ collection: 'products', documentId: id, operation: 'update', data: { id, ...payload }, attempts: 0, createdAt: now });
}

/** Records a stock entry, exit, or adjustment and updates currentStock */
export async function adjustStock(productId: string, data: AjusteStockFormData): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);

  const delta       = data.type === 'exit' ? -data.quantity : data.quantity as number;
  const stockBefore = product.currentStock;
  const stockAfter  = Math.max(0, stockBefore + delta);

  const now = Date.now();
  await db.products.update(productId, {
    currentStock: stockAfter,
    updatedAt:    now,
    syncStatus:   'pending',
  });
  await encolarSync({ collection: 'products', documentId: productId, operation: 'update', data: { id: productId, currentStock: stockAfter, updatedAt: now }, attempts: 0, createdAt: now });

  await recordMovement({
    productId,
    type:        data.type,
    quantity:    data.quantity as number,
    stockBefore,
    stockAfter,
    reason:      data.reason,
  });
}

/** Soft delete */
export async function deleteProduct(id: string): Promise<void> {
  const now = Date.now();
  await db.products.update(id, { deletedAt: now, syncStatus: 'pending', updatedAt: now });
  await encolarSync({ collection: 'products', documentId: id, operation: 'delete', data: { id, deletedAt: now }, attempts: 0, createdAt: now });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function recordMovement(
  data: Omit<StockMovementLocal, 'id' | 'clinicId' | 'createdAt' | 'syncStatus' | 'updatedAt'>
): Promise<void> {
  const now      = Date.now();
  const clinicId = await getClinicaId();
  const movement: StockMovementLocal = {
    id:        crypto.randomUUID(),
    clinicId:  clinicId,
    createdAt: now,
    syncStatus:'pending',
    updatedAt: now,
    ...data,
  };
  await db.movements.add(movement);
  await encolarSync({ collection: 'movements', documentId: movement.id, operation: 'create', data: movement, attempts: 0, createdAt: now });
}

async function encolarSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  await db.syncQueue.add(item as SyncQueueItem);
}

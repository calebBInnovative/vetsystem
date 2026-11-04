import { db, type SyncQueueItem } from '@/lib/db/database';
import type { AuditAction, AuditCategory, AuditEntryLocal } from '@/types/audit';

export const AUDIT_CATEGORIES: Record<AuditCategory, string> = {
  void:     'Anulaciones',
  discount: 'Descuentos',
  stock:    'Stock',
  team:     'Equipo',
};

export function auditCategory(action: AuditAction): AuditCategory {
  if (action.startsWith('payment.') || action.startsWith('quote.')) return 'void';
  if (action.endsWith('.discount')) return 'discount';
  if (action.startsWith('stock.')) return 'stock';
  return 'team';
}

/**
 * Records a sensitive action in the Bitácora. Never throws: the action itself
 * already happened, and a failed log line must not undo or block it.
 * Call it after the action's own transaction, not inside it.
 */
export async function logAudit(entry: { action: AuditAction; summary: string; amount?: number; entityId?: string }): Promise<void> {
  try {
    const session = await db.session.get('singleton');
    if (!session) return;
    const now = Date.now();
    const row: AuditEntryLocal = {
      id: crypto.randomUUID(),
      clinicId: session.clinicId,
      ...entry,
      userId: session.uid,
      userName: session.userName,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };
    await db.transaction('rw', [db.auditLog, db.syncQueue], async () => {
      await db.auditLog.add(row);
      const { syncStatus: _s, ...data } = row;
      void _s;
      await db.syncQueue.add({
        collection: 'auditLog', documentId: row.id, operation: 'create', data, attempts: 0, createdAt: now,
      } as SyncQueueItem);
    });
  } catch (err) {
    console.error('[audit] could not record', entry.action, err);
  }
}

/** C$ 1,234.50 — the receipt's currency, for summaries. */
export function auditMoney(n: number): string {
  return `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

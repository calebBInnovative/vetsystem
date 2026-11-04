import type { SyncMeta } from '@/types/patient';

/** What happened. The prefix is the category the Bitácora filters by. */
export type AuditAction =
  | 'payment.cancel' | 'payment.refund' | 'payment.delete' | 'payment.correct'
  | 'quote.void' | 'quote.delete'
  | 'sale.discount' | 'invoice.discount'
  | 'stock.adjust' | 'stock.edit' | 'stock.transfer'
  | 'user.create' | 'user.update' | 'user.delete';

export type AuditCategory = 'void' | 'discount' | 'stock' | 'team';

/**
 * One line of the Bitácora: who did something sensitive, where and when.
 * Append-only (firestore.rules refuses edits and deletes); readable by managers.
 */
export interface AuditEntry {
  id: string;
  clinicId: string;
  /** Stamped by the creating hook with the active branch */
  branchId?: string;
  action: AuditAction;
  /** Human sentence in Spanish, e.g. "Anuló el pago de C$ 300 (Firulais)" */
  summary: string;
  /** Money involved, if any (C$) */
  amount?: number;
  /** The record it is about, to link to it */
  entityId?: string;
  userId: string;
  userName: string;
  createdAt: number;
}

export type AuditEntryLocal = AuditEntry & SyncMeta;

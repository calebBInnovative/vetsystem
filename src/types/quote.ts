import type { SyncMeta } from './patient';
import type { SaleItem } from './sale';

/**
 * A quote is a priced document handed to a client before any transaction exists.
 * It deliberately touches nothing else in the system: no stock movement, no
 * invoice, no payment, no revenue. Only converting it to a sale does that.
 */
export type QuoteStatus = 'open' | 'converted' | 'cancelled';

export interface Quote {
  id: string;
  /** Human-readable number: COT-2026-0001 */
  number: string;
  clinicId: string;
  /** ISO date "YYYY-MM-DD" */
  date: string;
  /** ISO date the quoted prices stop being honoured. Informational only. */
  validUntil?: string;
  /** Same shape as a sale's items, so converting is a straight hand-off */
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: QuoteStatus;
  /** Optional client — a quote can be anonymous */
  patientId?: string;
  notes?: string;
  /** Set once converted: the sale this quote turned into */
  saleId?: string;
  convertedAt?: number;
  createdAt: number;
}

export interface QuoteLocal extends Quote, SyncMeta {}

/** Quote with patient data joined — for lists and printing */
export interface QuoteWithDetails extends QuoteLocal {
  patientName?: string;
  ownerName?: string;
  ownerPhone?: string;
}

export const QUOTE_STATUSES: Record<QuoteStatus, { label: string; color: string; dot: string }> = {
  open: {
    label: 'Vigente',
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',
    dot:   'bg-blue-500',
  },
  converted: {
    label: 'Convertida en venta',
    color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',
    dot:   'bg-green-500',
  },
  cancelled: {
    label: 'Anulada',
    color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',
    dot:   'bg-red-400',
  },
};

/** True when the quote is still open but its validity date has passed. */
export function isQuoteExpired(quote: Quote, today = new Date().toISOString().slice(0, 10)): boolean {
  return quote.status === 'open' && !!quote.validUntil && quote.validUntil < today;
}

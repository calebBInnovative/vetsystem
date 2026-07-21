import type { SyncMeta } from './patient';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'paid'
  | 'pending'
  | 'partially_paid'
  | 'cancelled';

export type InvoicePaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'mixed';

// ─── Items ────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  type: 'service' | 'product';
  productId?: string;
}

// ─── Main Invoice ─────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  /** Human-readable number: FAC-2024-0001 */
  number: string;
  /** Present when the invoice comes from a consultation */
  consultationId?: string;
  /** Present when the invoice comes from a product sale */
  saleId?: string;
  /** Empty for anonymous sales without a patient */
  patientId?: string;
  ownerId?: string;
  clinicId: string;
  /** ISO date "YYYY-MM-DD" */
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: InvoicePaymentMethod;
  status: InvoiceStatus;
  /** Amount already collected (relevant for partially_paid) */
  amountPaid: number;
  notes?: string;
  /** ID of the PaymentLocal generated when registering payment */
  paymentId?: string;
  createdAt: number;
}

export interface InvoiceLocal extends Invoice, SyncMeta {}

/** Invoice with patient and owner data joined — for lists and views */
export interface InvoiceWithDetails extends InvoiceLocal {
  patientName?: string;
  patientSpecies?: string;
  patientBreed?: string;
  ownerName?: string;
  ownerPhone?: string;
}

// ─── UI Constants ─────────────────────────────────────────────────────────────

export const INVOICE_STATUSES: Record<InvoiceStatus, { label: string; color: string; punto: string }> = {
  paid: {
    label: 'Pagada',
    color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',
    punto: 'bg-green-500',
  },
  pending: {
    label: 'Pendiente',
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',
    punto: 'bg-amber-400',
  },
  partially_paid: {
    label: 'Parcial',
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',
    punto: 'bg-blue-500',
  },
  cancelled: {
    label: 'Cancelada',
    color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',
    punto: 'bg-red-400',
  },
};

export const INVOICE_PAYMENT_METHODS: Record<InvoicePaymentMethod, { label: string; emoji: string }> = {
  cash:     { label: 'Efectivo',      emoji: '💵' },
  card:     { label: 'Tarjeta',       emoji: '💳' },
  transfer: { label: 'Transferencia', emoji: '🏦' },
  mixed:    { label: 'Mixto',         emoji: '🔄' },
};

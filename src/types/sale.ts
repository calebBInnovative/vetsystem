import type { SyncMeta } from './patient';

export type SalePaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed';
export type SaleStatus        = 'completed' | 'cancelled';

export interface SaleItem {
  id: string;
  /** Set for product items; undefined for service-only items */
  productId?: string;
  /** Set when the item comes from a service (no inventory deduction) */
  serviceId?: string;
  itemType?: 'product' | 'service';
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  clinicId: string;
  /** ISO date "YYYY-MM-DD" */
  date: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: SalePaymentMethod;
  status: SaleStatus;
  /** Optional client — may be an anonymous sale */
  patientId?: string;
  notes?: string;
  /** ID of the generated PaymentLocal */
  paymentId?: string;
  /** ID of the generated InvoiceLocal */
  invoiceId?: string;
  createdAt: number;
}

export interface SaleLocal extends Sale, SyncMeta {}

export const SALE_PAYMENT_METHODS: Record<SalePaymentMethod, { label: string; emoji: string }> = {
  cash:     { label: 'Efectivo',      emoji: '💵' },
  card:     { label: 'Tarjeta',       emoji: '💳' },
  transfer: { label: 'Transferencia', emoji: '🏦' },
  mixed:    { label: 'Mixto',         emoji: '🔄' },
};

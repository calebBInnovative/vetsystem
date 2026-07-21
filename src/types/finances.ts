import type { SyncMeta } from './patient';

export type PaymentMethod  = 'cash' | 'card' | 'transfer' | 'check' | 'mixed' | 'other';
export type PaymentStatus  = 'pending' | 'paid' | 'cancelled' | 'refunded';
export type IncomeType = 'consultation' | 'vaccination' | 'surgery' | 'product' | 'grooming' | 'other';

export interface Payment {
  id: string;
  patientId: string;
  clinicId: string;

  /** ISO date string "YYYY-MM-DD" */
  date: string;

  concept:       string;
  type:          IncomeType;
  amount:        number;
  paymentMethod: PaymentMethod;
  status:        PaymentStatus;

  /** Optional reference to a consultation */
  consultationId?: string;
  /** Optional reference to an appointment */
  appointmentId?: string;

  notes?: string;
  createdAt: number;
}

export interface PaymentLocal extends Payment, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// UI CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; emoji: string }> = {
  cash:     { label: 'Efectivo',      emoji: '💵' },
  card:     { label: 'Tarjeta',       emoji: '💳' },
  transfer: { label: 'Transferencia', emoji: '🏦' },
  check:    { label: 'Cheque',        emoji: '📝' },
  mixed:    { label: 'Mixto',         emoji: '🔄' },
  other:    { label: 'Otro',          emoji: '💰' },
};

export const PAYMENT_STATUSES: Record<PaymentStatus, { label: string; color: string; punto: string }> = {
  pending:    { label: 'Pendiente',   color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',   punto: 'bg-amber-400' },
  paid:       { label: 'Pagado',      color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',   punto: 'bg-green-500' },
  cancelled:  { label: 'Cancelado',   color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',               punto: 'bg-red-400' },
  refunded:   { label: 'Reembolsado', color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800', punto: 'bg-purple-500' },
};

export const INCOME_TYPES: Record<IncomeType, { label: string; emoji: string }> = {
  consultation: { label: 'Consultation',   emoji: '🩺' },
  vaccination:  { label: 'Vacunación', emoji: '💉' },
  surgery:      { label: 'Cirugía',    emoji: '🔬' },
  product:      { label: 'Producto',   emoji: '📦' },
  grooming:     { label: 'Estética',   emoji: '✂️' },
  other:        { label: 'Otro',       emoji: '💰' },
};

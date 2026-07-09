import type { SyncMeta } from './patient';

export type PaymentMethod  = 'efectivo' | 'tarjeta' | 'transferencia' | 'cheque' | 'mixto' | 'otro';
export type PaymentStatus  = 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
export type IncomeType = 'consulta' | 'vacunacion' | 'cirugia' | 'producto' | 'estetica' | 'otro';

export interface Payment {
  id: string;
  pacienteId: string;
  clinicaId: string;

  /** ISO date string "YYYY-MM-DD" */
  fecha: string;

  concepto:   string;
  tipo:       IncomeType;
  monto:      number;
  metodoPago: PaymentMethod;
  estado:     PaymentStatus;

  /** Referencia opcional a una consulta */
  consultaId?: string;
  /** Referencia opcional a una cita */
  citaId?: string;

  notas?: string;
  creadoEn: number;
}

export interface PaymentLocal extends Payment, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE UI
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; emoji: string }> = {
  efectivo:     { label: 'Efectivo',      emoji: '💵' },
  tarjeta:      { label: 'Tarjeta',       emoji: '💳' },
  transferencia:{ label: 'Transferencia', emoji: '🏦' },
  cheque:       { label: 'Cheque',        emoji: '📝' },
  mixto:        { label: 'Mixto',         emoji: '🔄' },
  otro:         { label: 'Otro',          emoji: '💰' },
};

export const PAYMENT_STATUSES: Record<PaymentStatus, { label: string; color: string; punto: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',   punto: 'bg-amber-400' },
  pagado:      { label: 'Pagado',      color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',   punto: 'bg-green-500' },
  cancelado:   { label: 'Cancelado',   color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',               punto: 'bg-red-400' },
  reembolsado: { label: 'Reembolsado', color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800', punto: 'bg-purple-500' },
};

export const INCOME_TYPES: Record<IncomeType, { label: string; emoji: string }> = {
  consulta:   { label: 'Consultation',   emoji: '🩺' },
  vacunacion: { label: 'Vacunación', emoji: '💉' },
  cirugia:    { label: 'Cirugía',    emoji: '🔬' },
  producto:   { label: 'Producto',   emoji: '📦' },
  estetica:   { label: 'Estética',   emoji: '✂️' },
  otro:       { label: 'Otro',       emoji: '💰' },
};

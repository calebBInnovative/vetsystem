import type { SyncMeta } from './patient';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'pagada'
  | 'pendiente'
  | 'parcialmente_pagada'
  | 'cancelada';

export type InvoicePaymentMethod =
  | 'efectivo'
  | 'tarjeta'
  | 'transferencia'
  | 'mixto';

// ─── Items ────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  tipo: 'servicio' | 'producto';
  productoId?: string;
}

// ─── Invoice principal ────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  /** Número legible: FAC-2024-0001 */
  numero: string;
  /** Presente cuando la factura proviene de una consulta */
  consultaId?: string;
  /** Presente cuando la factura proviene de una venta de products */
  ventaId?: string;
  /** Vacío para ventas anónimas sin paciente */
  pacienteId?: string;
  duenoId?: string;
  clinicaId: string;
  /** ISO date "YYYY-MM-DD" */
  fecha: string;
  items: InvoiceItem[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: InvoicePaymentMethod;
  estado: InvoiceStatus;
  /** Monto ya cobrado (relevante para parcialmente_pagada) */
  montoPagado: number;
  notas?: string;
  /** ID del PaymentLocal generado al registrar cobro */
  pagoId?: string;
  creadoEn: number;
}

export interface InvoiceLocal extends Invoice, SyncMeta {}

/** Invoice con datos del paciente y dueño unidos — para listas y vistas */
export interface InvoiceWithDetails extends InvoiceLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
  razaPaciente?: string;
  nombreDueno?: string;
  telefonoDueno?: string;
}

// ─── Constantes de UI ─────────────────────────────────────────────────────────

export const INVOICE_STATUSES: Record<InvoiceStatus, { label: string; color: string; punto: string }> = {
  pagada: {
    label: 'Pagada',
    color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',
    punto: 'bg-green-500',
  },
  pendiente: {
    label: 'Pendiente',
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',
    punto: 'bg-amber-400',
  },
  parcialmente_pagada: {
    label: 'Parcial',
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',
    punto: 'bg-blue-500',
  },
  cancelada: {
    label: 'Cancelada',
    color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',
    punto: 'bg-red-400',
  },
};

export const INVOICE_PAYMENT_METHODS: Record<InvoicePaymentMethod, { label: string; emoji: string }> = {
  efectivo:     { label: 'Efectivo',      emoji: '💵' },
  tarjeta:      { label: 'Tarjeta',       emoji: '💳' },
  transferencia:{ label: 'Transferencia', emoji: '🏦' },
  mixto:        { label: 'Mixto',         emoji: '🔄' },
};

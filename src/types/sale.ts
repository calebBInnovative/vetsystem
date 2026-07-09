import type { SyncMeta } from './patient';

export type SalePaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
export type SaleStatus     = 'completada' | 'cancelada';

export interface SaleItem {
  id: string;
  productoId: string;
  descripcion: string;
  cantidad: number;
  unidad?: string;
  precioUnitario: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  clinicaId: string;
  /** ISO date "YYYY-MM-DD" */
  fecha: string;
  items: SaleItem[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: SalePaymentMethod;
  estado: SaleStatus;
  /** Cliente opcional — puede ser una venta anónima */
  pacienteId?: string;
  notas?: string;
  /** ID del PaymentLocal generado */
  pagoId?: string;
  /** ID de la InvoiceLocal generada */
  facturaId?: string;
  creadoEn: number;
}

export interface SaleLocal extends Sale, SyncMeta {}

export const SALE_PAYMENT_METHODS: Record<SalePaymentMethod, { label: string; emoji: string }> = {
  efectivo:     { label: 'Efectivo',      emoji: '💵' },
  tarjeta:      { label: 'Tarjeta',       emoji: '💳' },
  transferencia:{ label: 'Transferencia', emoji: '🏦' },
  mixto:        { label: 'Mixto',         emoji: '🔄' },
};

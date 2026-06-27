import type { SyncMeta } from './paciente';

export type MetodoPagoVenta = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
export type EstadoVenta     = 'completada' | 'cancelada';

export interface VentaItem {
  id: string;
  productoId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Venta {
  id: string;
  clinicaId: string;
  /** ISO date "YYYY-MM-DD" */
  fecha: string;
  items: VentaItem[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPagoVenta;
  estado: EstadoVenta;
  /** Cliente opcional — puede ser una venta anónima */
  pacienteId?: string;
  notas?: string;
  /** ID del PagoLocal generado */
  pagoId?: string;
  /** ID de la FacturaLocal generada */
  facturaId?: string;
  creadoEn: number;
}

export interface VentaLocal extends Venta, SyncMeta {}

export const METODOS_PAGO_VENTA: Record<MetodoPagoVenta, { label: string; emoji: string }> = {
  efectivo:     { label: 'Efectivo',      emoji: '💵' },
  tarjeta:      { label: 'Tarjeta',       emoji: '💳' },
  transferencia:{ label: 'Transferencia', emoji: '🏦' },
  mixto:        { label: 'Mixto',         emoji: '🔄' },
};

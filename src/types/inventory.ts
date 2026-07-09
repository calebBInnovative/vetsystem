// ─────────────────────────────────────────────────────────────────────────────
// TIPOS BASE — Módulo Inventario
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './patient';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type ProductCategory =
  | 'medicamento'
  | 'vacuna'
  | 'antiparasitario'
  | 'alimento'
  | 'accesorio'
  | 'higiene'
  | 'cirugia'
  | 'laboratorio'
  | 'otro';

export type MeasurementUnit =
  | 'unidad'
  | 'caja'
  | 'frasco'
  | 'ampolla'
  | 'tableta'
  | 'dosis'
  | 'ml'
  | 'mg'
  | 'kg'
  | 'gramo'
  | 'litro'
  | 'libra';

/** Units where fractional amounts are common (e.g. 250 ml, 1.5 kg) */
export const FRACTIONAL_UNITS = new Set<MeasurementUnit>(['ml', 'litro', 'gramo', 'kg', 'libra', 'mg']);

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTO
// ─────────────────────────────────────────────────────────────────────────────

export interface Producto {
  id: string;
  nombre: string;
  categoria: ProductCategory;
  descripcion?: string;

  /** Stock actual en unidades */
  stockActual: number;
  /** Nivel mínimo — si stockActual <= stockMinimo se genera alerta */
  stockMinimo: number;
  unidad: MeasurementUnit;

  /** Precio de venta al público */
  precioVenta?: number;
  /** Precio de costo (para margen) */
  precioCosto?: number;

  /** Fecha de vencimiento del lote activo "YYYY-MM-DD" */
  fechaVencimiento?: string;
  /** Número de lote para trazabilidad */
  lote?: string;

  /** Proveedor o laboratorio */
  proveedor?: string;

  activo: boolean;
  clinicaId: string;
  creadoEn: number;
}

export interface ProductLocal extends Producto, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// MOVIMIENTO DE STOCK
// Registro de cada entrada/salida para historial de movements.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementType = 'entrada' | 'salida' | 'ajuste';

export interface StockMovement {
  id: string;
  productoId: string;
  clinicaId: string;
  tipo: MovementType;
  cantidad: number;          // positivo = suma, negativo = resta
  stockAntes: number;
  stockDespues: number;
  motivo?: string;
  /** Referencia a una consulta o cita donde se usó el producto */
  referenciaId?: string;
  creadoEn: number;
}

export interface StockMovementLocal extends StockMovement, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE UI
// ─────────────────────────────────────────────────────────────────────────────

export const PRODUCT_CATEGORIES: Record<ProductCategory, { label: string; emoji: string; color: string }> = {
  medicamento:     { label: 'Medicamento',     emoji: '💊', color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40' },
  vacuna:          { label: 'Vacuna',          emoji: '💉', color: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40' },
  antiparasitario: { label: 'Antiparasitario', emoji: '🐛', color: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40' },
  alimento:        { label: 'Alimento',        emoji: '🥣', color: 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/40' },
  accesorio:       { label: 'Accesorio',       emoji: '🦮', color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40' },
  higiene:         { label: 'Higiene',         emoji: '🧴', color: 'text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-950/40' },
  cirugia:         { label: 'Cirugía',         emoji: '🔬', color: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40' },
  laboratorio:     { label: 'Laboratorio',     emoji: '🧪', color: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/40' },
  otro:            { label: 'Otro',            emoji: '📦', color: 'text-muted-foreground bg-muted' },
};

export const MEASUREMENT_UNITS: Record<MeasurementUnit, string> = {
  unidad:   'Unidad',
  caja:     'Caja',
  frasco:   'Frasco',
  ampolla:  'Ampolla',
  tableta:  'Tableta',
  dosis:    'Dosis',
  ml:       'mL',
  mg:       'mg',
  kg:       'kg',
  gramo:    'g',
  litro:    'L',
  libra:    'lb',
};

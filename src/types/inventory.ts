// ─────────────────────────────────────────────────────────────────────────────
// BASE TYPES — Inventory Module
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './patient';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type ProductCategory =
  | 'medication'
  | 'vaccine'
  | 'antiparasitic'
  | 'food'
  | 'accessory'
  | 'hygiene'
  | 'surgery'
  | 'laboratory'
  | 'other';

export type MeasurementUnit =
  | 'unit'
  | 'box'
  | 'bottle'
  | 'ampoule'
  | 'tablet'
  | 'dose'
  | 'ml'
  | 'mg'
  | 'kg'
  | 'gram'
  | 'liter'
  | 'pound';

/** Units where fractional amounts are common (e.g. 250 ml, 1.5 kg) */
export const FRACTIONAL_UNITS = new Set<MeasurementUnit>(['ml', 'liter', 'gram', 'kg', 'pound', 'mg']);

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  description?: string;

  /** Current stock in units */
  currentStock: number;
  /** Minimum level — if currentStock <= minimumStock an alert is generated */
  minimumStock: number;
  unit: MeasurementUnit;

  /** Public sale price */
  salePrice?: number;
  /** Cost price (for margin calculation) */
  costPrice?: number;

  /** Expiration date of the active batch "YYYY-MM-DD" */
  expirationDate?: string;
  /** Batch number for traceability */
  batch?: string;

  /** Supplier or laboratory */
  supplier?: string;

  active: boolean;
  clinicId: string;
  createdAt: number;
}

export interface ProductLocal extends Product, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK MOVEMENT
// Record of each stock entry/exit for movement history.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementType = 'entry' | 'exit' | 'adjustment';

export interface StockMovement {
  id: string;
  productId: string;
  clinicId: string;
  type: MovementType;
  quantity: number;          // positive = add, negative = subtract
  stockBefore: number;
  stockAfter: number;
  reason?: string;
  /** Reference to a consultation or appointment where the product was used */
  referenceId?: string;
  createdAt: number;
}

export interface StockMovementLocal extends StockMovement, SyncMeta {}

// ─────────────────────────────────────────────────────────────────────────────
// UI CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const PRODUCT_CATEGORIES: Record<ProductCategory, { label: string; emoji: string; color: string }> = {
  medication:     { label: 'Medication',     emoji: '💊', color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40' },
  vaccine:        { label: 'Vaccine',        emoji: '💉', color: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40' },
  antiparasitic:  { label: 'Antiparasitic',  emoji: '🐛', color: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40' },
  food:           { label: 'Food',           emoji: '🥣', color: 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/40' },
  accessory:      { label: 'Accessory',      emoji: '🦮', color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40' },
  hygiene:        { label: 'Hygiene',        emoji: '🧴', color: 'text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-950/40' },
  surgery:        { label: 'Surgery',        emoji: '🔬', color: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40' },
  laboratory:     { label: 'Laboratory',     emoji: '🧪', color: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/40' },
  other:          { label: 'Other',          emoji: '📦', color: 'text-muted-foreground bg-muted' },
};

export const MEASUREMENT_UNITS: Record<MeasurementUnit, string> = {
  unit:    'Unit',
  box:     'Box',
  bottle:  'Bottle',
  ampoule: 'Ampoule',
  tablet:  'Tablet',
  dose:    'Dose',
  ml:      'mL',
  mg:      'mg',
  kg:      'kg',
  gram:    'g',
  liter:   'L',
  pound:   'lb',
};

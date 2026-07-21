import type { SyncMeta } from './patient';

export type DiscountType = 'none' | 'percentage' | 'fixed' | 'free';

export interface PromotionItem {
  id: string;
  type: 'product' | 'service';
  /** productId or serviceId depending on type */
  refId: string;
  /** Name snapshot at creation time */
  name: string;
  unit?: string;
  quantity: number;
  /** Unit price snapshot at creation time */
  originalPrice: number;
  discountType: DiscountType;
  /** Percent (0–100) for 'percentage', amount for 'fixed', ignored for 'none'/'free' */
  discountValue: number;
  /** originalPrice with discount applied */
  finalUnitPrice: number;
}

export interface Promotion {
  id: string;
  clinicId: string;
  name: string;
  description?: string;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  items: PromotionItem[];
  originalTotal: number;
  total: number;
  createdAt: number;
}

export interface PromotionLocal extends Promotion, SyncMeta {}

/** Compute the final unit price for a PromotionItem given discount params. */
export function applyDiscount(
  originalPrice: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  switch (discountType) {
    case 'free':       return 0;
    case 'percentage': return Math.max(0, originalPrice * (1 - discountValue / 100));
    case 'fixed':      return Math.max(0, originalPrice - discountValue);
    default:           return originalPrice;
  }
}

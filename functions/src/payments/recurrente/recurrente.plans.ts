import type { RecurrenteCurrency } from './recurrente.types';

export interface Plan {
  id: string;
  /** Shown on the Recurrente hosted checkout. */
  name: string;
  /** Integer cents. The only source of truth for what a buyer is charged. */
  amountInCents: number;
  /**
   * Recurrente only accepts GTQ and USD. The app is used in Nicaragua, where
   * córdobas are not supported by the gateway, so plans are priced in USD.
   */
  currency: RecurrenteCurrency;
  /** Days added to the clinic license when the payment is confirmed. */
  durationDays: number;
  /** Value written to clinics/{clinicId}/license/data.plan. */
  licensePlan: string;
}

/**
 * Server-side price list. The client sends only a plan id — never an amount —
 * so the price cannot be tampered with from the browser. Changing a price is a
 * code change that goes through review and a functions deploy.
 */
export const PLANS: Readonly<Record<string, Plan>> = {
  monthly: {
    id:            'monthly',
    name:          'VetSystem Pro - Plan Mensual',
    amountInCents: 3000,
    currency:      'USD',
    durationDays:  30,
    licensePlan:   'monthly',
  },
};

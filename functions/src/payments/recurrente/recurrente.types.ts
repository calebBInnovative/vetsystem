// ─── Recurrente API shapes ────────────────────────────────────────────────────
// Only fields documented at https://docs.recurrente.com are declared here.
// Anything else in a response is ignored on purpose.

/** Currencies accepted by POST /checkouts (inline items). */
export type RecurrenteCurrency = 'GTQ' | 'USD';

/** Minimum checkout total per currency, in cents (documented in POST /checkouts). */
export const RECURRENTE_MIN_TOTAL_CENTS: Record<RecurrenteCurrency, number> = {
  GTQ: 500,
  USD: 100,
};

export interface RecurrenteInlineItem {
  name: string;
  amount_in_cents: number;
  currency: RecurrenteCurrency;
  quantity: number;
  charge_type: 'one_time';
}

export interface RecurrenteCreateCheckoutRequest {
  items: RecurrenteInlineItem[];
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  expires_at?: string;
}

/** Documented checkout statuses (GET /checkouts/{id}). */
export type RecurrenteCheckoutStatus = 'unpaid' | 'paid' | 'payment_in_progress' | 'expired';

export interface RecurrenteCheckout {
  id: string;
  status: RecurrenteCheckoutStatus;
  checkout_url?: string;
  total_in_cents?: number;
  currency?: RecurrenteCurrency;
  live_mode?: boolean;
  metadata?: Record<string, unknown>;
  latest_intent?: { id?: string } | null;
}

/** GET /test response. */
export interface RecurrenteCredentialsCheck {
  message: string;
  account_id: string;
  environment: 'live' | 'sandbox';
  sandbox_id: string | null;
}

/** Unified webhook events (intent.*). Legacy per-type events are ignored. */
export type RecurrenteIntentEventType =
  | 'intent.succeeded'
  | 'intent.pending'
  | 'intent.failed'
  | 'intent.canceled'
  | 'intent.paid';

export interface RecurrenteIntentEvent {
  event_type: string;
  type: string;
  id: string;
  status: string;
  raw_status?: string;
  amount_in_cents?: number;
  currency?: string;
  created_at?: string;
  checkout?: {
    id: string;
    status?: string;
    live_mode?: boolean;
    metadata?: Record<string, unknown>;
  } | null;
}

// ─── Internal payment model ───────────────────────────────────────────────────

export type PaymentMode = 'mock' | 'live';

export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled';

export interface PaymentRecord {
  id: string;
  provider: 'recurrente';
  mode: PaymentMode;
  userId: string;
  clinicId: string;
  planId: string;
  description: string;
  /** Frozen at checkout time, like the amount, so a later catalog change cannot alter a paid order. */
  durationDays: number;
  licensePlan: string;
  /** Integer cents — never a float. */
  amountInCents: number;
  currency: RecurrenteCurrency;
  status: PaymentStatus;
  providerCheckoutId: string | null;
  providerIntentId: string | null;
  checkoutUrl: string | null;
  /** Last error code from the provider, never a raw response body. */
  lastError: string | null;
  /** Set when the provider reports a total/currency/environment that does not match this record. */
  reviewRequired: boolean;
  /** Set once the purchased plan was applied. Guards against double fulfillment. */
  fulfilledAt: number | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
}

/** Processed webhook deliveries, keyed by svix-id. */
export interface WebhookEventRecord {
  id: string;
  mode: PaymentMode;
  eventType: string;
  paymentId: string | null;
  outcome: string;
  receivedAt: number;
}

/** Prevents two concurrent checkouts for the same clinic + plan. */
export interface CheckoutLock {
  paymentId: string;
  expiresAt: number;
}

/**
 * Set by the platform owner to ask a clinic to pay from a given moment on,
 * independently of the expiration date. Cleared by a confirmed payment.
 */
export interface BillingNotice {
  /** ms timestamp from which the clinic sees the notice */
  at: number;
  /** true = the app locks until the clinic pays; false = dismissible banner */
  blocking: boolean;
}

export interface LicenseData {
  plan?: string;
  expirationDate?: string;
  subscription?: boolean;
  billingNotice?: BillingNotice | null;
  /** ms timestamp of the last confirmed payment; cached offline by the app */
  lastPaymentAt?: number;
  /**
   * Plan limits copied at payment time (functions/src/billing/plans.ts). null
   * clears them, so the defaults of `plan` apply.
   */
  limits?: null;
}

export interface UserProfile {
  clinicId: string;
  role: string;
}

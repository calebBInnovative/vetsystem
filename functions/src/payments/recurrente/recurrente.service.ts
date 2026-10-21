import type { PaymentProvider } from './recurrente.client';
import { RecurrenteError } from './recurrente.errors';
import type { PaymentRepository, PaymentTransaction } from './payment.repository';
import type { Plan } from './recurrente.plans';
import {
  RECURRENTE_MIN_TOTAL_CENTS,
  type LicenseData,
  type PaymentMode,
  type PaymentRecord,
  type PaymentStatus,
  type RecurrenteCheckout,
  type RecurrenteIntentEvent,
} from './recurrente.types';

/** Error codes match Firebase HttpsError codes so the functions layer maps them 1:1. */
export type PaymentErrorCode =
  | 'invalid-argument'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'failed-precondition'
  | 'unavailable'
  | 'internal';

export class PaymentError extends Error {
  constructor(readonly code: PaymentErrorCode, message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export interface PaymentServiceDeps {
  repository: PaymentRepository;
  /** Lazy so mock mode never builds (or needs credentials for) the live client. */
  getProvider: () => PaymentProvider;
  plans: Readonly<Record<string, Plan>>;
  allowedReturnOrigins: string[];
  now?: () => number;
  logger?: Logger;
}

export interface CreateCheckoutInput {
  uid: string;
  planId: unknown;
  returnOrigin: unknown;
}

export interface CreateCheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  mode: PaymentMode;
  status: PaymentStatus;
  reused: boolean;
}

export interface PaymentStatusView {
  paymentId: string;
  mode: PaymentMode;
  status: PaymentStatus;
  planId: string;
  amountInCents: number;
  currency: string;
  checkoutUrl: string | null;
  reviewRequired: boolean;
  createdAt: number;
  paidAt: number | null;
}

export type WebhookOutcome =
  | 'duplicate'
  | 'ignored'
  | 'unmatched'
  | 'checkout_mismatch'
  | 'paid'
  | 'already_paid'
  | 'not_confirmed'
  | 'review_required'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'stale';

/** A checkout stays reusable this long; after that a fresh one is created. */
export const CHECKOUT_LOCK_TTL_MS = 30 * 60_000;
/** A record stuck in 'created' longer than this is treated as abandoned. */
export const CREATING_GRACE_MS = 60_000;

const MANAGER_ROLES = new Set(['master', 'admin']);
const HANDLED_EVENTS = new Set(['intent.succeeded', 'intent.pending', 'intent.failed', 'intent.canceled']);

export class PaymentService {
  readonly mode: PaymentMode;
  readonly #repo: PaymentRepository;
  readonly #getProvider: () => PaymentProvider;
  readonly #plans: Readonly<Record<string, Plan>>;
  readonly #origins: Set<string>;
  readonly #now: () => number;
  readonly #log: Logger;

  constructor(deps: PaymentServiceDeps) {
    this.mode         = deps.repository.mode;
    this.#repo        = deps.repository;
    this.#getProvider = deps.getProvider;
    this.#plans       = deps.plans;
    this.#origins     = new Set(deps.allowedReturnOrigins);
    this.#now         = deps.now ?? Date.now;
    this.#log         = deps.logger ?? silentLogger;
  }

  // ─── Checkout ──────────────────────────────────────────────────────────────

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const user = await this.#repo.getUser(input.uid);
    if (!user) throw new PaymentError('permission-denied', 'User profile not found.');
    if (user.clinicId === 'demo') throw new PaymentError('failed-precondition', 'Demo clinics cannot pay.');

    const plan = this.#resolvePlan(input.planId);
    const origin = this.#resolveOrigin(input.returnOrigin);

    const now = this.#now();
    const lockKey = `${user.clinicId}_${plan.id}_${input.uid}`;
    const paymentId = this.#repo.newPaymentId();

    // Reserve the checkout atomically: a double click or a retried request gets
    // the checkout already in flight instead of a second one.
    const reservation = await this.#repo.runTransaction(async (tx) => {
      const lock = await tx.getLock(lockKey);
      const previous = lock && lock.expiresAt > now ? await tx.getPayment(lock.paymentId) : null;

      if (previous?.status === 'pending' && previous.checkoutUrl) {
        return { reused: previous };
      }
      if (previous?.status === 'created' && now - previous.createdAt < CREATING_GRACE_MS) {
        throw new PaymentError('already-exists', 'A checkout is already being created. Try again in a moment.');
      }

      tx.createPayment({
        id:                 paymentId,
        provider:           'recurrente',
        mode:               this.mode,
        userId:             input.uid,
        clinicId:           user.clinicId,
        planId:             plan.id,
        description:        plan.name,
        durationDays:       plan.durationDays,
        licensePlan:        plan.licensePlan,
        amountInCents:      plan.amountInCents,
        currency:           plan.currency,
        status:             'created',
        providerCheckoutId: null,
        providerIntentId:   null,
        checkoutUrl:        null,
        lastError:          null,
        reviewRequired:     false,
        fulfilledAt:        null,
        createdAt:          now,
        updatedAt:          now,
        paidAt:             null,
      });
      tx.setLock(lockKey, { paymentId, expiresAt: now + CHECKOUT_LOCK_TTL_MS });
      return { reused: null };
    });

    if (reservation.reused) {
      return {
        paymentId:   reservation.reused.id,
        checkoutUrl: reservation.reused.checkoutUrl!,
        mode:        this.mode,
        status:      reservation.reused.status,
        reused:      true,
      };
    }

    let checkout: RecurrenteCheckout;
    try {
      const provider = this.#provider();
      checkout = await provider.createCheckout({
        items: [{
          name:            plan.name,
          amount_in_cents: plan.amountInCents,
          currency:        plan.currency,
          quantity:        1,
          charge_type:     'one_time',
        }],
        success_url: `${origin}/dashboard/?suscripcion=ok&pago=${paymentId}`,
        cancel_url:  `${origin}/dashboard/?suscripcion=cancelada&pago=${paymentId}`,
        // The webhook maps an event back to this record through paymentId.
        metadata: { paymentId, clinicId: user.clinicId, uid: input.uid, mode: this.mode },
      });
      if (!checkout.id || !checkout.checkout_url) {
        throw new RecurrenteError('invalid_response', 'Checkout response is missing id or checkout_url.');
      }
    } catch (err) {
      const code = err instanceof RecurrenteError ? err.code : 'internal';
      this.#log.error('[payments] checkout creation failed', { paymentId, mode: this.mode, code });
      await this.#repo
        .updatePayment(paymentId, { status: 'failed', lastError: code, updatedAt: this.#now() })
        .catch((writeErr: unknown) => this.#log.error('[payments] could not mark payment failed', {
          paymentId, error: String(writeErr),
        }));
      throw toPaymentError(err);
    }

    await this.#repo.updatePayment(paymentId, {
      status:             'pending',
      providerCheckoutId: checkout.id,
      checkoutUrl:        checkout.checkout_url,
      updatedAt:          this.#now(),
    });
    this.#log.info('[payments] checkout created', { paymentId, mode: this.mode, clinicId: user.clinicId });

    return { paymentId, checkoutUrl: checkout.checkout_url, mode: this.mode, status: 'pending', reused: false };
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  /**
   * Returns a payment the caller may see: their own, or any payment of their
   * clinic when they are master/admin. Anything else answers not-found so a
   * caller cannot probe which ids exist.
   *
   * With `refresh`, a pending payment is reconciled against the provider —
   * covers a webhook that is late or never arrives.
   */
  async getPaymentStatus(uid: string, paymentId: unknown, refresh = false): Promise<PaymentStatusView> {
    if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
      throw new PaymentError('invalid-argument', 'paymentId is invalid.');
    }
    const user = await this.#repo.getUser(uid);
    let payment = await this.#repo.getPayment(paymentId);

    const allowed = !!user && !!payment && (
      payment.userId === uid ||
      (payment.clinicId === user.clinicId && MANAGER_ROLES.has(user.role))
    );
    if (!allowed || !payment) throw new PaymentError('not-found', 'Payment not found.');

    if (refresh && payment.providerCheckoutId && (payment.status === 'pending' || payment.status === 'created')) {
      try {
        const checkout = await this.#provider().retrieveCheckout(payment.providerCheckoutId);
        if (checkout.status === 'paid') {
          await this.#repo.runTransaction((tx) => this.#confirmPaid(tx, paymentId, checkout, null));
          payment = (await this.#repo.getPayment(paymentId)) ?? payment;
        }
      } catch (err) {
        // A failed refresh is not fatal: the stored status is still correct as of the last event.
        this.#log.warn('[payments] status refresh failed', { paymentId, error: errorCode(err) });
      }
    }

    return {
      paymentId:      payment.id,
      mode:           payment.mode,
      status:         payment.status,
      planId:         payment.planId,
      amountInCents:  payment.amountInCents,
      currency:       payment.currency,
      checkoutUrl:    payment.status === 'pending' ? payment.checkoutUrl : null,
      reviewRequired: payment.reviewRequired,
      createdAt:      payment.createdAt,
      paidAt:         payment.paidAt,
    };
  }

  // ─── Webhook events ────────────────────────────────────────────────────────

  /**
   * Applies a verified webhook event. Idempotent: the delivery id is recorded
   * in the same transaction as the payment change, so a redelivery is a no-op.
   * Throws only for transient failures — the caller answers 5xx and Recurrente retries.
   */
  async processWebhookEvent(eventId: string, event: RecurrenteIntentEvent): Promise<WebhookOutcome> {
    const eventType = event.event_type;
    const paymentId = typeof event.checkout?.metadata?.paymentId === 'string' ? event.checkout.metadata.paymentId : null;
    const checkoutId = event.checkout?.id ?? null;

    if (!HANDLED_EVENTS.has(eventType) || !paymentId || !checkoutId) {
      const outcome: WebhookOutcome = HANDLED_EVENTS.has(eventType) ? 'unmatched' : 'ignored';
      return this.#recordOnly(eventId, eventType, paymentId, outcome);
    }

    // Never trust the event body for a payment: ask the provider. This call is
    // outside the transaction because a transaction may re-run on contention.
    let checkout: RecurrenteCheckout | null = null;
    if (eventType === 'intent.succeeded') {
      try {
        checkout = await this.#provider().retrieveCheckout(checkoutId);
      } catch (err) {
        if (err instanceof RecurrenteError && err.code === 'not_found') {
          this.#log.warn('[payments] webhook checkout not found at provider', { paymentId, checkoutId });
          return this.#recordOnly(eventId, eventType, paymentId, 'not_confirmed');
        }
        throw err;
      }
    }

    const outcome = await this.#repo.runTransaction(async (tx): Promise<WebhookOutcome> => {
      if (await tx.getWebhookEvent(eventId)) return 'duplicate';

      const payment = await tx.getPayment(paymentId);
      let result: WebhookOutcome;

      if (!payment) {
        result = 'unmatched';
      } else if (payment.providerCheckoutId && payment.providerCheckoutId !== checkoutId) {
        result = 'checkout_mismatch';
      } else if (eventType === 'intent.succeeded') {
        result = await this.#confirmPaid(tx, paymentId, checkout!, event.id, payment);
      } else {
        result = this.#applyNonPaidEvent(tx, payment, eventType, checkoutId);
      }

      tx.createWebhookEvent({
        id: eventId, mode: this.mode, eventType, paymentId, outcome: result, receivedAt: this.#now(),
      });
      return result;
    });

    this.#log.info('[payments] webhook processed', { eventId, eventType, paymentId, mode: this.mode, outcome });
    return outcome;
  }

  /**
   * Marks a payment paid only when the provider's own checkout says so and
   * matches what was sold. Fulfills (extends the license) exactly once, and
   * only in live mode.
   */
  async #confirmPaid(
    tx: PaymentTransaction,
    paymentId: string,
    checkout: RecurrenteCheckout,
    intentId: string | null,
    knownPayment?: PaymentRecord,
  ): Promise<WebhookOutcome> {
    const payment = knownPayment ?? await tx.getPayment(paymentId);
    if (!payment) return 'unmatched';
    if (payment.status === 'paid') return 'already_paid';
    if (checkout.status !== 'paid') return 'not_confirmed';

    const now = this.#now();
    const matches =
      checkout.metadata?.paymentId === payment.id &&
      checkout.total_in_cents === payment.amountInCents &&
      checkout.currency === payment.currency &&
      (payment.mode === 'mock' ? checkout.live_mode === false : true);

    if (!matches) {
      this.#log.error('[payments] provider checkout does not match payment — flagged for review', {
        paymentId, checkoutId: checkout.id,
      });
      tx.updatePayment(paymentId, { reviewRequired: true, updatedAt: now });
      return 'review_required';
    }

    // Reads must precede writes inside a transaction.
    let license: LicenseData | null = null;
    const fulfill = this.mode === 'live' && payment.mode === 'live' && payment.fulfilledAt === null;
    if (fulfill) license = await tx.getLicense(payment.clinicId);

    tx.updatePayment(paymentId, {
      status:             'paid',
      paidAt:             now,
      providerCheckoutId: checkout.id,
      providerIntentId:   intentId ?? checkout.latest_intent?.id ?? null,
      lastError:          null,
      updatedAt:          now,
      ...(fulfill ? { fulfilledAt: now } : {}),
    });

    if (fulfill) {
      // A clinic asked to pay (billing notice) starts its paid period today: the
      // days left on the free license it had before billing are not carried over.
      const carriedExpiration = license?.billingNotice ? undefined : license?.expirationDate;
      tx.setLicense(payment.clinicId, {
        subscription:   true,
        plan:           payment.licensePlan,
        expirationDate: extendExpiration(carriedExpiration, payment.durationDays, now),
        billingNotice:  null,
      });
    }
    return 'paid';
  }

  #applyNonPaidEvent(
    tx: PaymentTransaction,
    payment: PaymentRecord,
    eventType: string,
    checkoutId: string,
  ): WebhookOutcome {
    // A late pending/failed/cancelled event must never undo a confirmed payment.
    if (payment.status === 'paid') return 'stale';

    const next: Record<string, { status: PaymentStatus; outcome: WebhookOutcome; lastError: string | null }> = {
      'intent.pending':  { status: 'pending',   outcome: 'pending',   lastError: null },
      'intent.failed':   { status: 'failed',    outcome: 'failed',    lastError: 'declined' },
      'intent.canceled': { status: 'cancelled', outcome: 'cancelled', lastError: null },
    };
    const change = next[eventType];

    tx.updatePayment(payment.id, {
      status:             change.status,
      lastError:          change.lastError,
      providerCheckoutId: checkoutId,
      updatedAt:          this.#now(),
    });
    return change.outcome;
  }

  async #recordOnly(
    eventId: string,
    eventType: string,
    paymentId: string | null,
    outcome: WebhookOutcome,
  ): Promise<WebhookOutcome> {
    return this.#repo.runTransaction(async (tx) => {
      if (await tx.getWebhookEvent(eventId)) return 'duplicate';
      tx.createWebhookEvent({ id: eventId, mode: this.mode, eventType, paymentId, outcome, receivedAt: this.#now() });
      return outcome;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  #provider(): PaymentProvider {
    const provider = this.#getProvider();
    if (provider.mode !== this.mode) {
      // Structural isolation: a mock repository must never be paired with the live API, or vice versa.
      throw new PaymentError('internal', `Provider mode ${provider.mode} does not match repository mode ${this.mode}.`);
    }
    return provider;
  }

  #resolvePlan(planId: unknown): Plan {
    const plan = typeof planId === 'string' && Object.hasOwn(this.#plans, planId) ? this.#plans[planId] : null;
    if (!plan) throw new PaymentError('invalid-argument', 'Unknown plan.');

    const validAmount = Number.isInteger(plan.amountInCents) &&
      plan.amountInCents >= RECURRENTE_MIN_TOTAL_CENTS[plan.currency];
    if (!validAmount) {
      // A misconfigured catalog is a server bug, not a client error.
      throw new PaymentError('internal', `Plan ${plan.id} has an invalid amount.`);
    }
    return plan;
  }

  #resolveOrigin(value: unknown): string {
    let origin: string;
    try {
      origin = new URL(String(value)).origin;
    } catch {
      throw new PaymentError('invalid-argument', 'returnOrigin is invalid.');
    }
    if (!this.#origins.has(origin)) throw new PaymentError('invalid-argument', 'returnOrigin is not allowed.');
    if (this.mode === 'live' && !origin.startsWith('https://')) {
      throw new PaymentError('invalid-argument', 'Live payments require an https return origin.');
    }
    return origin;
  }
}

/** Adds `days` to whichever is later: today or the current expiration (YYYY-MM-DD, UTC). */
export function extendExpiration(current: string | undefined, days: number, now: number): string {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  let base = today;
  if (current && /^\d{4}-\d{2}-\d{2}$/.test(current)) {
    const parsed = new Date(`${current}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed > today) base = parsed;
  }
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function toPaymentError(err: unknown): PaymentError {
  if (err instanceof PaymentError) return err;
  if (err instanceof RecurrenteError) {
    if (err.retryable) return new PaymentError('unavailable', 'The payment gateway is unavailable. Try again.');
    if (err.code === 'missing_credentials' || err.code === 'unauthorized') {
      return new PaymentError('failed-precondition', 'Payments are not configured.');
    }
  }
  return new PaymentError('internal', 'Could not create the payment session.');
}

function errorCode(err: unknown): string {
  if (err instanceof RecurrenteError || err instanceof PaymentError) return err.code;
  return err instanceof Error ? err.name : 'unknown';
}

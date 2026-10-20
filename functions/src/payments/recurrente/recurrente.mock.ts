import { randomBytes } from 'node:crypto';
import { Webhook } from 'svix';
import type { PaymentProvider } from './recurrente.client';
import { RecurrenteError } from './recurrente.errors';
import {
  RECURRENTE_MIN_TOTAL_CENTS,
  type RecurrenteCheckout,
  type RecurrenteCheckoutStatus,
  type RecurrenteCreateCheckoutRequest,
  type RecurrenteIntentEvent,
} from './recurrente.types';

/**
 * Signing secret for mock webhooks. Not sensitive: a mock event can only
 * touch mock payment records, which never fulfill anything. A live webhook is
 * verified with a different secret, so a mock signature never passes there.
 */
export const MOCK_WEBHOOK_SIGNING_SECRET = 'whsec_dmV0c3lzdGVtLW1vY2std2ViaG9vay1zaWduaW5nLWtleS0wMDAx';

/** How the mock answers POST /checkouts. */
export type MockCheckoutScenario = 'success' | 'api_error' | 'timeout' | 'unauthorized';

/** What the simulated buyer does on the hosted checkout. */
export type MockPaymentOutcome = 'paid' | 'declined' | 'pending' | 'cancelled';

export const MOCK_CHECKOUT_SCENARIOS: readonly MockCheckoutScenario[] = ['success', 'api_error', 'timeout', 'unauthorized'];
export const MOCK_PAYMENT_OUTCOMES: readonly MockPaymentOutcome[] = ['paid', 'declined', 'pending', 'cancelled'];

/** The mock's own record of checkouts — stands in for Recurrente's database. */
export interface MockGatewayStore {
  get(checkoutId: string): Promise<RecurrenteCheckout | null>;
  put(checkout: RecurrenteCheckout): Promise<void>;
}

export class InMemoryMockGatewayStore implements MockGatewayStore {
  readonly checkouts = new Map<string, RecurrenteCheckout>();
  async get(checkoutId: string) {
    const checkout = this.checkouts.get(checkoutId);
    return checkout ? structuredClone(checkout) : null;
  }
  async put(checkout: RecurrenteCheckout) {
    this.checkouts.set(checkout.id, structuredClone(checkout));
  }
}

export interface MockProviderOptions {
  store: MockGatewayStore;
  scenario?: MockCheckoutScenario;
  /** How long the 'timeout' scenario hangs before failing. */
  timeoutMs?: number;
  idFactory?: () => string;
}

const OUTCOME_TO_CHECKOUT_STATUS: Record<MockPaymentOutcome, RecurrenteCheckoutStatus> = {
  paid:      'paid',
  declined:  'unpaid',              // a declined card leaves the checkout open for another attempt
  pending:   'payment_in_progress',
  cancelled: 'expired',
};

const OUTCOME_TO_EVENT: Record<MockPaymentOutcome, { eventType: string; status: string }> = {
  paid:      { eventType: 'intent.succeeded', status: 'succeeded' },
  declined:  { eventType: 'intent.failed',    status: 'failed' },
  pending:   { eventType: 'intent.pending',   status: 'pending' },
  cancelled: { eventType: 'intent.canceled',  status: 'canceled' },
};

/**
 * Payment provider that behaves like Recurrente but never opens a socket.
 * Validation mirrors the documented API rules so a request the mock accepts
 * is shaped like one the live API accepts.
 */
export class MockRecurrenteProvider implements PaymentProvider {
  readonly mode = 'mock' as const;

  readonly #store: MockGatewayStore;
  readonly #scenario: MockCheckoutScenario;
  readonly #timeoutMs: number;
  readonly #newId: () => string;

  constructor(options: MockProviderOptions) {
    this.#store     = options.store;
    this.#scenario  = options.scenario ?? 'success';
    this.#timeoutMs = options.timeoutMs ?? 2_000;
    this.#newId     = options.idFactory ?? (() => randomBytes(8).toString('hex'));
  }

  async createCheckout(request: RecurrenteCreateCheckoutRequest): Promise<RecurrenteCheckout> {
    switch (this.#scenario) {
      case 'timeout':
        await new Promise((resolve) => setTimeout(resolve, this.#timeoutMs));
        throw new RecurrenteError('timeout', `Mock Recurrente did not answer within ${this.#timeoutMs} ms.`);
      case 'api_error':
        throw new RecurrenteError('server', 'Mock Recurrente internal error.', 500);
      case 'unauthorized':
        throw new RecurrenteError('unauthorized', 'Autenticación Errónea 👀', 401);
      case 'success':
        break;
    }

    validateCheckoutRequest(request);

    const total = request.items.reduce((sum, item) => sum + item.amount_in_cents * item.quantity, 0);
    const id = `mock_ch_${this.#newId()}`;
    // There is no hosted page to visit: send the buyer back to the app, where the
    // payment stays pending until a simulated webhook settles it.
    const returnUrl = new URL(request.success_url);
    returnUrl.searchParams.set('mockCheckout', id);

    const checkout: RecurrenteCheckout = {
      id,
      status:         'unpaid',
      checkout_url:   returnUrl.toString(),
      total_in_cents: total,
      currency:       request.items[0].currency,
      live_mode:      false,
      metadata:       { ...request.metadata },
      latest_intent:  null,
    };
    await this.#store.put(checkout);
    return checkout;
  }

  async retrieveCheckout(checkoutId: string): Promise<RecurrenteCheckout> {
    const checkout = await this.#store.get(checkoutId);
    if (!checkout) throw new RecurrenteError('not_found', 'Checkout no encontrado', 404);
    return checkout;
  }

  /**
   * Simulates the buyer finishing the hosted checkout: updates the mock
   * gateway's state and returns the unified intent event Recurrente would send.
   */
  async settle(checkoutId: string, outcome: MockPaymentOutcome): Promise<RecurrenteIntentEvent> {
    const checkout = await this.retrieveCheckout(checkoutId);
    const intentId = `mock_in_${this.#newId()}`;

    // A paid checkout stays paid, exactly like the real gateway.
    if (checkout.status !== 'paid') {
      checkout.status = OUTCOME_TO_CHECKOUT_STATUS[outcome];
      checkout.latest_intent = { id: intentId };
      await this.#store.put(checkout);
    }

    const { eventType, status } = OUTCOME_TO_EVENT[outcome];
    return {
      event_type:      eventType,
      type:            'payment',
      id:              intentId,
      status,
      raw_status:      status,
      amount_in_cents: checkout.total_in_cents,
      currency:        checkout.currency,
      created_at:      new Date().toISOString(),
      checkout: {
        id:        checkout.id,
        status:    checkout.status,
        live_mode: false,
        metadata:  checkout.metadata,
      },
    };
  }
}

function validateCheckoutRequest(request: RecurrenteCreateCheckoutRequest): void {
  if (!request.items?.length) {
    throw new RecurrenteError('invalid_request', 'Checkout Inválido', 400);
  }
  const currency = request.items[0].currency;
  for (const item of request.items) {
    const validAmount   = Number.isInteger(item.amount_in_cents) && item.amount_in_cents > 0;
    const validQuantity = Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 9;
    if (!validAmount || !validQuantity || item.currency !== currency) {
      throw new RecurrenteError('invalid_request', 'Checkout Inválido', 400);
    }
  }
  const total = request.items.reduce((sum, item) => sum + item.amount_in_cents * item.quantity, 0);
  if (total < RECURRENTE_MIN_TOTAL_CENTS[currency]) {
    throw new RecurrenteError('invalid_request', 'Checkout Inválido', 400);
  }
}

/** Signs a payload the way Recurrente's Svix integration does. */
export function signWebhookPayload(
  payload: string,
  signingSecret: string,
  messageId = `msg_mock_${randomBytes(8).toString('hex')}`,
  timestamp = new Date(),
): Record<string, string> {
  const signature = new Webhook(signingSecret).sign(messageId, timestamp, payload);
  return {
    'svix-id':        messageId,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': signature,
  };
}

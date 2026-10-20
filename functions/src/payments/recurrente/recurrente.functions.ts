import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall, onRequest, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineBoolean, defineSecret, defineString } from 'firebase-functions/params';
import { RecurrenteClient } from './recurrente.client';
import { PaymentConfigError, parseOrigins, resolvePaymentMode } from './recurrente.config';
import {
  MOCK_CHECKOUT_SCENARIOS,
  MOCK_PAYMENT_OUTCOMES,
  MOCK_WEBHOOK_SIGNING_SECRET,
  MockRecurrenteProvider,
  signWebhookPayload,
  type MockCheckoutScenario,
  type MockPaymentOutcome,
} from './recurrente.mock';
import { FirestoreMockGatewayStore, FirestorePaymentRepository } from './payment.repository';
import { PLANS } from './recurrente.plans';
import { PaymentError, PaymentService, type Logger } from './recurrente.service';
import { handleRecurrenteWebhook } from './recurrente.webhook';
import type { PaymentMode } from './recurrente.types';

// ─── Configuration ────────────────────────────────────────────────────────────
// Plain params live in functions/.env.<projectId>; secrets live in Google Secret
// Manager and are injected only into the functions that declare them below.

const PAYMENT_PROVIDER_MODE   = defineString('PAYMENT_PROVIDER_MODE', { default: 'mock' });
const RECURRENTE_LIVE_ENABLED = defineBoolean('RECURRENTE_LIVE_ENABLED', { default: false });
const PAYMENT_RETURN_ORIGINS  = defineString('PAYMENT_RETURN_ORIGINS', {
  default: 'https://vetsystem-b7675.web.app,https://vetsystem-b7675.firebaseapp.com,http://localhost:3000',
});

const RECURRENTE_SECRET_KEY     = defineSecret('RECURRENTE_SECRET_KEY');
const RECURRENTE_WEBHOOK_SECRET = defineSecret('RECURRENTE_WEBHOOK_SECRET');

const log: Logger = {
  info:  (message, context) => logger.info(message, context),
  warn:  (message, context) => logger.warn(message, context),
  error: (message, context) => logger.error(message, context),
};

function currentMode(): PaymentMode {
  return resolvePaymentMode({
    requestedMode: PAYMENT_PROVIDER_MODE.value(),
    liveEnabled:   RECURRENTE_LIVE_ENABLED.value(),
    isEmulator:    process.env.FUNCTIONS_EMULATOR === 'true',
  });
}

function buildService(mode: PaymentMode, mockScenario?: MockCheckoutScenario): PaymentService {
  const db = getFirestore();
  return new PaymentService({
    repository: new FirestorePaymentRepository(db, mode),
    // The secret is read only when the live provider is actually needed —
    // mock mode never touches it.
    getProvider: mode === 'live'
      ? () => new RecurrenteClient({ secretKey: RECURRENTE_SECRET_KEY.value() })
      : () => new MockRecurrenteProvider({ store: new FirestoreMockGatewayStore(db), scenario: mockScenario }),
    plans: PLANS,
    allowedReturnOrigins: parseOrigins(PAYMENT_RETURN_ORIGINS.value()),
    logger: log,
  });
}

function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  return request.auth.uid;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

/** Converts domain errors to HttpsError without leaking internals to the client. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    if (err instanceof PaymentError) throw new HttpsError(err.code, err.message);
    if (err instanceof PaymentConfigError) {
      log.error('[payments] configuration error', { message: err.message });
      throw new HttpsError('failed-precondition', 'Payments are not available.');
    }
    log.error('[payments] unexpected error', { error: (err as Error).name, message: (err as Error).message });
    throw new HttpsError('internal', 'Unexpected payment error.');
  }
}

// ─── createRecurrenteCheckout ─────────────────────────────────────────────────
// Input:  { planId: 'monthly', returnOrigin: window.location.origin, mockScenario? }
// Output: { paymentId, checkoutUrl, mode, status, reused }

export const createRecurrenteCheckout = onCall(
  { cors: true, secrets: [RECURRENTE_SECRET_KEY] },
  (request) => guard(async () => {
    const uid = requireUid(request);
    const data = asRecord(request.data);
    const mode = currentMode();

    let scenario: MockCheckoutScenario | undefined;
    if (data.mockScenario !== undefined) {
      // Rejected rather than ignored in live mode: a request written for testing must never turn into a real charge.
      if (mode !== 'mock') throw new HttpsError('invalid-argument', 'mockScenario is only accepted in mock mode.');
      if (!MOCK_CHECKOUT_SCENARIOS.includes(data.mockScenario as MockCheckoutScenario)) {
        throw new HttpsError('invalid-argument', 'Unknown mockScenario.');
      }
      scenario = data.mockScenario as MockCheckoutScenario;
    }

    return buildService(mode, scenario).createCheckout({
      uid,
      planId:       data.planId,
      returnOrigin: data.returnOrigin,
    });
  }),
);

// ─── getRecurrentePaymentStatus ───────────────────────────────────────────────
// Input:  { paymentId, refresh? }  — refresh reconciles a pending payment with the provider.

export const getRecurrentePaymentStatus = onCall(
  { cors: true, secrets: [RECURRENTE_SECRET_KEY] },
  (request) => guard(async () => {
    const uid = requireUid(request);
    const data = asRecord(request.data);
    return buildService(currentMode()).getPaymentStatus(uid, data.paymentId, data.refresh === true);
  }),
);

// ─── recurrenteWebhook ────────────────────────────────────────────────────────
// Register this URL in Recurrente → Settings → Developers and API → Webhooks,
// subscribed to intent.succeeded / intent.pending / intent.failed / intent.canceled.

export const recurrenteWebhook = onRequest(
  { cors: false, secrets: [RECURRENTE_SECRET_KEY, RECURRENTE_WEBHOOK_SECRET] },
  async (req, res) => {
    let mode: PaymentMode;
    try {
      mode = currentMode();
    } catch (err) {
      log.error('[webhook] configuration error', { message: (err as Error).message });
      res.status(503).send('Payments are not available');
      return;
    }

    const result = await handleRecurrenteWebhook(
      {
        method:  req.method,
        rawBody: req.rawBody?.toString('utf8'),
        headers: req.headers,
      },
      {
        signingSecret: mode === 'live' ? RECURRENTE_WEBHOOK_SECRET.value() : MOCK_WEBHOOK_SIGNING_SECRET,
        service:       buildService(mode),
        logger:        log,
      },
    );
    res.status(result.status).send(result.body);
  },
);

// ─── simulateRecurrenteMockEvent (mock mode only) ─────────────────────────────
// Plays the part of the buyer and of Recurrente: settles the mock checkout and
// delivers a signed webhook through the same verification path as a real one.
// Input: { paymentId, outcome: 'paid'|'declined'|'pending'|'cancelled', duplicate?, delaySeconds? }

export const simulateRecurrenteMockEvent = onCall(
  { cors: true },
  (request) => guard(async () => {
    const uid = requireUid(request);
    const data = asRecord(request.data);
    const mode = currentMode();
    if (mode !== 'mock') throw new HttpsError('failed-precondition', 'Simulation is only available in mock mode.');

    const outcome = data.outcome as MockPaymentOutcome;
    if (!MOCK_PAYMENT_OUTCOMES.includes(outcome)) throw new HttpsError('invalid-argument', 'Unknown outcome.');
    const delaySeconds = Math.min(Math.max(Number(data.delaySeconds) || 0, 0), 20);

    const service = buildService('mock');
    // Same ownership rules as reading the status.
    await service.getPaymentStatus(uid, data.paymentId);

    const db = getFirestore();
    const payment = await new FirestorePaymentRepository(db, 'mock').getPayment(String(data.paymentId));
    if (!payment?.providerCheckoutId) throw new HttpsError('failed-precondition', 'Payment has no checkout yet.');

    const provider = new MockRecurrenteProvider({ store: new FirestoreMockGatewayStore(db) });
    const event = await provider.settle(payment.providerCheckoutId, outcome);
    const body = JSON.stringify(event);
    const headers = signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET);

    if (delaySeconds > 0) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));

    const deliveries = data.duplicate === true ? 2 : 1;
    const results: { status: number; outcome?: string }[] = [];
    for (let attempt = 0; attempt < deliveries; attempt++) {
      const response = await handleRecurrenteWebhook(
        { method: 'POST', rawBody: body, headers },
        { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service, logger: log },
      );
      results.push({ status: response.status, outcome: response.outcome });
    }
    return { paymentId: payment.id, eventType: event.event_type, deliveries: results };
  }),
);

// ─── createCheckout (deprecated) ──────────────────────────────────────────────
// Kept so the currently deployed frontend keeps working until it is redeployed
// with createRecurrenteCheckout. Ignores clinicId from the client — the clinic
// is always taken from the caller's user document.

export const createCheckout = onCall(
  { cors: true, secrets: [RECURRENTE_SECRET_KEY] },
  (request) => guard(async () => {
    const uid = requireUid(request);
    const data = asRecord(request.data);
    let returnOrigin: string | undefined;
    try {
      returnOrigin = new URL(String(data.successUrl)).origin;
    } catch {
      throw new HttpsError('invalid-argument', 'successUrl is invalid.');
    }
    const result = await buildService(currentMode()).createCheckout({ uid, planId: 'monthly', returnOrigin });
    return { checkoutUrl: result.checkoutUrl };
  }),
);

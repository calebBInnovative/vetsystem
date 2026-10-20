import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { InMemoryPaymentRepository } from './helpers';
import {
  InMemoryMockGatewayStore,
  MOCK_WEBHOOK_SIGNING_SECRET,
  MockRecurrenteProvider,
  signWebhookPayload,
  type MockCheckoutScenario,
  type MockPaymentOutcome,
} from '../src/payments/recurrente/recurrente.mock';
import { PaymentError, PaymentService } from '../src/payments/recurrente/recurrente.service';
import { handleRecurrenteWebhook } from '../src/payments/recurrente/recurrente.webhook';
import { PLANS } from '../src/payments/recurrente/recurrente.plans';

const ORIGIN = 'https://vetsystem-b7675.web.app';

function setup(scenario: MockCheckoutScenario = 'success') {
  const repository = new InMemoryPaymentRepository('mock');
  repository.users.set('u1', { clinicId: 'clinic-a', role: 'veterinarian' });
  repository.users.set('u2', { clinicId: 'clinic-a', role: 'reception' });
  repository.users.set('admin-a', { clinicId: 'clinic-a', role: 'admin' });
  repository.users.set('admin-b', { clinicId: 'clinic-b', role: 'admin' });
  repository.licenses.set('clinic-a', { subscription: false, expirationDate: '2020-01-01', plan: 'Trial' });

  const store = new InMemoryMockGatewayStore();
  const provider = new MockRecurrenteProvider({ store, scenario, timeoutMs: 20 });
  const service = new PaymentService({
    repository,
    getProvider: () => provider,
    plans: PLANS,
    allowedReturnOrigins: [ORIGIN, 'http://localhost:3000'],
  });
  return { repository, store, provider, service };
}

type Env = ReturnType<typeof setup>;

/** Settles the mock checkout and delivers the signed webhook through the real handler. */
async function deliver(env: Env, paymentId: string, outcome: MockPaymentOutcome, messageId?: string) {
  const payment = env.repository.payments.get(paymentId)!;
  const event = await env.provider.settle(payment.providerCheckoutId!, outcome);
  const body = JSON.stringify(event);
  const headers = signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET, messageId);
  const response = await handleRecurrenteWebhook(
    { method: 'POST', rawBody: body, headers },
    { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service: env.service },
  );
  return { response, body, headers };
}

describe('mock checkout', () => {
  let env: Env;
  beforeEach(() => { env = setup(); });

  it('creates a pending mock payment with server-side amount and no network', async () => {
    const result = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });

    assert.equal(result.mode, 'mock');
    assert.equal(result.status, 'pending');
    assert.equal(result.reused, false);
    assert.match(result.paymentId, /^mock_/);
    assert.ok(result.checkoutUrl.startsWith(`${ORIGIN}/dashboard/`), 'mock URL stays inside the app');

    const record = env.repository.payments.get(result.paymentId)!;
    assert.equal(record.mode, 'mock');
    assert.equal(record.provider, 'recurrente');
    assert.equal(record.amountInCents, PLANS.monthly.amountInCents);
    assert.equal(record.currency, 'USD');
    assert.equal(record.clinicId, 'clinic-a');
    assert.match(record.providerCheckoutId!, /^mock_ch_/);
  });

  it('ignores any amount the client sends — only the plan id is read', async () => {
    const input = { uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN, amountInCents: 1, amount: 1 };
    const result = await env.service.createCheckout(input);
    const checkout = await env.store.get(env.repository.payments.get(result.paymentId)!.providerCheckoutId!);
    assert.equal(checkout!.total_in_cents, 3000);
  });

  it('rejects an unknown plan', async () => {
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: 'free-forever', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'invalid-argument',
    );
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: '__proto__', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'invalid-argument',
    );
  });

  it('rejects a plan whose amount is below the gateway minimum or not an integer', async () => {
    for (const amountInCents of [50, 29.99, -100]) {
      const repository = new InMemoryPaymentRepository('mock');
      repository.users.set('u1', { clinicId: 'clinic-a', role: 'admin' });
      const service = new PaymentService({
        repository,
        getProvider: () => new MockRecurrenteProvider({ store: new InMemoryMockGatewayStore() }),
        plans: { cheap: { ...PLANS.monthly, id: 'cheap', amountInCents } },
        allowedReturnOrigins: [ORIGIN],
      });
      await assert.rejects(
        service.createCheckout({ uid: 'u1', planId: 'cheap', returnOrigin: ORIGIN }),
        (err: PaymentError) => err.code === 'internal',
      );
      assert.equal(repository.payments.size, 0, 'no record for an invalid amount');
    }
  });

  it('rejects return origins outside the allow-list (open redirect)', async () => {
    for (const returnOrigin of ['https://evil.example', 'javascript:alert(1)', 42, undefined]) {
      await assert.rejects(
        env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin }),
        (err: PaymentError) => err.code === 'invalid-argument',
      );
    }
  });

  it('refuses users without a profile and the demo clinic', async () => {
    await assert.rejects(
      env.service.createCheckout({ uid: 'ghost', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'permission-denied',
    );
    env.repository.users.set('demo-user', { clinicId: 'demo', role: 'admin' });
    await assert.rejects(
      env.service.createCheckout({ uid: 'demo-user', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'failed-precondition',
    );
  });

  it('returns the same checkout for a duplicate request', async () => {
    const first = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    const second = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    assert.equal(second.paymentId, first.paymentId);
    assert.equal(second.reused, true);
    assert.equal(env.repository.payments.size, 1);
  });

  it('serialises concurrent duplicate requests into one checkout', async () => {
    const results = await Promise.allSettled([
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
    ]);
    assert.equal(env.repository.payments.size, 1, 'only one payment record');
    assert.equal(env.store.checkouts.size, 1, 'only one provider checkout');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    for (const r of rejected) assert.equal((r.reason as PaymentError).code, 'already-exists');
  });

  it('creates a new checkout once the previous one failed', async () => {
    const first = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    await deliver(env, first.paymentId, 'cancelled');
    const second = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    assert.notEqual(second.paymentId, first.paymentId);
  });
});

describe('mock checkout failures', () => {
  it('records an API error and surfaces a retryable error', async () => {
    const env = setup('api_error');
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'unavailable',
    );
    const [record] = env.repository.payments.values();
    assert.equal(record.status, 'failed');
    assert.equal(record.lastError, 'server');
  });

  it('records a network timeout', async () => {
    const env = setup('timeout');
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'unavailable',
    );
    const [record] = env.repository.payments.values();
    assert.equal(record.status, 'failed');
    assert.equal(record.lastError, 'timeout');
  });

  it('maps a credentials rejection to failed-precondition', async () => {
    const env = setup('unauthorized');
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'failed-precondition',
    );
  });

  it('fails cleanly when Firestore cannot reserve the checkout', async () => {
    const env = setup();
    env.repository.failCommits = 1;
    await assert.rejects(env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }));
    assert.equal(env.repository.payments.size, 0);
    assert.equal(env.store.checkouts.size, 0, 'no provider checkout without a record');
  });
});

describe('mock webhook outcomes', () => {
  let env: Env;
  let paymentId: string;
  beforeEach(async () => {
    env = setup();
    ({ paymentId } = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }));
  });

  it('successful payment → paid, without fulfilling anything', async () => {
    const { response } = await deliver(env, paymentId, 'paid');
    assert.equal(response.status, 200);
    assert.equal(response.outcome, 'paid');

    const record = env.repository.payments.get(paymentId)!;
    assert.equal(record.status, 'paid');
    assert.ok(record.paidAt);
    assert.equal(record.fulfilledAt, null, 'mock payments never fulfill');
    assert.deepEqual(
      env.repository.licenses.get('clinic-a'),
      { subscription: false, expirationDate: '2020-01-01', plan: 'Trial' },
      'license untouched',
    );
  });

  it('declined payment → failed, and a later successful retry → paid', async () => {
    const declined = await deliver(env, paymentId, 'declined');
    assert.equal(declined.response.outcome, 'failed');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'failed');
    assert.equal(env.repository.payments.get(paymentId)!.lastError, 'declined');

    const paid = await deliver(env, paymentId, 'paid');
    assert.equal(paid.response.outcome, 'paid');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'paid');
  });

  it('pending payment → pending', async () => {
    const { response } = await deliver(env, paymentId, 'pending');
    assert.equal(response.outcome, 'pending');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'pending');
  });

  it('cancelled payment → cancelled', async () => {
    const { response } = await deliver(env, paymentId, 'cancelled');
    assert.equal(response.outcome, 'cancelled');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'cancelled');
  });

  it('duplicate delivery of the same event is processed once', async () => {
    const first = await deliver(env, paymentId, 'paid');
    const replay = await handleRecurrenteWebhook(
      { method: 'POST', rawBody: first.body, headers: first.headers },
      { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service: env.service },
    );
    assert.equal(replay.status, 200, 'acknowledged so Recurrente stops retrying');
    assert.equal(replay.outcome, 'duplicate');
    assert.equal(env.repository.events.size, 1);
  });

  it('a delayed, out-of-order event never downgrades a paid payment', async () => {
    await deliver(env, paymentId, 'paid');
    const paidAt = env.repository.payments.get(paymentId)!.paidAt;

    for (const late of ['pending', 'declined', 'cancelled'] as const) {
      const { response } = await deliver(env, paymentId, late);
      assert.equal(response.outcome, 'stale');
    }
    const record = env.repository.payments.get(paymentId)!;
    assert.equal(record.status, 'paid');
    assert.equal(record.paidAt, paidAt);
  });

  it('a second succeeded event with a new id does not pay twice', async () => {
    await deliver(env, paymentId, 'paid');
    const again = await deliver(env, paymentId, 'paid');
    assert.equal(again.response.outcome, 'already_paid');
  });

  it('answers 500 when Firestore fails, then succeeds on Recurrente\'s retry', async () => {
    env.repository.failCommits = 1;
    const failed = await deliver(env, paymentId, 'paid', 'msg_retry_1');
    assert.equal(failed.response.status, 500);
    assert.equal(env.repository.payments.get(paymentId)!.status, 'pending', 'nothing half-written');
    assert.equal(env.repository.events.size, 0, 'event not marked processed');

    const retry = await handleRecurrenteWebhook(
      { method: 'POST', rawBody: failed.body, headers: failed.headers },
      { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service: env.service },
    );
    assert.equal(retry.status, 200);
    assert.equal(retry.outcome, 'paid');
  });

  it('acknowledges but ignores legacy and unrelated events', async () => {
    const body = JSON.stringify({ event_type: 'payment_intent.succeeded', id: 'pa_1', status: 'succeeded', type: 'payment' });
    const response = await handleRecurrenteWebhook(
      { method: 'POST', rawBody: body, headers: signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET) },
      { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service: env.service },
    );
    assert.equal(response.status, 200);
    assert.equal(response.outcome, 'ignored');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'pending');
  });

  it('does not apply an event whose checkout id differs from the record', async () => {
    const payment = env.repository.payments.get(paymentId)!;
    const event = await env.provider.settle(payment.providerCheckoutId!, 'paid');
    event.checkout!.id = 'mock_ch_someone_else';
    const body = JSON.stringify(event);
    const response = await handleRecurrenteWebhook(
      { method: 'POST', rawBody: body, headers: signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET) },
      { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service: env.service },
    );
    assert.equal(response.status, 200);
    assert.notEqual(env.repository.payments.get(paymentId)!.status, 'paid');
  });
});

describe('payment status access', () => {
  let env: Env;
  let paymentId: string;
  beforeEach(async () => {
    env = setup();
    ({ paymentId } = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }));
  });

  it('lets the owner read the status', async () => {
    const view = await env.service.getPaymentStatus('u1', paymentId);
    assert.equal(view.status, 'pending');
    assert.equal(view.mode, 'mock');
  });

  it('lets an admin of the same clinic read it', async () => {
    const view = await env.service.getPaymentStatus('admin-a', paymentId);
    assert.equal(view.paymentId, paymentId);
  });

  it('hides it from a non-admin colleague, another clinic and unknown users', async () => {
    for (const uid of ['u2', 'admin-b', 'ghost']) {
      await assert.rejects(
        env.service.getPaymentStatus(uid, paymentId),
        (err: PaymentError) => err.code === 'not-found',
        `uid ${uid} must not see the payment`,
      );
    }
  });

  it('rejects malformed payment ids', async () => {
    for (const bad of ['', '../payments/x', 'a'.repeat(65), 12, null]) {
      await assert.rejects(
        env.service.getPaymentStatus('u1', bad),
        (err: PaymentError) => err.code === 'invalid-argument',
      );
    }
  });

  it('refresh reconciles a payment whose webhook never arrived', async () => {
    const payment = env.repository.payments.get(paymentId)!;
    await env.provider.settle(payment.providerCheckoutId!, 'paid'); // gateway paid, no webhook delivered
    const view = await env.service.getPaymentStatus('u1', paymentId, true);
    assert.equal(view.status, 'paid');
  });
});

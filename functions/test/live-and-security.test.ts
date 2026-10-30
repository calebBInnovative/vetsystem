import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { createFakeRecurrenteApi, fakeLiveClient, InMemoryPaymentRepository, type FakeRecurrenteApi } from './helpers';
import { RecurrenteClient } from '../src/payments/recurrente/recurrente.client';
import { RecurrenteError } from '../src/payments/recurrente/recurrente.errors';
import { PaymentConfigError, parseOrigins, resolvePaymentMode } from '../src/payments/recurrente/recurrente.config';
import {
  InMemoryMockGatewayStore,
  MOCK_WEBHOOK_SIGNING_SECRET,
  MockRecurrenteProvider,
  signWebhookPayload,
} from '../src/payments/recurrente/recurrente.mock';
import { extendExpiration, PaymentError, PaymentService } from '../src/payments/recurrente/recurrente.service';
import { handleRecurrenteWebhook } from '../src/payments/recurrente/recurrente.webhook';
import { PLANS } from '../src/payments/recurrente/recurrente.plans';
import type { RecurrenteIntentEvent } from '../src/payments/recurrente/recurrente.types';

const ORIGIN = 'https://vetsystem-b7675.web.app';
// A different, valid whsec_ secret standing in for the live endpoint's signing secret.
const LIVE_SIGNING_SECRET = 'whsec_' + Buffer.from('live-endpoint-secret-for-tests-only').toString('base64');
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 9, 15, 0, 0); // 2026-10-09

function liveSetup() {
  const api = createFakeRecurrenteApi();
  const repository = new InMemoryPaymentRepository('live');
  repository.users.set('u1', { clinicId: 'clinic-a', role: 'master' });
  repository.licenses.set('clinic-a', { subscription: false, expirationDate: '2026-10-01', plan: 'Trial' });
  let now = NOW;
  const service = new PaymentService({
    repository,
    getProvider: () => fakeLiveClient(api),
    plans: PLANS,
    allowedReturnOrigins: [ORIGIN, 'http://localhost:3000'],
    now: () => now,
  });
  return { api, repository, service, advance: (ms: number) => { now += ms; } };
}

function intentEvent(api: FakeRecurrenteApi, checkoutId: string, eventType: string): RecurrenteIntentEvent {
  const checkout = api.checkouts.get(checkoutId)!;
  return {
    event_type: eventType,
    type: 'payment',
    id: `in_${Math.random().toString(36).slice(2)}`,
    status: eventType.split('.')[1],
    amount_in_cents: checkout.total_in_cents,
    currency: checkout.currency,
    checkout: { id: checkout.id, status: checkout.status, live_mode: true, metadata: checkout.metadata },
  };
}

async function deliverLive(service: PaymentService, event: unknown, secret = LIVE_SIGNING_SECRET) {
  const body = JSON.stringify(event);
  return handleRecurrenteWebhook(
    { method: 'POST', rawBody: body, headers: signWebhookPayload(body, secret) },
    { signingSecret: LIVE_SIGNING_SECRET, service },
  );
}

describe('live mode (fake Recurrente API, no network)', () => {
  let env: ReturnType<typeof liveSetup>;
  let paymentId: string;
  let checkoutId: string;

  beforeEach(async () => {
    env = liveSetup();
    ({ paymentId } = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }));
    checkoutId = env.repository.payments.get(paymentId)!.providerCheckoutId!;
  });

  it('sends the documented request: POST /api/checkouts with X-SECRET-KEY and inline items', () => {
    const [request] = env.api.requests;
    assert.equal(request.method, 'POST');
    assert.equal(request.url, 'https://app.recurrente.com/api/checkouts');
    assert.equal(request.headers['X-SECRET-KEY'], 'sk_live_fake_for_tests');
    assert.deepEqual((request.body as { items: unknown[] }).items, [{
      name: PLANS.monthly.name, amount_in_cents: 2000, currency: 'USD', quantity: 1, charge_type: 'one_time',
    }]);
    assert.equal((request.body as { metadata: Record<string, string> }).metadata.paymentId, paymentId);
  });

  it('marks paid and extends the license once, after confirming with GET /checkouts/{id}', async () => {
    env.api.checkouts.get(checkoutId)!.status = 'paid';
    const response = await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));

    assert.equal(response.outcome, 'paid');
    assert.ok(env.api.requests.some((r) => r.method === 'GET' && r.url.endsWith(`/checkouts/${checkoutId}`)));
    const record = env.repository.payments.get(paymentId)!;
    assert.equal(record.status, 'paid');
    assert.equal(record.fulfilledAt, NOW);
    // The trial had expired on 2026-10-01, so 30 days are counted from today.
    assert.deepEqual(env.repository.licenses.get('clinic-a'), {
      subscription: true, plan: 'monthly', expirationDate: '2026-11-08', billingNotice: null, lastPaymentAt: NOW,
    });

    const again = await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));
    assert.equal(again.outcome, 'already_paid');
    assert.equal(env.repository.licenses.get('clinic-a')!.expirationDate, '2026-11-08', 'not extended twice');
  });

  it('never trusts the event body: a "succeeded" event for an unpaid checkout changes nothing', async () => {
    const forged = intentEvent(env.api, checkoutId, 'intent.succeeded');
    forged.checkout!.status = 'paid'; // body claims paid, provider says unpaid
    const response = await deliverLive(env.service, forged);
    assert.equal(response.outcome, 'not_confirmed');
    assert.equal(env.repository.payments.get(paymentId)!.status, 'pending');
    assert.equal(env.repository.licenses.get('clinic-a')!.subscription, false);
  });

  it('flags for review when the provider total does not match the record', async () => {
    const checkout = env.api.checkouts.get(checkoutId)!;
    checkout.status = 'paid';
    checkout.total_in_cents = 100;
    const response = await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));
    assert.equal(response.outcome, 'review_required');
    const record = env.repository.payments.get(paymentId)!;
    assert.equal(record.status, 'pending');
    assert.equal(record.reviewRequired, true);
    assert.equal(env.repository.licenses.get('clinic-a')!.subscription, false);
  });

  it('answers 500 (so Recurrente retries) when the confirmation call fails', async () => {
    env.api.checkouts.get(checkoutId)!.status = 'paid';
    env.api.failNext = { status: 503, body: { message: 'Service Unavailable' } };
    const response = await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));
    assert.equal(response.status, 500);
    assert.equal(env.repository.payments.get(paymentId)!.status, 'pending');
  });

  it('extends from the current expiration when the license is still active', async () => {
    env.repository.licenses.set('clinic-a', { subscription: true, expirationDate: '2026-12-01', plan: 'monthly' });
    env.api.checkouts.get(checkoutId)!.status = 'paid';
    await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));
    assert.equal(env.repository.licenses.get('clinic-a')!.expirationDate, '2026-12-31');
  });

  it('a billing notice is cleared and the paid period starts today, not after the old trial', async () => {
    env.repository.licenses.set('clinic-a', {
      subscription: true, expirationDate: '2027-10-01', plan: 'Trial', billingNotice: { at: NOW - 1000, blocking: true },
    });
    env.api.checkouts.get(checkoutId)!.status = 'paid';
    await deliverLive(env.service, intentEvent(env.api, checkoutId, 'intent.succeeded'));
    const license = env.repository.licenses.get('clinic-a')!;
    assert.equal(license.expirationDate, '2026-11-08');
    assert.equal(license.billingNotice, null);
  });

  it('requires an https return origin in live mode', async () => {
    await assert.rejects(
      env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: 'http://localhost:3000' }),
      (err: PaymentError) => err.code === 'invalid-argument',
    );
  });

  it('reuses the pending checkout instead of charging twice, and expires the reuse window', async () => {
    const again = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    assert.equal(again.paymentId, paymentId);
    assert.equal(env.api.requests.filter((r) => r.method === 'POST').length, 1);

    env.advance(31 * 60_000);
    const later = await env.service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    assert.notEqual(later.paymentId, paymentId);
  });
});

describe('missing credentials and API failures', () => {
  it('refuses to build a live client without a key', () => {
    for (const secretKey of [undefined, '', '   ']) {
      assert.throws(() => new RecurrenteClient({ secretKey }), (err: RecurrenteError) => err.code === 'missing_credentials');
    }
  });

  it('marks the payment failed and reports failed-precondition when the key is missing', async () => {
    const repository = new InMemoryPaymentRepository('live');
    repository.users.set('u1', { clinicId: 'clinic-a', role: 'admin' });
    const service = new PaymentService({
      repository,
      getProvider: () => new RecurrenteClient({ secretKey: undefined }),
      plans: PLANS,
      allowedReturnOrigins: [ORIGIN],
    });
    await assert.rejects(
      service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'failed-precondition',
    );
    const [record] = repository.payments.values();
    assert.equal(record.status, 'failed');
    assert.equal(record.lastError, 'missing_credentials');
  });

  it('maps HTTP errors to stable codes and never echoes the key', async () => {
    const cases: [number, string][] = [[400, 'invalid_request'], [401, 'unauthorized'], [404, 'not_found'], [422, 'unprocessable'], [500, 'server']];
    for (const [status, code] of cases) {
      const api = createFakeRecurrenteApi();
      api.failNext = { status, body: { message: 'Checkout Inválido', code: 'amount_exceeds_unverified_limit' } };
      const err = await fakeLiveClient(api).retrieveCheckout('ch_1').catch((e: unknown) => e) as RecurrenteError;
      assert.equal(err.code, code);
      assert.equal(err.httpStatus, status);
      assert.ok(!JSON.stringify({ ...err, message: err.message, stack: err.stack }).includes('sk_live_fake_for_tests'));
    }
  });

  it('times out a hanging request', async () => {
    const api = createFakeRecurrenteApi();
    api.hangNext = true;
    const err = await fakeLiveClient(api, 30).testCredentials().catch((e: unknown) => e) as RecurrenteError;
    assert.equal(err.code, 'timeout');
    assert.equal(err.retryable, true);
  });

  it('reports a network failure as retryable', async () => {
    const client = new RecurrenteClient({
      secretKey: 'sk_live_fake_for_tests',
      fetchFn: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch,
    });
    const err = await client.retrieveCheckout('ch_1').catch((e: unknown) => e) as RecurrenteError;
    assert.equal(err.code, 'network');
    assert.equal(err.retryable, true);
  });

  it('GET /test only reads — the credentials check never creates anything', async () => {
    const api = createFakeRecurrenteApi();
    const result = await fakeLiveClient(api).testCredentials();
    assert.equal(result.environment, 'live');
    assert.deepEqual(api.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`), ['GET /api/test']);
  });
});

describe('webhook authentication', () => {
  const env = liveSetup();
  const body = JSON.stringify({ event_type: 'intent.succeeded', id: 'in_x', status: 'succeeded', type: 'payment' });
  const call = (headers: Record<string, string>, opts: { secret?: string; rawBody?: string; method?: string } = {}) =>
    handleRecurrenteWebhook(
      { method: opts.method ?? 'POST', rawBody: opts.rawBody ?? body, headers },
      { signingSecret: 'secret' in opts ? opts.secret : LIVE_SIGNING_SECRET, service: env.service },
    );

  it('rejects a wrong signature', async () => {
    const response = await call(signWebhookPayload(body, 'whsec_' + Buffer.from('attacker').toString('base64')));
    assert.equal(response.status, 401);
  });

  it('rejects a mock-signed event at the live endpoint (mock/live isolation)', async () => {
    const response = await call(signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET));
    assert.equal(response.status, 401);
  });

  it('rejects missing signature headers', async () => {
    assert.equal((await call({})).status, 401);
  });

  it('rejects a tampered body', async () => {
    const headers = signWebhookPayload(body, LIVE_SIGNING_SECRET);
    const response = await call(headers, { rawBody: body.replace('in_x', 'in_y') });
    assert.equal(response.status, 401);
  });

  it('rejects a replayed delivery older than the tolerance window', async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const response = await call(signWebhookPayload(body, LIVE_SIGNING_SECRET, 'msg_old', old));
    assert.equal(response.status, 401);
  });

  it('rejects non-POST and reports a missing secret as a server error', async () => {
    assert.equal((await call({}, { method: 'GET' })).status, 405);
    assert.equal((await call(signWebhookPayload(body, LIVE_SIGNING_SECRET), { secret: undefined })).status, 500);
  });
});

describe('mock / live isolation', () => {
  it('defaults to mock and needs two switches plus a deployed runtime for live', () => {
    assert.equal(resolvePaymentMode({ requestedMode: '', liveEnabled: true, isEmulator: false }), 'mock');
    assert.equal(resolvePaymentMode({ requestedMode: 'mock', liveEnabled: true, isEmulator: false }), 'mock');
    assert.equal(resolvePaymentMode({ requestedMode: 'LIVE', liveEnabled: true, isEmulator: false }), 'live');
    assert.throws(() => resolvePaymentMode({ requestedMode: 'live', liveEnabled: false, isEmulator: false }), PaymentConfigError);
    assert.throws(() => resolvePaymentMode({ requestedMode: 'live', liveEnabled: true, isEmulator: true }), PaymentConfigError);
    assert.throws(() => resolvePaymentMode({ requestedMode: 'production', liveEnabled: true, isEmulator: false }), PaymentConfigError);
  });

  it('refuses to pair a mock repository with the live API', async () => {
    const repository = new InMemoryPaymentRepository('mock');
    repository.users.set('u1', { clinicId: 'clinic-a', role: 'admin' });
    const api = createFakeRecurrenteApi();
    const service = new PaymentService({
      repository, getProvider: () => fakeLiveClient(api), plans: PLANS, allowedReturnOrigins: [ORIGIN],
    });
    await assert.rejects(
      service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'internal',
    );
    assert.equal(api.requests.length, 0, 'the live API was never called');
  });

  it('refuses to pair a live repository with the mock provider', async () => {
    const repository = new InMemoryPaymentRepository('live');
    repository.users.set('u1', { clinicId: 'clinic-a', role: 'admin' });
    const service = new PaymentService({
      repository,
      getProvider: () => new MockRecurrenteProvider({ store: new InMemoryMockGatewayStore() }),
      plans: PLANS,
      allowedReturnOrigins: [ORIGIN],
    });
    await assert.rejects(
      service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN }),
      (err: PaymentError) => err.code === 'internal',
    );
  });

  it('a mock payment id is invisible to the live service', async () => {
    const mockRepo = new InMemoryPaymentRepository('mock');
    mockRepo.users.set('u1', { clinicId: 'clinic-a', role: 'admin' });
    const mockService = new PaymentService({
      repository: mockRepo,
      getProvider: () => new MockRecurrenteProvider({ store: new InMemoryMockGatewayStore() }),
      plans: PLANS,
      allowedReturnOrigins: [ORIGIN],
    });
    const { paymentId } = await mockService.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });

    const live = liveSetup();
    await assert.rejects(
      live.service.getPaymentStatus('u1', paymentId),
      (err: PaymentError) => err.code === 'not-found',
    );
  });
});

describe('helpers', () => {
  it('extendExpiration counts from today or from a future expiration', () => {
    assert.equal(extendExpiration(undefined, 30, NOW), '2026-11-08');
    assert.equal(extendExpiration('2026-01-01', 30, NOW), '2026-11-08');
    assert.equal(extendExpiration('2026-10-20', 30, NOW), '2026-11-19');
    assert.equal(extendExpiration('not-a-date', 30, NOW + DAY), '2026-11-09');
  });

  it('parseOrigins normalises entries', () => {
    assert.deepEqual(parseOrigins(' https://a.web.app/ , http://localhost:3000/x ,'), ['https://a.web.app', 'http://localhost:3000']);
  });
});

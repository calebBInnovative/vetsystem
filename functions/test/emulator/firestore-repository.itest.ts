// Runs against the Firestore emulator only — see `npm run test:emulator`.
import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  FirestoreMockGatewayStore,
  FirestorePaymentRepository,
  MockFulfillmentError,
  PAYMENT_COLLECTIONS,
} from '../../src/payments/recurrente/payment.repository';
import {
  MOCK_WEBHOOK_SIGNING_SECRET,
  MockRecurrenteProvider,
  signWebhookPayload,
} from '../../src/payments/recurrente/recurrente.mock';
import { PaymentService } from '../../src/payments/recurrente/recurrente.service';
import { handleRecurrenteWebhook } from '../../src/payments/recurrente/recurrente.webhook';
import { PLANS } from '../../src/payments/recurrente/recurrente.plans';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo- project.');
}

const ORIGIN = 'http://localhost:3000';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

describe('Firestore repository (emulator)', () => {
  before(async () => {
    await db.doc('users/u1').set({ clinicId: 'clinic-a', role: 'admin' });
    await db.doc('clinics/clinic-a/license/data').set({ subscription: false, expirationDate: '2020-01-01', plan: 'Trial' });
  });

  it('runs a full mock payment through real Firestore transactions, in mock collections only', async () => {
    const repository = new FirestorePaymentRepository(db, 'mock');
    const provider = new MockRecurrenteProvider({ store: new FirestoreMockGatewayStore(db) });
    const service = new PaymentService({
      repository, getProvider: () => provider, plans: PLANS, allowedReturnOrigins: [ORIGIN],
    });

    const { paymentId } = await service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    const duplicate = await service.createCheckout({ uid: 'u1', planId: 'monthly', returnOrigin: ORIGIN });
    assert.equal(duplicate.paymentId, paymentId);

    const record = (await db.collection(PAYMENT_COLLECTIONS.mock.payments).doc(paymentId).get()).data()!;
    const event = await provider.settle(record.providerCheckoutId, 'paid');
    const body = JSON.stringify(event);
    const headers = signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET);
    const deps = { signingSecret: MOCK_WEBHOOK_SIGNING_SECRET, service };

    const first = await handleRecurrenteWebhook({ method: 'POST', rawBody: body, headers }, deps);
    const second = await handleRecurrenteWebhook({ method: 'POST', rawBody: body, headers }, deps);
    assert.equal(first.outcome, 'paid');
    assert.equal(second.outcome, 'duplicate');

    const paid = (await db.collection(PAYMENT_COLLECTIONS.mock.payments).doc(paymentId).get()).data()!;
    assert.equal(paid.status, 'paid');
    assert.equal(paid.mode, 'mock');
    assert.equal(paid.fulfilledAt, null);

    const live = await db.collection(PAYMENT_COLLECTIONS.live.payments).get();
    assert.equal(live.size, 0, 'nothing written to the live payments collection');
    const license = (await db.doc('clinics/clinic-a/license/data').get()).data()!;
    assert.equal(license.subscription, false, 'license untouched by a mock payment');
  });

  it('a mock repository cannot read or write a license even if asked to', async () => {
    const repository = new FirestorePaymentRepository(db, 'mock');
    await assert.rejects(repository.runTransaction((tx) => tx.getLicense('clinic-a')), MockFulfillmentError);
    await assert.rejects(
      repository.runTransaction(async (tx) => tx.setLicense('clinic-a', { subscription: true })),
      MockFulfillmentError,
    );
  });
});

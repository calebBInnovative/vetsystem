// Runs against the Firestore emulator only — see `npm run test:emulator`.
import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ManualPaymentError, clinicPaymentReference, reportManualPayment, reviewManualPayment,
} from '../../src/billing/manual-payments';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo- project.');
}

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const NOW = Date.UTC(2026, 9, 29, 15);
const DAY = 86_400_000;

const isCode = (code: string) => (err: unknown) => err instanceof ManualPaymentError && err.code === code;

describe('manual payments (emulator)', () => {
  before(async () => {
    await db.doc('platform/billing').set({
      methods: [
        { id: 'kash', type: 'kash', label: 'Kash', holder: 'Owner', account: '8888-0000', currency: 'USD', enabled: true },
        { id: 'bac', type: 'bank', label: 'BAC', holder: 'Owner', account: '123', currency: 'NIO', enabled: true },
        { id: 'lafise', type: 'bank', label: 'LAFISE', holder: 'Owner', account: '456', currency: 'USD', enabled: false },
      ],
      graceDays: 3,
    });
    // Only what differs from DEFAULT_PLANS: córdoba prices, and Clinic not on sale.
    await db.doc('platform/plans').set({
      plans: {
        professional: { prices: { USD: { monthly: 20, annual: 200 }, NIO: { monthly: 735 } } },
        clinic:       { active: false },
      },
    });
    for (const clinic of ['mp-a', 'mp-b', 'mp-c']) {
      await db.doc(`clinics/${clinic}`).set({ name: `Clinic ${clinic}` });
      await db.doc(`clinics/${clinic}/license/data`).set({
        plan: 'Trial', expirationDate: '2027-06-01', subscription: true, billingNotice: { at: NOW - DAY, blocking: true },
      });
    }
    await db.doc('users/mp-owner-a').set({ clinicId: 'mp-a', role: 'admin', name: 'Ana' });
    await db.doc('users/mp-owner-b').set({ clinicId: 'mp-b', role: 'admin', name: 'Beto' });
    await db.doc('users/mp-recep-a').set({ clinicId: 'mp-a', role: 'reception' });
    await db.doc('users/mp-owner-c').set({ clinicId: 'mp-c', role: 'master', name: 'Carla' });
  });

  let firstInvoiceId = '';

  it('records a pending invoice with the configured price and grants the provisional grace', async () => {
    const result = await reportManualPayment(db, {
      uid: 'mp-owner-a', email: 'a@x.com', methodId: 'kash', payerReference: 'kx-1234', paidOn: '2026-10-29',
      originBank: 'BAC', transferType: 'deferred', receiptPath: 'paymentReceipts/mp-a/receipt0001.png',
    }, NOW);
    firstInvoiceId = result.invoiceId;

    assert.equal(result.amount, 20);
    assert.equal(result.currency, 'USD');
    assert.match(result.number, /^PAG-2026-\d{4}$/);
    assert.equal(result.reference, clinicPaymentReference('mp-a'));
    assert.equal(result.graceUntil, NOW + 3 * DAY);

    const invoice = (await db.doc(`subscriptionInvoices/${result.invoiceId}`).get()).data();
    assert.equal(invoice?.status, 'pending');
    assert.equal(invoice?.clinicName, 'Clinic mp-a');
    assert.equal(invoice?.reportedBy.name, 'Ana');
    assert.equal(invoice?.originBank, 'BAC');
    assert.equal(invoice?.transferType, 'deferred');
    assert.equal(invoice?.receiptPath, 'paymentReceipts/mp-a/receipt0001.png');
    const license = (await db.doc('clinics/mp-a/license/data').get()).data();
    assert.equal(license?.graceUntil, NOW + 3 * DAY);
  });

  it('allows only one pending report per clinic', async () => {
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-a', email: null, methodId: 'kash', payerReference: 'other-999', paidOn: '2026-10-29',
    }, NOW), isCode('already-exists'));
  });

  it('rejects the same receipt reported by another clinic', async () => {
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-b', email: null, methodId: 'kash', payerReference: 'KX 1234', paidOn: '2026-10-29',
    }, NOW), isCode('already-exists'));
  });

  it('refuses staff, disabled methods and future dates', async () => {
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-recep-a', email: null, methodId: 'kash', payerReference: 'abc-1', paidOn: '2026-10-29',
    }, NOW), isCode('permission-denied'));
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-b', email: null, methodId: 'lafise', payerReference: 'abc-2', paidOn: '2026-10-29',
    }, NOW), isCode('invalid-argument'));
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-b', email: null, methodId: 'bac', payerReference: 'abc-3', paidOn: '2026-12-01',
    }, NOW), isCode('invalid-argument'));
  });

  it('confirming starts a 30-day paid period today and clears the notice and the grace', async () => {
    const result = await reviewManualPayment(db, { invoiceId: firstInvoiceId, decision: 'confirm', reviewer: 'owner' }, NOW);
    assert.deepEqual(result, { status: 'confirmed', newExpirationDate: '2026-11-28' });

    const license = (await db.doc('clinics/mp-a/license/data').get()).data();
    assert.equal(license?.plan, 'professional', 'a report without planId buys Professional, as before plans existed');
    assert.equal(license?.planPeriod, 'monthly');
    assert.equal(license?.limits.maxUsers, 5);
    assert.equal(license?.expirationDate, '2026-11-28', 'not added on top of the old free license');
    assert.equal(license?.billingNotice, null);
    assert.equal(license?.graceUntil, null);

    await assert.rejects(
      reviewManualPayment(db, { invoiceId: firstInvoiceId, decision: 'confirm', reviewer: 'owner' }, NOW),
      isCode('failed-precondition'),
      'a payment is never applied twice',
    );
  });

  it('a later payment extends from the current paid expiration', async () => {
    const report = await reportManualPayment(db, {
      uid: 'mp-owner-a', email: null, methodId: 'bac', payerReference: 'BAC-555', paidOn: '2026-11-18',
    }, NOW + 20 * DAY);
    assert.equal(report.currency, 'NIO');
    assert.equal(report.amount, 735);
    const result = await reviewManualPayment(db, { invoiceId: report.invoiceId, decision: 'confirm', reviewer: 'owner' }, NOW + 20 * DAY);
    assert.equal(result.newExpirationDate, '2026-12-28');
  });

  it('rejecting withdraws the grace and frees the receipt number', async () => {
    const report = await reportManualPayment(db, {
      uid: 'mp-owner-b', email: null, methodId: 'bac', payerReference: 'FAKE-1', paidOn: '2026-10-29',
    }, NOW);
    assert.equal((await db.doc('clinics/mp-b/license/data').get()).get('graceUntil'), NOW + 3 * DAY);

    await reviewManualPayment(db, { invoiceId: report.invoiceId, decision: 'reject', reason: 'No llegó', reviewer: 'owner' }, NOW);
    const license = (await db.doc('clinics/mp-b/license/data').get()).data();
    assert.equal(license?.graceUntil, null);
    assert.equal(license?.expirationDate, '2027-06-01', 'license untouched');
    const invoice = (await db.doc(`subscriptionInvoices/${report.invoiceId}`).get()).data();
    assert.equal(invoice?.status, 'rejected');
    assert.equal(invoice?.rejectReason, 'No llegó');

    // A corrected report with the same receipt is accepted again.
    await reportManualPayment(db, {
      uid: 'mp-owner-b', email: null, methodId: 'bac', payerReference: 'FAKE-1', paidOn: '2026-10-29',
    }, NOW);
  });

  it('sells the chosen plan and period, and copies its limits to the license', async () => {
    const report = await reportManualPayment(db, {
      uid: 'mp-owner-c', email: null, methodId: 'kash', payerReference: 'KX-ANNUAL', paidOn: '2026-10-29',
      planId: 'basic', period: 'annual',
    }, NOW);
    assert.equal(report.amount, 120);
    const result = await reviewManualPayment(db, { invoiceId: report.invoiceId, decision: 'confirm', reviewer: 'owner' }, NOW);
    assert.equal(result.newExpirationDate, '2027-10-29', '365 days from today');

    const license = (await db.doc('clinics/mp-c/license/data').get()).data();
    assert.equal(license?.plan, 'basic');
    assert.equal(license?.planPeriod, 'annual');
    assert.equal(license?.limits.maxPatients, 500);
    assert.ok(!license?.limits.modules.includes('finances'));
  });

  it('refuses inactive plans, unpriced currencies and unknown plans', async () => {
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-c', email: null, methodId: 'kash', payerReference: 'KX-CLINIC', paidOn: '2026-10-29', planId: 'clinic',
    }, NOW), isCode('invalid-argument'));
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-c', email: null, methodId: 'bac', payerReference: 'BAC-BASIC', paidOn: '2026-10-29', planId: 'basic',
    }, NOW), isCode('failed-precondition'), 'Basic has no córdoba price');
    await assert.rejects(reportManualPayment(db, {
      uid: 'mp-owner-c', email: null, methodId: 'kash', payerReference: 'KX-GOLD', paidOn: '2026-10-29', planId: 'gold',
    }, NOW), isCode('invalid-argument'));
  });

  it('numbers invoices sequentially per year', async () => {
    const snap = await db.collection('subscriptionInvoices').orderBy('number').get();
    const numbers = snap.docs.map((d) => d.get('number'));
    assert.deepEqual(numbers, numbers.map((_, i) => `PAG-2026-${String(i + 1).padStart(4, '0')}`));
  });
});

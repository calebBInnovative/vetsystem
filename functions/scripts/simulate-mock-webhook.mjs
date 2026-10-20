#!/usr/bin/env node
// Delivers a signed MOCK webhook to the recurrenteWebhook function over HTTP.
// Emulator only: it refuses to run unless FIRESTORE_EMULATOR_HOST is set and
// the target URL is local, so it can never reach a deployed project.
//
// Usage (emulators running, after `npm run build`):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/simulate-mock-webhook.mjs \
//     --project demo-vetsystem --payment mock_XXXX --outcome paid [--duplicate] [--delay 5]
//
// Outcomes: paid | declined | pending | cancelled

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  MockRecurrenteProvider,
  MOCK_PAYMENT_OUTCOMES,
  MOCK_WEBHOOK_SIGNING_SECRET,
  signWebhookPayload,
} = require('../lib/payments/recurrente/recurrente.mock.js');
const { FirestoreMockGatewayStore, PAYMENT_COLLECTIONS } = require('../lib/payments/recurrente/payment.repository.js');

const { values } = parseArgs({
  options: {
    project:   { type: 'string', default: 'demo-vetsystem' },
    payment:   { type: 'string' },
    outcome:   { type: 'string', default: 'paid' },
    duplicate: { type: 'boolean', default: false },
    delay:     { type: 'string', default: '0' },
    url:       { type: 'string' },
  },
});

const fail = (message) => { console.error(`✖ ${message}`); process.exit(1); };

if (!process.env.FIRESTORE_EMULATOR_HOST) fail('FIRESTORE_EMULATOR_HOST is not set — this script only talks to the emulator.');
if (!values.payment) fail('--payment <mock payment id> is required.');
if (!MOCK_PAYMENT_OUTCOMES.includes(values.outcome)) fail(`--outcome must be one of ${MOCK_PAYMENT_OUTCOMES.join(', ')}.`);

const url = values.url ?? `http://127.0.0.1:5001/${values.project}/us-central1/recurrenteWebhook`;
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') fail(`Refusing to post to a non-local URL: ${url}`);

initializeApp({ projectId: values.project });
const db = getFirestore();

const payment = (await db.collection(PAYMENT_COLLECTIONS.mock.payments).doc(values.payment).get()).data();
if (!payment) fail(`Mock payment ${values.payment} not found.`);
if (!payment.providerCheckoutId) fail('Payment has no checkout id yet.');

const provider = new MockRecurrenteProvider({ store: new FirestoreMockGatewayStore(db) });
const event = await provider.settle(payment.providerCheckoutId, values.outcome);
const body = JSON.stringify(event);
const headers = signWebhookPayload(body, MOCK_WEBHOOK_SIGNING_SECRET);

const delaySeconds = Number(values.delay) || 0;
if (delaySeconds > 0) {
  console.log(`… waiting ${delaySeconds}s before delivering (delayed webhook)`);
  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
}

for (let attempt = 1; attempt <= (values.duplicate ? 2 : 1); attempt++) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  console.log(`delivery ${attempt}: ${event.event_type} → HTTP ${response.status} ${await response.text()}`);
}

const after = (await db.collection(PAYMENT_COLLECTIONS.mock.payments).doc(values.payment).get()).data();
console.log(`payment ${values.payment}: status=${after.status} mode=${after.mode} fulfilledAt=${after.fulfilledAt}`);

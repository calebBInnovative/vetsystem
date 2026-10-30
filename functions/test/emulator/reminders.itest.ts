// Runs against the Firestore emulator only — see `npm run test:emulator`.
import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runExpiryReminders, sendExpiryRemindersNow } from '../../src/billing/reminders';
import type { PushMessage } from '../../src/billing/push';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo- project.');
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

// 2026-10-29 15:00 in Managua
const NOW = Date.UTC(2026, 9, 29, 21);

describe('expiry reminders (emulator)', () => {
  const sent: { clinicId: string; message: PushMessage }[] = [];
  const send = async (clinicId: string, message: PushMessage) => { sent.push({ clinicId, message }); return { sent: 1, failed: 0 }; };

  before(async () => {
    const licenses: Record<string, object> = {
      'rem-tomorrow': { plan: 'Trial', expirationDate: '2026-10-30', subscription: true },
      'rem-in3':      { plan: 'monthly', expirationDate: '2026-11-01', subscription: true },
      'rem-in2':      { plan: 'monthly', expirationDate: '2026-10-31', subscription: true },
      'rem-far':      { plan: 'monthly', expirationDate: '2026-12-31', subscription: true },
      'rem-grace':    { plan: 'Trial', expirationDate: '2026-10-30', subscription: true, graceUntil: NOW + 86_400_000 },
      'rem-paused':   { plan: 'Trial', expirationDate: '2026-10-30', subscription: false },
    };
    for (const [id, data] of Object.entries(licenses)) await db.doc(`clinics/${id}/license/data`).set(data);
  });

  it('notifies only clinics 3 days, 1 day or 0 days from expiring', async () => {
    const results = await runExpiryReminders(db, send, NOW);
    const notified = sent.map((s) => s.clinicId).sort();
    assert.deepEqual(notified.filter((id) => id.startsWith('rem-')), ['rem-in3', 'rem-tomorrow']);
    assert.equal(sent.find((s) => s.clinicId === 'rem-tomorrow')?.message.title, 'Tu prueba gratis de VetSystem vence mañana');
    assert.equal(results.find((r) => r.clinicId === 'rem-grace')?.skipped, 'in-grace');
    assert.equal(results.find((r) => r.clinicId === 'rem-paused')?.skipped, 'suspended');
  });

  it('never sends the same reminder twice for the same expiration', async () => {
    sent.length = 0;
    const results = await runExpiryReminders(db, send, NOW + 3_600_000);
    assert.equal(sent.filter((s) => s.clinicId.startsWith('rem-')).length, 0);
    assert.equal(results.find((r) => r.clinicId === 'rem-tomorrow')?.skipped, 'already-sent');
  });

  it('the owner can send a reminder on demand, even if one already went out', async () => {
    sent.length = 0;
    const results = await sendExpiryRemindersNow(db, ['rem-tomorrow', 'rem-far'], send, NOW);
    assert.deepEqual(sent.map((s) => s.clinicId), ['rem-tomorrow']);
    assert.equal(results.find((r) => r.clinicId === 'rem-far')?.skipped, 'no-reminder');
  });
});

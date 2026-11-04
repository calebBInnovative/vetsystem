// Runs against the Firestore emulator only — see `npm run test:emulator`.
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { RegistrationError, registerClinic } from '../../src/clinics/clinic.registration';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo- project.');
}

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const NOW = Date.UTC(2026, 9, 20);

describe('registerClinic (emulator)', () => {
  it('creates the clinic, a 7-day trial license and an admin user', async () => {
    const result = await registerClinic(db, {
      uid: 'reg-owner-1', email: 'owner@example.com', clinicName: 'Clínica Norte', userName: 'Ana', phone: '8888-0000',
    }, { now: NOW });

    assert.deepEqual(result, { clinicId: 'clinica-norte', created: true });
    const license = (await db.doc('clinics/clinica-norte/license/data').get()).data();
    assert.equal(license?.plan, 'Trial');
    assert.equal(license?.expirationDate, '2026-10-27');
    assert.equal(license?.subscription, true);
    const user = (await db.doc('users/reg-owner-1').get()).data();
    assert.equal(user?.role, 'admin');
    assert.equal(user?.clinicId, 'clinica-norte');
  });

  it('never reuses an existing clinic id, so a name collision cannot take over a clinic', async () => {
    const result = await registerClinic(db, {
      uid: 'reg-owner-2', email: 'other@example.com', clinicName: 'Clinica Norte', userName: 'Luis',
    }, { now: NOW, randomSuffix: () => 'x1y2' });

    assert.deepEqual(result, { clinicId: 'clinica-norte-x1y2', created: true });
    const original = (await db.doc('clinics/clinica-norte').get()).data();
    assert.equal(original?.ownerUid, 'reg-owner-1');
  });

  it('is idempotent per user and writes nothing for an existing profile', async () => {
    await db.doc('clinics/clinica-norte/license/data').update({ expirationDate: '2026-10-21' });
    const result = await registerClinic(db, {
      uid: 'reg-owner-1', email: 'owner@example.com', clinicName: 'Otra Clínica', userName: 'Ana',
    }, { now: NOW });

    assert.deepEqual(result, { clinicId: 'clinica-norte', created: false });
    const license = (await db.doc('clinics/clinica-norte/license/data').get()).data();
    assert.equal(license?.expirationDate, '2026-10-21', 'a second call must not grant a new trial');
    assert.equal((await db.doc('clinics/otra-clinica').get()).exists, false);
  });

  // Uses the catalog as the other suites leave it (they share platform/plans): never write it here.
  it('a trial of the chosen plan carries that plan\'s limits from the catalog', async () => {
    await registerClinic(db, {
      uid: 'reg-owner-plan', email: 'plan@example.com', clinicName: 'Clínica Plan', userName: 'P', planId: 'basic',
    }, { now: NOW });
    const license = (await db.doc('clinics/clinica-plan/license/data').get()).data();
    assert.equal(license?.plan, 'Trial');
    assert.equal(license?.trialPlan, 'basic');
    assert.equal(license?.limits?.maxBranches, 1);
    assert.ok(Array.isArray(license?.limits?.modules));
    assert.equal(license?.expirationDate, '2026-10-27');
  });

  it('ignores an unknown plan and keeps the default trial', async () => {
    await registerClinic(db, {
      uid: 'reg-owner-bad', email: 'bad@example.com', clinicName: 'Clínica Rara', userName: 'R', planId: 'enterprise',
    }, { now: NOW });
    const license = (await db.doc('clinics/clinica-rara/license/data').get()).data();
    assert.equal(license?.trialPlan, undefined);
    assert.equal(license?.limits, undefined);
  });

  it('refuses the reserved demo id', async () => {
    const result = await registerClinic(db, {
      uid: 'reg-owner-3', email: 'demo@example.com', clinicName: 'Demo', userName: 'D',
    }, { now: NOW, randomSuffix: () => 'abcd' });
    assert.equal(result.clinicId, 'demo-abcd');
  });

  it('rejects a missing clinic name', async () => {
    await assert.rejects(
      registerClinic(db, { uid: 'reg-owner-4', email: null, clinicName: '   ', userName: 'X' }),
      (err: unknown) => err instanceof RegistrationError && err.code === 'invalid-argument',
    );
  });
});

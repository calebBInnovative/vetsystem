// Firestore security rules tests. Run with `npm run test:rules` (Firestore emulator).
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const PLATFORM_OWNER_EMAIL = 'calebgtnbacon@gmail.com';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vetsystem-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'clinics/clinic-a'), { name: 'Clinic A' });
    await setDoc(doc(db, 'clinics/clinic-a/license/data'), {
      clinicName: 'Clinic A', plan: 'Trial', expirationDate: '2026-10-21', subscription: true,
    });
    await setDoc(doc(db, 'clinics/clinic-b'), { name: 'Clinic B' });
    await setDoc(doc(db, 'users/owner-a'),   { uid: 'owner-a', clinicId: 'clinic-a', role: 'admin', permissions: null, name: 'Owner' });
    await setDoc(doc(db, 'users/recep-a'),   { uid: 'recep-a', clinicId: 'clinic-a', role: 'reception', permissions: {}, name: 'Recep' });
    await setDoc(doc(db, 'users/platform'),  { uid: 'platform', clinicId: 'clinic-p', role: 'master', permissions: null, name: 'Platform' });
  });
});

const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();

describe('license', () => {
  it('clinic members can read their license', async () => {
    await assertSucceeds(getDoc(doc(as('recep-a'), 'clinics/clinic-a/license/data')));
  });

  it('a clinic owner cannot extend the expiration date', async () => {
    await assertFails(updateDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { expirationDate: '2099-01-01' }));
  });

  it('reception cannot write the license through the clinic-data wildcard', async () => {
    await assertFails(setDoc(doc(as('recep-a'), 'clinics/clinic-a/license/data'), { expirationDate: '2099-01-01' }, { merge: true }));
  });

  it('a clinic owner cannot re-enable a paused subscription', async () => {
    await assertFails(updateDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { subscription: true, plan: 'Pro' }));
  });

  it('a clinic owner can keep the license clinic name in sync', async () => {
    await assertSucceeds(setDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { clinicName: 'Clinic A2' }, { merge: true }));
  });

  it('a client cannot create a license for a new clinic', async () => {
    await assertFails(setDoc(doc(as('owner-a'), 'clinics/clinic-a/license/other'), { expirationDate: '2099-01-01' }));
  });

  it('the platform owner can edit any license', async () => {
    await assertSucceeds(updateDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'clinics/clinic-a/license/data'), { expirationDate: '2026-12-01' }));
  });
});

describe('users', () => {
  it('a user can edit their own name and keep the same role', async () => {
    await assertSucceeds(setDoc(doc(as('recep-a'), 'users/recep-a'),
      { name: 'Nuevo', role: 'reception', permissions: {}, phone: '8888' }, { merge: true }));
  });

  it('a user can record their last access', async () => {
    await assertSucceeds(setDoc(doc(as('recep-a'), 'users/recep-a'), { lastAccess: 1 }, { merge: true }));
  });

  it('a user cannot promote themselves', async () => {
    await assertFails(updateDoc(doc(as('recep-a'), 'users/recep-a'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('owner-a'), 'users/owner-a'), { role: 'master' }));
  });

  it('a user cannot move themselves to another clinic', async () => {
    await assertFails(updateDoc(doc(as('owner-a'), 'users/owner-a'), { clinicId: 'clinic-b' }));
  });

  it('nobody can create their own profile (registration goes through the function)', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { uid: 'newbie', clinicId: 'clinic-a', role: 'admin' }));
  });

  it('a clinic admin can add and edit staff in their own clinic', async () => {
    const db = as('owner-a');
    await assertSucceeds(setDoc(doc(db, 'users/vet-a'), { uid: 'vet-a', clinicId: 'clinic-a', role: 'veterinarian' }));
    await assertSucceeds(updateDoc(doc(db, 'users/recep-a'), { role: 'veterinarian' }));
    await assertSucceeds(deleteDoc(doc(db, 'users/recep-a')));
  });

  it('a clinic admin cannot grant master or add users to another clinic', async () => {
    const db = as('owner-a');
    await assertFails(setDoc(doc(db, 'users/x'), { uid: 'x', clinicId: 'clinic-a', role: 'master' }));
    await assertFails(updateDoc(doc(db, 'users/recep-a'), { role: 'master' }));
    await assertFails(setDoc(doc(db, 'users/y'), { uid: 'y', clinicId: 'clinic-b', role: 'reception' }));
    await assertFails(updateDoc(doc(db, 'users/recep-a'), { clinicId: 'clinic-b' }));
  });
});

describe('clinic data', () => {
  it('members still write regular clinic data', async () => {
    await assertSucceeds(setDoc(doc(as('recep-a'), 'clinics/clinic-a/patients/p1'), { name: 'Firulais' }));
  });

  it('members cannot touch another clinic', async () => {
    await assertFails(setDoc(doc(as('recep-a'), 'clinics/clinic-b/patients/p1'), { name: 'X' }));
  });

  it('a batch cannot slip a license change in with other writes', async () => {
    const db = as('owner-a');
    const batch = writeBatch(db);
    batch.set(doc(db, 'clinics/clinic-a/patients/p2'), { name: 'Michi' });
    batch.set(doc(db, 'clinics/clinic-a/license/data'), { expirationDate: '2099-01-01' }, { merge: true });
    await assertFails(batch.commit());
  });
});

describe('payments', () => {
  it('clients cannot read or write payment records', async () => {
    await assertFails(getDoc(doc(as('owner-a'), 'payments/any')));
    await assertFails(setDoc(doc(as('owner-a'), 'payments/any'), { status: 'paid' }));
  });
});

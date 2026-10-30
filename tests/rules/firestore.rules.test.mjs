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

  it('the platform owner can schedule a billing notice', async () => {
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'clinics/clinic-a/license/data'),
      { billingNotice: { at: 1, blocking: true } }, { merge: true }));
  });

  it('a clinic cannot remove its own billing notice', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'clinics/clinic-a/license/data'),
      { billingNotice: { at: 1, blocking: true } }, { merge: true }));
    await assertFails(setDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { billingNotice: null }, { merge: true }));
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

describe('manual payments', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'platform/billing'), { methods: [], prices: { USD: 20 } });
      await setDoc(doc(db, 'subscriptionInvoices/inv-a'), { clinicId: 'clinic-a', status: 'pending' });
      await setDoc(doc(db, 'subscriptionInvoices/inv-b'), { clinicId: 'clinic-b', status: 'pending' });
    });
  });

  it('clinics read payment instructions but cannot change them', async () => {
    await assertSucceeds(getDoc(doc(as('recep-a'), 'platform/billing')));
    await assertFails(setDoc(doc(as('owner-a'), 'platform/billing'), { prices: { USD: 1 } }));
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'platform/billing'), { prices: { USD: 20 } }, { merge: true }));
  });

  it('clinics read the plan catalog but only the platform owner sets prices and limits', async () => {
    await assertSucceeds(getDoc(doc(as('recep-a'), 'platform/plans')));
    await assertFails(setDoc(doc(as('owner-a'), 'platform/plans'), { plans: { basic: { prices: { USD: { monthly: 1 } } } } }));
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'platform/plans'), { plans: {} }));
  });

  it('a clinic manager cannot raise its own plan limits', async () => {
    await assertFails(setDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { limits: { maxUsers: 999 } }, { merge: true }));
  });

  it('a clinic reads only its own invoices and can never write one', async () => {
    await assertSucceeds(getDoc(doc(as('owner-a'), 'subscriptionInvoices/inv-a')));
    await assertFails(getDoc(doc(as('owner-a'), 'subscriptionInvoices/inv-b')));
    await assertFails(setDoc(doc(as('owner-a'), 'subscriptionInvoices/new'), { clinicId: 'clinic-a', status: 'confirmed' }));
    await assertFails(updateDoc(doc(as('owner-a'), 'subscriptionInvoices/inv-a'), { status: 'confirmed' }));
  });

  it('the platform owner reads every invoice but confirms only through the function', async () => {
    const owner = as('platform', PLATFORM_OWNER_EMAIL);
    await assertSucceeds(getDoc(doc(owner, 'subscriptionInvoices/inv-b')));
    await assertFails(updateDoc(doc(owner, 'subscriptionInvoices/inv-b'), { status: 'confirmed' }));
  });

  it('only the platform owner manages push tokens', async () => {
    await assertFails(setDoc(doc(as('owner-a'), 'platformPushTokens/t1'), { at: 1 }));
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'platformPushTokens/t1'), { at: 1 }));
  });

  it('a clinic cannot grant itself a grace period', async () => {
    await assertFails(setDoc(doc(as('owner-a'), 'clinics/clinic-a/license/data'), { graceUntil: 9e12 }, { merge: true }));
  });
});

describe('clinic push tokens', () => {
  it('a user registers their own device for their own clinic only', async () => {
    const db = as('recep-a');
    await assertSucceeds(setDoc(doc(db, 'clinicPushTokens/tok-1'), { uid: 'recep-a', clinicId: 'clinic-a' }));
    await assertFails(setDoc(doc(db, 'clinicPushTokens/tok-2'), { uid: 'recep-a', clinicId: 'clinic-b' }));
    await assertFails(setDoc(doc(db, 'clinicPushTokens/tok-3'), { uid: 'owner-a', clinicId: 'clinic-a' }));
  });

  it("nobody reads another user's device token", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'clinicPushTokens/tok-x'), { uid: 'owner-a', clinicId: 'clinic-a' }));
    await assertFails(getDoc(doc(as('recep-a'), 'clinicPushTokens/tok-x')));
    await assertSucceeds(getDoc(doc(as('owner-a'), 'clinicPushTokens/tok-x')));
  });
});


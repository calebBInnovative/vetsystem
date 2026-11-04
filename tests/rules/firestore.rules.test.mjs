// Firestore security rules tests. Run with `npm run test:rules` (Firestore emulator).
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

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

describe('clinic boundaries', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/owner-b'), { uid: 'owner-b', clinicId: 'clinic-b', role: 'admin', permissions: null, name: 'Owner B', email: 'b@clinic-b.test' });
      await setDoc(doc(db, 'users/vet-a-fin'), { uid: 'vet-a-fin', clinicId: 'clinic-a', role: 'veterinarian', permissions: { finances: true }, name: 'Vet' });
      await setDoc(doc(db, 'clinics/clinic-a/fixedExpenses/rent'), { clinicId: 'clinic-a', name: 'Alquiler' });
      await setDoc(doc(db, 'clinics/clinic-a/patients/p1'), { clinicId: 'clinic-a', name: 'Luna' });
    });
  });

  it("a manager lists their own clinic's users but cannot read another clinic's", async () => {
    await assertSucceeds(getDocs(query(collection(as('owner-a'), 'users'), where('clinicId', '==', 'clinic-a'))));
    await assertFails(getDoc(doc(as('owner-a'), 'users/owner-b')));
    await assertFails(getDocs(collection(as('owner-a'), 'users')));
    await assertFails(getDocs(query(collection(as('owner-a'), 'users'), where('clinicId', '==', 'clinic-b'))));
  });

  it('only managers create branches, and staff cannot reassign their own branches', async () => {
    await assertSucceeds(setDoc(doc(as('owner-a'), 'clinics/clinic-a/branches/sur'), { clinicId: 'clinic-a', name: 'Sur', code: 'SUR', active: true }));
    await assertFails(setDoc(doc(as('recep-a'), 'clinics/clinic-a/branches/norte'), { clinicId: 'clinic-a', name: 'Norte', code: 'NOR', active: true }));
    await assertSucceeds(getDoc(doc(as('recep-a'), 'clinics/clinic-a/branches/sur')));
    await assertFails(updateDoc(doc(as('recep-a'), 'users/recep-a'), { branchIds: ['main', 'sur'] }));
    await assertSucceeds(updateDoc(doc(as('owner-a'), 'users/recep-a'), { branchIds: ['sur'] }));
  });

  it('expenses and payroll need the Finanzas module', async () => {
    await assertFails(getDoc(doc(as('recep-a'), 'clinics/clinic-a/fixedExpenses/rent')));
    await assertFails(setDoc(doc(as('recep-a'), 'clinics/clinic-a/collaborators/c1'), { clinicId: 'clinic-a' }));
    await assertSucceeds(getDoc(doc(as('recep-a'), 'clinics/clinic-a/patients/p1')));
    await assertSucceeds(getDoc(doc(as('vet-a-fin'), 'clinics/clinic-a/fixedExpenses/rent')));
    await assertSucceeds(getDoc(doc(as('owner-a'), 'clinics/clinic-a/fixedExpenses/rent')));
    await assertSucceeds(setDoc(doc(as('owner-a'), 'clinics/clinic-a/collaborators/c1'), { clinicId: 'clinic-a' }));
  });
});

describe('branch isolation', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/recep-sur'), { uid: 'recep-sur', clinicId: 'clinic-a', role: 'reception', permissions: {}, branchIds: ['sur'], name: 'Recep Sur' });
      await setDoc(doc(db, 'clinics/clinic-a/sales/s-main'), { clinicId: 'clinic-a', branchId: 'main', total: 10 });
      await setDoc(doc(db, 'clinics/clinic-a/sales/s-legacy'), { clinicId: 'clinic-a', total: 5 });
      await setDoc(doc(db, 'clinics/clinic-a/sales/s-sur'), { clinicId: 'clinic-a', branchId: 'sur', total: 20 });
      await setDoc(doc(db, 'clinics/clinic-a/consultations/c-sur'), { clinicId: 'clinic-a', branchId: 'sur' });
    });
  });

  it('staff read only their branches; documents without one belong to the main branch', async () => {
    await assertSucceeds(getDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/s-sur')));
    await assertFails(getDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/s-main')));
    await assertFails(getDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/s-legacy')));
    await assertSucceeds(getDoc(doc(as('recep-a'), 'clinics/clinic-a/sales/s-legacy')));
    await assertFails(getDoc(doc(as('recep-a'), 'clinics/clinic-a/sales/s-sur')));
  });

  it('a staff sync query must ask for its own branches only', async () => {
    const sales = (who) => collection(as(who), 'clinics/clinic-a/sales');
    await assertSucceeds(getDocs(query(sales('recep-sur'), where('branchId', 'in', ['sur']))));
    await assertFails(getDocs(sales('recep-sur')));
    await assertFails(getDocs(query(sales('recep-sur'), where('branchId', 'in', ['sur', 'main']))));
    await assertSucceeds(getDocs(sales('owner-a')));
  });

  it('a sync page can hold far more than 10 documents (rules run per query, not per document)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const batch = writeBatch(ctx.firestore());
      for (let i = 0; i < 30; i++) {
        batch.set(doc(ctx.firestore(), `clinics/clinic-a/sales/bulk-${i}`), { clinicId: 'clinic-a', branchId: 'sur', total: i });
      }
      await batch.commit();
    });
    const sales = (who) => collection(as(who), 'clinics/clinic-a/sales');
    const staffPage = await assertSucceeds(getDocs(query(sales('recep-sur'), where('branchId', 'in', ['sur']))));
    assert.ok(staffPage.size > 10);
    const managerPage = await assertSucceeds(getDocs(sales('owner-a')));
    assert.ok(managerPage.size > 10);
  });

  it('staff write inside their branches and cannot move documents out of others', async () => {
    await assertSucceeds(setDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/n1'), { clinicId: 'clinic-a', branchId: 'sur', total: 1 }));
    await assertFails(setDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/n2'), { clinicId: 'clinic-a', branchId: 'main', total: 1 }));
    await assertFails(updateDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/s-main'), { branchId: 'sur' }));
    await assertFails(deleteDoc(doc(as('recep-sur'), 'clinics/clinic-a/sales/s-main')));
    await assertSucceeds(updateDoc(doc(as('owner-a'), 'clinics/clinic-a/sales/s-sur'), { total: 21 }));
  });

  it('the clinical history stays shared across branches', async () => {
    await assertSucceeds(getDoc(doc(as('recep-a'), 'clinics/clinic-a/consultations/c-sur')));
    await assertSucceeds(getDocs(collection(as('recep-a'), 'clinics/clinic-a/consultations')));
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

describe('branch managers', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/boss-sur'), { uid: 'boss-sur', clinicId: 'clinic-a', role: 'branch_manager', permissions: null, branchIds: ['sur'], name: 'Boss Sur' });
      await setDoc(doc(db, 'users/recep-sur'), { uid: 'recep-sur', clinicId: 'clinic-a', role: 'reception', permissions: {}, branchIds: ['sur'], name: 'Recep Sur' });
      await setDoc(doc(db, 'users/vet-both'), { uid: 'vet-both', clinicId: 'clinic-a', role: 'veterinarian', permissions: {}, branchIds: ['sur', 'main'], name: 'Vet' });
      await setDoc(doc(db, 'clinics/clinic-a/branches/sur'), { clinicId: 'clinic-a', name: 'Sur', code: 'SUR', active: true });
      await setDoc(doc(db, 'clinics/clinic-a/branches/main'), { clinicId: 'clinic-a', name: 'Principal', code: 'PRI', active: true });
      await setDoc(doc(db, 'clinics/clinic-a/sales/s-sur'), { clinicId: 'clinic-a', branchId: 'sur', total: 20 });
      await setDoc(doc(db, 'clinics/clinic-a/sales/s-main'), { clinicId: 'clinic-a', branchId: 'main', total: 10 });
      await setDoc(doc(db, 'clinics/clinic-a/fixedExpenses/rent-sur'), { clinicId: 'clinic-a', branchId: 'sur' });
    });
  });

  it('works in every module of their branch, finances included, and nowhere else', async () => {
    const db = as('boss-sur');
    await assertSucceeds(getDoc(doc(db, 'clinics/clinic-a/sales/s-sur')));
    await assertSucceeds(getDoc(doc(db, 'clinics/clinic-a/fixedExpenses/rent-sur')));
    await assertFails(getDoc(doc(db, 'clinics/clinic-a/sales/s-main')));
    await assertFails(setDoc(doc(db, 'clinics/clinic-a/sales/n1'), { clinicId: 'clinic-a', branchId: 'main', total: 1 }));
  });

  it('adds, edits and removes staff of their own branches only', async () => {
    const db = as('boss-sur');
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('clinicId', '==', 'clinic-a'))));
    await assertSucceeds(setDoc(doc(db, 'users/new-sur'), { uid: 'new-sur', clinicId: 'clinic-a', role: 'reception', branchIds: ['sur'] }));
    await assertSucceeds(updateDoc(doc(db, 'users/recep-sur'), { role: 'veterinarian', permissions: { sales: true } }));
    await assertSucceeds(deleteDoc(doc(db, 'users/new-sur')));
    // Not without a branch (= main), not in another branch, not to a staff of two branches
    await assertFails(setDoc(doc(db, 'users/x1'), { uid: 'x1', clinicId: 'clinic-a', role: 'reception' }));
    await assertFails(setDoc(doc(db, 'users/x2'), { uid: 'x2', clinicId: 'clinic-a', role: 'reception', branchIds: ['sur', 'main'] }));
    await assertFails(updateDoc(doc(db, 'users/recep-sur'), { branchIds: ['main'] }));
    await assertFails(updateDoc(doc(db, 'users/vet-both'), { name: 'Otro' }));
    await assertFails(deleteDoc(doc(db, 'users/recep-a')));
  });

  it('cannot hand out or touch manager roles', async () => {
    const db = as('boss-sur');
    await assertFails(setDoc(doc(db, 'users/x3'), { uid: 'x3', clinicId: 'clinic-a', role: 'branch_manager', branchIds: ['sur'] }));
    await assertFails(setDoc(doc(db, 'users/x4'), { uid: 'x4', clinicId: 'clinic-a', role: 'admin', branchIds: ['sur'] }));
    await assertFails(updateDoc(doc(db, 'users/recep-sur'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users/owner-a'), { name: 'X' }));
    await assertFails(updateDoc(doc(db, 'users/boss-sur'), { branchIds: ['sur', 'main'] }));
  });

  it('a clinic admin can name a branch manager', async () => {
    await assertSucceeds(updateDoc(doc(as('owner-a'), 'users/recep-sur'), { role: 'branch_manager', permissions: null }));
  });

  it('edits the name and contact of their own branch only', async () => {
    const db = as('boss-sur');
    // As the sync pushes it: the whole local row, merged, with the server timestamp
    await assertSucceeds(setDoc(doc(db, 'clinics/clinic-a/branches/sur'),
      { clinicId: 'clinic-a', name: 'Sur', code: 'SUR', active: true, address: 'Km 8', phone: '2222-3333', updatedAt: 1, _syncedAt: serverTimestamp() },
      { merge: true }));
    await assertFails(updateDoc(doc(db, 'clinics/clinic-a/branches/sur'), { code: 'XX' }));
    await assertFails(updateDoc(doc(db, 'clinics/clinic-a/branches/sur'), { active: false }));
    await assertFails(updateDoc(doc(db, 'clinics/clinic-a/branches/main'), { address: 'Otra' }));
    await assertFails(setDoc(doc(db, 'clinics/clinic-a/branches/norte'), { clinicId: 'clinic-a', name: 'Norte', code: 'NOR', active: true }));
    await assertFails(deleteDoc(doc(db, 'clinics/clinic-a/branches/sur')));
  });
});

describe('audit log', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/boss-sur'), { uid: 'boss-sur', clinicId: 'clinic-a', role: 'branch_manager', permissions: null, branchIds: ['sur'], name: 'Boss' });
      await setDoc(doc(db, 'users/recep-sur'), { uid: 'recep-sur', clinicId: 'clinic-a', role: 'reception', permissions: {}, branchIds: ['sur'], name: 'Recep Sur' });
      await setDoc(doc(db, 'clinics/clinic-a/auditLog/main-1'), { clinicId: 'clinic-a', branchId: 'main', userId: 'owner-a', action: 'stock.adjust' });
      await setDoc(doc(db, 'clinics/clinic-a/auditLog/sur-1'), { clinicId: 'clinic-a', branchId: 'sur', userId: 'recep-sur', action: 'quote.void' });
    });
  });
  const entry = (uid, branchId) => ({ clinicId: 'clinic-a', branchId, userId: uid, action: 'quote.void', summary: 'x', _syncedAt: serverTimestamp() });

  it('staff append their own entries in their branch, and cannot read the log', async () => {
    const db = as('recep-sur');
    await assertSucceeds(setDoc(doc(db, 'clinics/clinic-a/auditLog/n1'), entry('recep-sur', 'sur'), { merge: true }));
    await assertFails(setDoc(doc(db, 'clinics/clinic-a/auditLog/n2'), entry('owner-a', 'sur')));
    await assertFails(setDoc(doc(db, 'clinics/clinic-a/auditLog/n3'), entry('recep-sur', 'main')));
    await assertFails(getDoc(doc(db, 'clinics/clinic-a/auditLog/sur-1')));
  });

  it('nobody rewrites or deletes a line; a retried push only touches the timestamp', async () => {
    await assertFails(updateDoc(doc(as('recep-sur'), 'clinics/clinic-a/auditLog/sur-1'), { summary: 'otra cosa' }));
    await assertFails(deleteDoc(doc(as('recep-sur'), 'clinics/clinic-a/auditLog/sur-1')));
    await assertFails(deleteDoc(doc(as('owner-a'), 'clinics/clinic-a/auditLog/sur-1')));
    await assertFails(updateDoc(doc(as('owner-a'), 'clinics/clinic-a/auditLog/sur-1'), { summary: 'x' }));
    await assertSucceeds(updateDoc(doc(as('recep-sur'), 'clinics/clinic-a/auditLog/sur-1'), { _syncedAt: serverTimestamp() }));
  });

  it('managers read it; branch managers only their branches', async () => {
    await assertSucceeds(getDocs(collection(as('owner-a'), 'clinics/clinic-a/auditLog')));
    await assertSucceeds(getDocs(query(collection(as('boss-sur'), 'clinics/clinic-a/auditLog'), where('branchId', 'in', ['sur']))));
    await assertFails(getDoc(doc(as('boss-sur'), 'clinics/clinic-a/auditLog/main-1')));
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

  it('visitors read the public sales contact but only the platform owner sets it', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'platform/contact')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'platform/billing')));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'platform/contact'), { whatsapp: '1' }));
    await assertFails(setDoc(doc(as('owner-a'), 'platform/contact'), { whatsapp: '1' }));
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'platform/contact'), { whatsapp: '50588880000' }));
  });

  it('visitors read the landing content but only the platform owner edits it', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'platform/landing')));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'platform/landing'), { testimonials: [] }));
    await assertFails(setDoc(doc(as('owner-a'), 'platform/landing'), { testimonials: [] }));
    await assertSucceeds(setDoc(doc(as('platform', PLATFORM_OWNER_EMAIL), 'platform/landing'), { testimonials: [] }));
  });

  it('clinics read the plan catalog but only the platform owner sets prices and limits', async () => {
    await assertSucceeds(getDoc(doc(as('recep-a'), 'platform/plans')));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'platform/plans')));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'platform/plans'), { plans: {} }));
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


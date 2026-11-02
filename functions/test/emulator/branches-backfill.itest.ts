// Runs against the Firestore emulator only — see `npm run test:emulator`.
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { BACKFILL_STATE_PATH, backfillBranchIds } from '../../src/branches/backfill';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Refusing to run: needs FIRESTORE_EMULATOR_HOST and a demo- project.');
}

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const ts = (ms: number) => Timestamp.fromMillis(ms);

describe('backfillBranchIds (emulator)', () => {
  it('stamps the main branch where missing, keeps existing branches and timestamps', async () => {
    await db.doc(BACKFILL_STATE_PATH).delete();
    await db.doc('clinics/bf-clinic/sales/old').set({ total: 10, updatedAt: 1, _syncedAt: ts(1_000) });
    await db.doc('clinics/bf-clinic/sales/sur').set({ total: 20, branchId: 'sur', updatedAt: 2, _syncedAt: ts(2_000) });
    await db.doc('clinics/bf-clinic/patients/p1').set({ name: 'Luna', _syncedAt: ts(1_000) });

    const first = await backfillBranchIds(db, ts(10_000_000));
    assert.equal(first.since, null);
    assert.ok(first.updated >= 1);

    const old = (await db.doc('clinics/bf-clinic/sales/old').get()).data();
    assert.equal(old?.branchId, 'main');
    assert.equal(old?.updatedAt, 1);
    assert.equal((old?._syncedAt as Timestamp).toMillis(), 1_000);
    assert.equal((await db.doc('clinics/bf-clinic/sales/sur').get()).get('branchId'), 'sur');
    assert.equal((await db.doc('clinics/bf-clinic/patients/p1').get()).get('branchId'), undefined, 'shared collections untouched');
  });

  it('then only looks at documents pushed since the last run', async () => {
    await db.doc('clinics/bf-clinic/sales/late').set({ total: 5, updatedAt: 3, _syncedAt: ts(20_000_000) });
    await db.doc('clinics/bf-clinic/sales/older-missed').set({ total: 6, updatedAt: 3, _syncedAt: ts(5_000) });

    const second = await backfillBranchIds(db, ts(30_000_000));
    assert.notEqual(second.since, null);
    assert.equal((await db.doc('clinics/bf-clinic/sales/late').get()).get('branchId'), 'main');
    // Older than the last run: an incremental pass does not rescan it.
    assert.equal((await db.doc('clinics/bf-clinic/sales/older-missed').get()).get('branchId'), undefined);
  });
});

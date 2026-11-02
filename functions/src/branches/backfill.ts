import { Timestamp, type Firestore } from 'firebase-admin/firestore';

/**
 * Branch-scoped collections (mirrors BRANCH_SCOPED_TABLES in src/lib/db/database.ts).
 * Documents written before branches existed — or by an app version that does
 * not know them — lack `branchId`. Firestore cannot query a missing field, so a
 * staff device asking `where('branchId', 'in', [...])` would never receive them.
 * The backfill stores the main branch on them, which is what every client
 * already assumes for a document without one.
 */
export const BRANCH_SCOPED_COLLECTIONS = [
  'products', 'movements', 'sales', 'payments', 'invoices', 'appointments', 'quotes',
  'consultations', 'fixedExpenses', 'expensePayments', 'collaborators', 'collaboratorPayments',
] as const;

export const MAIN_BRANCH_ID = 'main';
export const BACKFILL_STATE_PATH = 'platform/branchBackfill';

const BATCH_LIMIT = 400;

export interface BackfillResult {
  clinics: number;
  scanned: number;
  updated: number;
  /** null = full scan (first run) */
  since: number | null;
}

/**
 * Sets branchId = 'main' on branch-scoped documents that lack it. The first run
 * scans everything; later runs only documents pushed since the previous run
 * (`_syncedAt`), so it stays cheap. updatedAt and _syncedAt are left untouched:
 * clients already treat these documents as the main branch's.
 */
export async function backfillBranchIds(db: Firestore, now: Timestamp = Timestamp.now()): Promise<BackfillResult> {
  const stateRef = db.doc(BACKFILL_STATE_PATH);
  const lastRunAt = (await stateRef.get()).get('lastRunAt') as Timestamp | undefined;
  // Small overlap so a write landing during the previous run is not skipped.
  const since = lastRunAt ? Timestamp.fromMillis(lastRunAt.toMillis() - 5 * 60_000) : null;

  const clinics = await db.collection('clinics').listDocuments();
  let scanned = 0;
  let updated = 0;

  for (const clinic of clinics) {
    for (const name of BRANCH_SCOPED_COLLECTIONS) {
      const col = clinic.collection(name);
      const snap = since ? await col.where('_syncedAt', '>', since).get() : await col.get();
      scanned += snap.size;
      let batch = db.batch();
      let pending = 0;
      for (const doc of snap.docs) {
        if (doc.get('branchId')) continue;
        batch.update(doc.ref, { branchId: MAIN_BRANCH_ID });
        pending++;
        updated++;
        if (pending === BATCH_LIMIT) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
      if (pending > 0) await batch.commit();
    }
  }

  await stateRef.set({ lastRunAt: now, lastResult: { clinics: clinics.length, scanned, updated } }, { merge: true });
  return { clinics: clinics.length, scanned, updated, since: since ? since.toMillis() : null };
}

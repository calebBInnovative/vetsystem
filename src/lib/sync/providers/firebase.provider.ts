import {
  doc,
  setDoc,
  collection as firestoreCollection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';
import type { SyncProvider, RemoteDoc } from '@/lib/sync/sync.provider';

/** How far back a first pull reaches for transactional collections. */
const INITIAL_PULL_WINDOW_DAYS = 365;

/**
 * Collections whose history can be capped on a first pull. Everything else is
 * catalog data the UI needs in full — the app reads only from the local DB, so
 * a patient or product that was not downloaded simply does not exist for the user.
 */
const WINDOWED_COLLECTIONS = new Set([
  'sales', 'payments', 'invoices', 'consultations', 'appointments', 'movements',
  'expensePayments', 'collaboratorPayments', 'quotes',
]);

/**
 * SyncProvider implementation using Firestore.
 *
 * Firestore structure:
 *   clinics/{clinicId}/{collection}/{documentId}
 */
export class FirebaseSyncProvider implements SyncProvider {
  readonly name = 'firebase';

  private db: Firestore | null = null;

  constructor(_clinicId: string) {}

  private getDb(): Firestore {
    if (!this.db) this.db = getFirestoreDb();
    return this.db;
  }

  private colRef(collectionName: string, clinicId: string) {
    return firestoreCollection(this.getDb(), 'clinics', clinicId, collectionName);
  }

  async push(collectionName: string, id: string, data: object, clinicId: string): Promise<void> {
    // Firestore rejects undefined values — strip them before sending
    const clean = JSON.parse(JSON.stringify(data));
    const ref = doc(this.colRef(collectionName, clinicId), id);
    await setDoc(ref, { ...clean, _syncedAt: serverTimestamp() }, { merge: true });
  }

  async pull(
    collectionName: string,
    since: number,
    clinicId: string,
    fullHistory = false,
  ): Promise<RemoteDoc[]> {
    // Query by _syncedAt (server-set timestamp). This guarantees we catch documents
    // regardless of when they were originally created on the client device.
    // Rules use 1 get() per list evaluation — well within the 10-read limit.
    const sinceTimestamp = Timestamp.fromMillis(since);
    const BATCH_SIZE = 9;
    const results: RemoteDoc[] = [];
    const seen = new Set<string>();
    let lastDoc: QueryDocumentSnapshot | null = null;

    // Primary query: documents with _syncedAt > cursor
    do {
      const constraints: QueryConstraint[] = [
        where('_syncedAt', '>', sinceTimestamp),
        orderBy('_syncedAt', 'asc'),
        limit(BATCH_SIZE),
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(this.colRef(collectionName, clinicId), ...constraints));
      for (const d of snap.docs) {
        seen.add(d.id);
        results.push({ id: d.id, ...d.data() } as RemoteDoc);
      }
      lastDoc = snap.size === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : null;
    } while (lastDoc !== null);

    // Fallback for first-ever pull (since === 0): also fetch documents that were
    // pushed to Firestore before the _syncedAt field was added (legacy data without it).
    if (since === 0 && results.length === 0) {
      // A first pull is the single most expensive operation in the system: it is
      // one read per document, repeated on every new browser, every cleared
      // cache and every new device. Transactional history is capped to a recent
      // window; the user can still pull everything on demand with forcePull().
      const windowed = !fullHistory && WINDOWED_COLLECTIONS.has(collectionName);
      const cutoff   = Date.now() - INITIAL_PULL_WINDOW_DAYS * 86_400_000;

      let lastFallbackDoc: QueryDocumentSnapshot | null = null;
      do {
        const constraints: QueryConstraint[] = windowed
          ? [where('updatedAt', '>=', cutoff), orderBy('updatedAt', 'asc'), limit(BATCH_SIZE)]
          : [limit(BATCH_SIZE)];
        if (lastFallbackDoc) constraints.push(startAfter(lastFallbackDoc));
        const snap = await getDocs(query(this.colRef(collectionName, clinicId), ...constraints));
        for (const d of snap.docs) {
          if (!seen.has(d.id)) results.push({ id: d.id, ...d.data() } as RemoteDoc);
        }
        lastFallbackDoc = snap.size === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : null;
      } while (lastFallbackDoc !== null);

      if (windowed) {
        console.log(`[sync] ${collectionName}: first pull limited to the last ${INITIAL_PULL_WINDOW_DAYS} days`);
      }
    }

    return results;
  }

  subscribe(
    collectionName: string,
    since: number,
    clinicId: string,
    onChange: (docs: RemoteDoc[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    // Only listen for documents pushed AFTER `since` (the pull cursor).
    // On open: 1 read + 0 docs if pullAll just ran. Going forward: 1 read per
    // changed doc. Idle with no activity: 0 reads.
    const sinceTs = Timestamp.fromMillis(since);
    const q = query(
      this.colRef(collectionName, clinicId),
      where('_syncedAt', '>', sinceTs),
      orderBy('_syncedAt', 'asc'),
    );

    // includeMetadataChanges: false → skip hasPendingWrites transient state,
    // only react to server-confirmed writes from other devices.
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const changed = snap
          .docChanges()
          .filter((c) => c.type === 'added' || c.type === 'modified')
          .map((c) => ({ id: c.doc.id, ...c.doc.data() }) as RemoteDoc);
        if (changed.length > 0) onChange(changed);
      },
      (err) => {
        console.error(`[sync] onSnapshot ${collectionName} error:`, err.message);
        onError?.(err);
      },
    );

    return unsub;
  }
}

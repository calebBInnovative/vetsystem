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

  async pull(collectionName: string, since: number, clinicId: string): Promise<RemoteDoc[]> {
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
      // Get ALL documents in the collection for this clinic (no _syncedAt filter)
      let lastFallbackDoc: QueryDocumentSnapshot | null = null;
      do {
        const constraints: QueryConstraint[] = [limit(BATCH_SIZE)];
        if (lastFallbackDoc) constraints.push(startAfter(lastFallbackDoc));
        const snap = await getDocs(query(this.colRef(collectionName, clinicId), ...constraints));
        for (const d of snap.docs) {
          if (!seen.has(d.id)) results.push({ id: d.id, ...d.data() } as RemoteDoc);
        }
        lastFallbackDoc = snap.size === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : null;
      } while (lastFallbackDoc !== null);
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

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Query by _syncedAt (server-set timestamp) instead of updatedAt (app-set timestamp).
    // This ensures documents pushed to Firestore for the first time are visible to all
    // other clients regardless of when they were originally created — their updatedAt
    // could be months old and would never be returned by a cursor based on updatedAt.
    const sinceTimestamp = Timestamp.fromMillis(since);
    // Simplified rules use 1 read per doc evaluation; batch of 9 stays under the 10-read limit.
    const BATCH_SIZE = 9;
    const results: RemoteDoc[] = [];
    let lastDoc: QueryDocumentSnapshot | null = null;

    do {
      const constraints: QueryConstraint[] = [
        where('_syncedAt', '>', sinceTimestamp),
        orderBy('_syncedAt', 'asc'),
        limit(BATCH_SIZE),
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(this.colRef(collectionName, clinicId), ...constraints));
      results.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc));

      lastDoc = snap.size === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : null;
    } while (lastDoc !== null);

    return results;
  }

  subscribe(
    collectionName: string,
    clinicId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void {
    const q = query(this.colRef(collectionName, clinicId));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc);
      onChange(docs);
    });
    return unsub;
  }
}

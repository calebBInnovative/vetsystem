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

  private readonly clinicId: string;
  private db: Firestore | null = null;

  constructor(clinicId: string) {
    this.clinicId = clinicId;
  }

  private getDb(): Firestore {
    if (!this.db) this.db = getFirestoreDb();
    return this.db;
  }

  private colRef(collectionName: string) {
    return firestoreCollection(this.getDb(), 'clinics', this.clinicId, collectionName);
  }

  async push(collectionName: string, id: string, data: object): Promise<void> {
    // Firestore rejects undefined values — strip them before sending
    const clean = JSON.parse(JSON.stringify(data));
    const ref = doc(this.colRef(collectionName), id);
    await setDoc(ref, { ...clean, _syncedAt: serverTimestamp() }, { merge: true });
  }

  async pull(collectionName: string, since: number): Promise<RemoteDoc[]> {
    // Firestore allows at most 10 external document reads per list-query request.
    // With 1 cross-document read per security-rule evaluation (userRef().data.clinicId),
    // a batch of 9 documents uses 9 of the 10 allowed reads — safely within the limit.
    // Batching also avoids timeouts on large initial syncs.
    const BATCH_SIZE = 9;
    const results: RemoteDoc[] = [];
    let lastDoc: QueryDocumentSnapshot | null = null;

    do {
      const constraints: QueryConstraint[] = [
        where('updatedAt', '>', since),
        orderBy('updatedAt', 'asc'),
        limit(BATCH_SIZE),
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(this.colRef(collectionName), ...constraints));
      results.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc));

      lastDoc = snap.size === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : null;
    } while (lastDoc !== null);

    return results;
  }

  subscribe(
    collectionName: string,
    _clinicId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void {
    const q = query(this.colRef(collectionName));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc);
      onChange(docs);
    });
    return unsub;
  }
}

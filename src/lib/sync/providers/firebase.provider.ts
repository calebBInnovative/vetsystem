import {
  doc,
  setDoc,
  collection as firestoreCollection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Firestore,
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
    const q = query(
      this.colRef(collectionName),
      where('updatedAt', '>', since),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc);
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

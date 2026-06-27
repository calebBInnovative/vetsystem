import {
  doc,
  setDoc,
  collection,
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
 * Implementación de SyncProvider usando Firestore.
 *
 * Estructura en Firestore:
 *   clinics/{clinicId}/{coleccion}/{documentoId}
 *
 * Cada documento incluye todos los campos del modelo local
 * más `_syncedAt` (timestamp del servidor) para resolver conflictos.
 */
export class FirebaseSyncProvider implements SyncProvider {
  readonly nombre = 'firebase';

  private readonly clinicaId: string;
  private db: Firestore | null = null;

  constructor(clinicaId: string) {
    this.clinicaId = clinicaId;
  }

  private getDb(): Firestore {
    if (!this.db) this.db = getFirestoreDb();
    return this.db;
  }

  private colRef(coleccion: string) {
    return collection(this.getDb(), 'clinics', this.clinicaId, coleccion);
  }

  async push(coleccion: string, id: string, datos: object): Promise<void> {
    // Firestore rejects undefined values — strip them before sending
    const clean = JSON.parse(JSON.stringify(datos));
    const ref = doc(this.colRef(coleccion), id);
    await setDoc(ref, { ...clean, _syncedAt: serverTimestamp() }, { merge: true });
  }

  async pull(coleccion: string, desde: number): Promise<RemoteDoc[]> {
    const q = query(
      this.colRef(coleccion),
      where('updatedAt', '>', desde),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc);
  }

  subscribe(
    coleccion: string,
    _clinicaId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void {
    const q = query(this.colRef(coleccion));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteDoc);
      onChange(docs);
    });
    return unsub;
  }
}

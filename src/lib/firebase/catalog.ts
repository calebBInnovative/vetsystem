import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase.config';
import type { CatalogProduct } from '@/types/catalog';

const COLLECTION = 'publicCatalog';

export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const db = getFirestoreDb();
  const q = query(collection(db, COLLECTION), orderBy('supplier'), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CatalogProduct));
}

export async function addCatalogProduct(
  data: Omit<CatalogProduct, 'id'>
): Promise<string> {
  const db = getFirestoreDb();
  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

export async function updateCatalogProduct(
  id: string,
  data: Partial<Omit<CatalogProduct, 'id'>>
): Promise<void> {
  const db = getFirestoreDb();
  await updateDoc(doc(db, COLLECTION, id), { ...data, updatedAt: Date.now() });
}

export async function deleteCatalogProduct(id: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, COLLECTION, id));
}

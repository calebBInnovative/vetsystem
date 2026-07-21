import {
  doc, getDoc, setDoc, getDocs, writeBatch,
  collection as firestoreCol,
  type Firestore,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';
import { db } from '@/lib/db/database';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEMO_CLINIC_ID = 'demo';

const LS_VERSION_KEY = 'demo_snapshot_ver';

// Tables included in demo snapshots, in dependency order (parents before children).
const DEMO_TABLES = [
  'owners', 'patients', 'services', 'products', 'movements',
  'appointments', 'consultations', 'payments', 'invoices', 'sales',
  'fixedExpenses', 'expensePayments', 'collaborators', 'collaboratorPayments',
  'promotions',
] as const;

type DemoTable = typeof DEMO_TABLES[number];

// ─── Firestore path helpers ───────────────────────────────────────────────────

function clinicCol(fsdb: Firestore, table: DemoTable) {
  return firestoreCol(fsdb, 'clinics', DEMO_CLINIC_ID, table);
}

function sourceClinicCol(fsdb: Firestore, clinicId: string, table: DemoTable) {
  return firestoreCol(fsdb, 'clinics', clinicId, table);
}

// When NEXT_PUBLIC_FIRESTORE_DIRECT=true the publish step reads from
// clinics/{sourceClinicId}/ in Firestore instead of Dexie.
// Use this to verify whether data is actually in Firebase after a sync,
// bypassing IndexedDB entirely.
const FIRESTORE_DIRECT = process.env.NEXT_PUBLIC_FIRESTORE_DIRECT === 'true';

// ─── Dexie read/write helpers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readTable(table: DemoTable, clinicId: string): Promise<any[]> {
  switch (table) {
    case 'owners':              return db.owners.where('clinicId').equals(clinicId).toArray();
    case 'patients':            return db.patients.where('clinicId').equals(clinicId).toArray();
    case 'services':            return db.services.where('clinicId').equals(clinicId).toArray();
    case 'products':            return db.products.where('clinicId').equals(clinicId).toArray();
    case 'movements':           return db.movements.where('clinicId').equals(clinicId).toArray();
    case 'appointments':        return db.appointments.where('clinicId').equals(clinicId).toArray();
    case 'consultations':       return db.consultations.where('clinicId').equals(clinicId).toArray();
    case 'payments':            return db.payments.where('clinicId').equals(clinicId).toArray();
    case 'invoices':            return db.invoices.where('clinicId').equals(clinicId).toArray();
    case 'sales':               return db.sales.where('clinicId').equals(clinicId).toArray();
    case 'fixedExpenses':       return db.fixedExpenses.where('clinicId').equals(clinicId).toArray();
    case 'expensePayments':     return db.expensePayments.where('clinicId').equals(clinicId).toArray();
    case 'collaborators':       return db.collaborators.where('clinicId').equals(clinicId).toArray();
    case 'collaboratorPayments':return db.collaboratorPayments.where('clinicId').equals(clinicId).toArray();
    case 'promotions':          return db.promotions.where('clinicId').equals(clinicId).toArray();
  }
}

async function clearDemoTable(table: DemoTable): Promise<void> {
  switch (table) {
    case 'owners':              await db.owners.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'patients':            await db.patients.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'services':            await db.services.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'products':            await db.products.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'movements':           await db.movements.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'appointments':        await db.appointments.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'consultations':       await db.consultations.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'payments':            await db.payments.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'invoices':            await db.invoices.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'sales':               await db.sales.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'fixedExpenses':       await db.fixedExpenses.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'expensePayments':     await db.expensePayments.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'collaborators':       await db.collaborators.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'collaboratorPayments':await db.collaboratorPayments.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
    case 'promotions':          await db.promotions.where('clinicId').equals(DEMO_CLINIC_ID).delete(); break;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bulkWriteToTable(table: DemoTable, items: any[]): Promise<void> {
  if (items.length === 0) return;
  switch (table) {
    case 'owners':              await db.owners.bulkPut(items); break;
    case 'patients':            await db.patients.bulkPut(items); break;
    case 'services':            await db.services.bulkPut(items); break;
    case 'products':            await db.products.bulkPut(items); break;
    case 'movements':           await db.movements.bulkPut(items); break;
    case 'appointments':        await db.appointments.bulkPut(items); break;
    case 'consultations':       await db.consultations.bulkPut(items); break;
    case 'payments':            await db.payments.bulkPut(items); break;
    case 'invoices':            await db.invoices.bulkPut(items); break;
    case 'sales':               await db.sales.bulkPut(items); break;
    case 'fixedExpenses':       await db.fixedExpenses.bulkPut(items); break;
    case 'expensePayments':     await db.expensePayments.bulkPut(items); break;
    case 'collaborators':       await db.collaborators.bulkPut(items); break;
    case 'collaboratorPayments':await db.collaboratorPayments.bulkPut(items); break;
    case 'promotions':          await db.promotions.bulkPut(items); break;
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DemoConfig {
  version:              string;
  label?:               string;
  publishedAt?:         number;
  previousVersion?:     string;
  previousLabel?:       string;
  previousPublishedAt?: number;
  counts?:              Record<string, number>;
}

export interface PublishResult {
  version:          string;
  label:            string;
  counts:           Record<string, number>;
  previousVersion?: string;
  previousLabel?:   string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the demo version metadata (1 doc read).
 * Only demo/config is read on every visit — the actual data at clinics/demo/** is
 * fetched only when the version changes.
 */
export async function getDemoConfig(): Promise<DemoConfig | null> {
  try {
    const snap = await getDoc(doc(getFirestoreDb(), 'demo', 'config'));
    return snap.exists() ? (snap.data() as DemoConfig) : null;
  } catch {
    return null;
  }
}

export async function getDemoRemoteVersion(): Promise<string | null> {
  const config = await getDemoConfig();
  return config?.version ?? null;
}

/**
 * Tries to populate Dexie with the latest demo snapshot from Firestore.
 *
 * Flow:
 *   1. Read demo/config (1 doc) — cheap version check.
 *   2. If localStorage version matches → already up to date, return true.
 *   3. Otherwise read all docs from clinics/demo/{collection} for each of the
 *      14 tables, clear old Dexie data, bulk-insert, update localStorage.
 *
 * Returns true when Dexie is populated and ready.
 * Returns false when offline or no snapshot has been published yet.
 *
 * NOTE: Firestore rules must allow unauthenticated reads of clinics/demo/** and demo/config.
 *   match /demo/{doc} { allow read: if true; }
 *   match /clinics/demo/{doc=**} { allow read: if true; }
 */
export async function tryLoadDemoSnapshot(): Promise<boolean> {
  const remoteVersion = await getDemoRemoteVersion();
  if (!remoteVersion) return false;

  const localVersion = typeof window !== 'undefined'
    ? localStorage.getItem(LS_VERSION_KEY)
    : null;

  if (localVersion === remoteVersion) {
    // Version matches — confirm data exists in case IndexedDB was wiped
    const count = await db.patients.where('clinicId').equals(DEMO_CLINIC_ID).count();
    if (count > 0) return true;
    // Fall through to re-load
  }

  // Fetch all collections from clinics/demo/* in parallel
  const fsdb = getFirestoreDb();
  const snapshots = await Promise.all(
    DEMO_TABLES.map((table) => getDocs(clinicCol(fsdb, table)))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allData = Object.fromEntries(
    DEMO_TABLES.map((table, i) => [
      table,
      snapshots[i].docs.map((d) => d.data()),
    ])
  ) as Record<DemoTable, unknown[]>;

  // Swap old → new data atomically in Dexie
  await db.transaction('rw', [
    db.owners, db.patients, db.services, db.products, db.movements,
    db.appointments, db.consultations, db.payments, db.invoices, db.sales,
    db.fixedExpenses, db.expensePayments, db.collaborators, db.collaboratorPayments,
    db.promotions,
  ], async () => {
    for (const table of DEMO_TABLES) await clearDemoTable(table);
    for (const table of DEMO_TABLES) await bulkWriteToTable(table, allData[table]);
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_VERSION_KEY, remoteVersion);
  }

  return true;
}

/**
 * Reads all clinic data from Dexie (sourceClinicId) and publishes it to
 * clinics/demo/{collection}/{id} — exactly the same structure as any real clinic.
 *
 * Steps per collection:
 *   1. Read current docs (to delete stale records from previous snapshot).
 *   2. Batch-delete existing + batch-write new docs.
 * Then updates demo/config last so clients only see the new version once all data is ready.
 *
 * Firestore layout after publish:
 *   demo/config                        → { version, label, publishedAt, previousVersion… }
 *   clinics/demo/owners/{id}           → owner doc
 *   clinics/demo/patients/{id}         → patient doc
 *   clinics/demo/products/{id}         → product doc
 *   … (same shape as clinics/{realClinicId}/{collection}/{id})
 */
export async function publishDemoSnapshot(
  version:        string,
  label:          string,
  sourceClinicId: string,
): Promise<PublishResult> {
  const fsdb   = getFirestoreDb();
  const counts: Record<string, number> = {};

  // Read current config before overwriting so we can preserve the previous version
  const currentConfig = await getDemoConfig();
  const previousVersion     = currentConfig?.version;
  const previousLabel       = currentConfig?.label;
  const previousPublishedAt = currentConfig?.publishedAt;

  const source = FIRESTORE_DIRECT ? 'Firestore' : 'Dexie';
  console.log(`[publishDemo] sourceClinicId="${sourceClinicId}" version="${version}" source=${source}`);

  // Publish each collection: delete stale + write new, in parallel
  await Promise.all(
    DEMO_TABLES.map(async (table) => {
      const colRef = clinicCol(fsdb, table);

      // Read source data — from Firestore when FIRESTORE_DIRECT, otherwise Dexie
      const raw = FIRESTORE_DIRECT
        ? (await getDocs(sourceClinicCol(fsdb, sourceClinicId, table))).docs.map((d) => d.data())
        : await readTable(table, sourceClinicId);

      const items: Record<string, unknown>[] = JSON.parse(
        JSON.stringify(
          raw.map((item) => ({ ...item, clinicId: DEMO_CLINIC_ID, syncStatus: 'synced' }))
        )
      );
      counts[table] = items.length;
      console.log(`[publishDemo] ${table}: ${items.length} items from ${source}`);

      // Read existing Firestore docs so we can delete stale ones
      const existing = await getDocs(colRef);

      // Firestore batches allow max 500 ops. Split if needed.
      const ops = [
        ...existing.docs.map((d) => ({ type: 'delete' as const, ref: d.ref })),
        ...items.map((item) => ({
          type:  'set' as const,
          ref:   doc(colRef, item.id as string),
          data:  item,
        })),
      ];

      for (let i = 0; i < ops.length; i += 500) {
        const batch = writeBatch(fsdb);
        for (const op of ops.slice(i, i + 500)) {
          if (op.type === 'delete') batch.delete(op.ref);
          else batch.set(op.ref, op.data);
        }
        await batch.commit();
      }
    })
  );

  // Write config last — clients only pick up the new version once all data docs are ready
  await setDoc(doc(fsdb, 'demo', 'config'), {
    version,
    label,
    publishedAt: Date.now(),
    counts,
    ...(previousVersion     && { previousVersion }),
    ...(previousLabel       && { previousLabel }),
    ...(previousPublishedAt && { previousPublishedAt }),
  });

  return { version, label, counts, previousVersion, previousLabel };
}

import {
  collection as firestoreCollection,
  doc,
  getCountFromServer,
  getDocs,
  query,
  orderBy,
  limit as fsLimit,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';

/**
 * Per-clinic usage metering.
 *
 * Counting is done with Firestore aggregation queries, which bill one read per
 * 1000 index entries scanned instead of one read per document: counting a
 * million documents costs about 1000 reads. The obvious alternative — an
 * onDocumentCreated trigger keeping counters — costs one function invocation on
 * every single write, adds latency to each one, and drifts out of sync whenever
 * an invocation fails.
 *
 * Snapshots are stored one per clinic per day:
 *   admin/usage/{clinicId}/{YYYY-MM-DD} → UsageSnapshot
 *
 * so growth is a subtraction between two documents, and the history survives
 * even though Firestore itself cannot attribute cost per tenant.
 */

/** Collections metered for a clinic. Keep in sync with the Dexie tables that sync. */
export const METERED_COLLECTIONS = [
  'owners', 'patients', 'services', 'products', 'movements',
  'appointments', 'consultations', 'payments', 'invoices', 'sales',
  'fixedExpenses', 'expensePayments', 'collaborators', 'collaboratorPayments',
  'promotions', 'quotes',
] as const;

export type MeteredCollection = typeof METERED_COLLECTIONS[number];

export interface UsageSnapshot {
  clinicId: string;
  /** YYYY-MM-DD, local date of the clinic */
  date: string;
  takenAt: number;
  counts: Record<string, number>;
  totalDocs: number;
  /** Reads this measurement itself consumed, so the metering never hides its own cost */
  measurementReads: number;
}

/**
 * Rough Firestore pricing (us-central, Blaze). Used only to turn document
 * counts into an order-of-magnitude figure in the dashboard — it is an
 * estimate, never a bill.
 */
export const PRICING = {
  readsPer100k:      0.06,
  writesPer100k:     0.18,
  storagePerGiBMonth: 0.18,
  /** Average document size assumed when estimating storage */
  avgDocBytes: 1024,
};

function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function usageCol(fsdb: Firestore, clinicId: string) {
  return firestoreCollection(fsdb, 'admin', 'usage', clinicId);
}

/**
 * Counts every metered collection for a clinic and stores the snapshot.
 * Safe to call repeatedly: the day's document is overwritten, not appended.
 */
export async function collectUsageSnapshot(clinicId: string): Promise<UsageSnapshot> {
  const fsdb   = getFirestoreDb();
  const counts: Record<string, number> = {};

  const results = await Promise.all(
    METERED_COLLECTIONS.map(async (name) => {
      const snap = await getCountFromServer(
        firestoreCollection(fsdb, 'clinics', clinicId, name),
      );
      return [name, snap.data().count] as const;
    }),
  );

  let totalDocs = 0;
  for (const [name, count] of results) {
    counts[name] = count;
    totalDocs += count;
  }

  const snapshot: UsageSnapshot = {
    clinicId,
    date:    localDateString(),
    takenAt: Date.now(),
    counts,
    totalDocs,
    // One read per 1000 index entries, with a minimum of one per aggregation
    measurementReads: results.reduce((sum, [, c]) => sum + Math.max(1, Math.ceil(c / 1000)), 0),
  };

  await setDoc(doc(usageCol(fsdb, clinicId), snapshot.date), snapshot);
  return snapshot;
}

/** Most recent snapshots for a clinic, newest first. */
export async function getUsageHistory(clinicId: string, days = 30): Promise<UsageSnapshot[]> {
  const fsdb = getFirestoreDb();
  const snap = await getDocs(
    query(usageCol(fsdb, clinicId), orderBy('date', 'desc'), fsLimit(days)),
  );
  return snap.docs.map((d) => d.data() as UsageSnapshot);
}

/**
 * Monthly storage cost for the documents a clinic holds. Reads and writes are
 * deliberately left out: they depend on how many devices sync and how often,
 * which a document count cannot tell us. The dashboard states this.
 */
export function estimateStorageCost(totalDocs: number): number {
  const gib = (totalDocs * PRICING.avgDocBytes) / 1024 ** 3;
  return gib * PRICING.storagePerGiBMonth;
}

/** Cost of one device downloading this clinic from scratch — the expensive path. */
export function estimateFullPullCost(totalDocs: number): number {
  return (totalDocs / 100_000) * PRICING.readsPer100k;
}

/** Growth between the two most recent snapshots, or null when there is no history yet. */
export function growthBetween(history: UsageSnapshot[]): { days: number; docs: number } | null {
  if (history.length < 2) return null;
  const [newest, previous] = history;
  const days = Math.max(
    1,
    Math.round((newest.takenAt - previous.takenAt) / 86_400_000),
  );
  return { days, docs: newest.totalDocs - previous.totalDocs };
}

// ── Platform owner ────────────────────────────────────────────────────────────

/**
 * The person who runs the SaaS, as opposed to a clinic's own master/admin.
 * Only they can measure every tenant; a clinic master sees its own figures.
 *
 * Kept as a list in one place so the e-mail appears exactly once in the app.
 * It is mirrored by isPlatformOwner() in firestore.rules — change both together,
 * and remember the rules are what actually enforces this. The client-side check
 * only decides what the UI offers.
 */
const PLATFORM_OWNER_EMAILS = ['calebgtnbacon@gmail.com'];

export function isPlatformOwner(email?: string | null): boolean {
  return !!email && PLATFORM_OWNER_EMAILS.includes(email.toLowerCase().trim());
}

export interface ClinicRef {
  id: string;
  name?: string;
}

/** Every clinic in the project. Only the platform owner is allowed to list these. */
export async function listAllClinics(): Promise<ClinicRef[]> {
  const snap = await getDocs(firestoreCollection(getFirestoreDb(), 'clinics'));
  return snap.docs
    .map((d) => ({ id: d.id, name: (d.data() as { name?: string }).name }))
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

/**
 * Measures every clinic, one after another rather than in parallel: this runs
 * from a browser, and a burst of aggregation queries across every tenant is the
 * kind of thing that trips rate limits for no benefit — metering is not urgent.
 */
export async function collectAllUsageSnapshots(
  onProgress?: (done: number, total: number, clinic: ClinicRef) => void,
): Promise<{ snapshots: UsageSnapshot[]; failures: { clinic: ClinicRef; error: string }[] }> {
  const clinics   = await listAllClinics();
  const snapshots: UsageSnapshot[] = [];
  const failures:  { clinic: ClinicRef; error: string }[] = [];

  for (const [i, clinic] of clinics.entries()) {
    try {
      snapshots.push(await collectUsageSnapshot(clinic.id));
    } catch (err) {
      // One unreadable tenant must not abandon the rest of the measurement
      failures.push({ clinic, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i + 1, clinics.length, clinic);
  }

  return { snapshots, failures };
}

/** Latest stored snapshot per clinic, for the platform-wide view. */
export async function getLatestUsagePerClinic(): Promise<(UsageSnapshot | null)[]> {
  const clinics = await listAllClinics();
  return Promise.all(
    clinics.map(async (c) => {
      const history = await getUsageHistory(c.id, 1);
      return history[0] ?? null;
    }),
  );
}

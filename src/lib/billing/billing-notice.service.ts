import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirestoreDb } from '@/lib/firebase/firebase.config';
import { listAllClinics } from '@/lib/usage/usage.service';

/**
 * Billing notices: the platform owner decides when each clinic is asked to pay.
 * Stored as clinics/{id}/license/data.billingNotice = { at, blocking }, which only
 * the platform owner may write (firestore.rules). Clinics pick the change up live
 * through the license listener in AuthContext; a confirmed payment clears it.
 */

export interface BillingNotice {
  /** ms timestamp from which the clinic sees the notice */
  at: number;
  /** true = the app locks until payment; false = dismissible banner */
  blocking: boolean;
}

export interface ClinicBillingRow {
  id: string;
  name: string;
  plan: string | null;
  expirationDate: string | null;
  notice: BillingNotice | null;
}

const DEMO_CLINIC_ID = 'demo';

/** Every clinic with its license, for the platform owner's billing screen. */
export async function listClinicBilling(): Promise<ClinicBillingRow[]> {
  const fs = getFirestoreDb();
  const clinics = (await listAllClinics()).filter((c) => c.id !== DEMO_CLINIC_ID);
  return Promise.all(clinics.map(async (clinic) => {
    const snap = await getDoc(doc(fs, 'clinics', clinic.id, 'license', 'data'));
    const data = snap.exists() ? snap.data() : {};
    const notice = data.billingNotice as Partial<BillingNotice> | null | undefined;
    return {
      id:             clinic.id,
      name:           clinic.name ?? clinic.id,
      plan:           typeof data.plan === 'string' ? data.plan : null,
      expirationDate: typeof data.expirationDate === 'string' ? data.expirationDate : null,
      notice:         notice && typeof notice.at === 'number'
        ? { at: notice.at, blocking: notice.blocking === true }
        : null,
    };
  }));
}

/** Sets (or replaces) the billing notice of each clinic in one atomic batch. */
export async function scheduleBillingNotice(clinicIds: string[], notice: BillingNotice): Promise<void> {
  await writeNotice(clinicIds, notice);
}

/** Removes the billing notice: the clinics go back to their normal license. */
export async function clearBillingNotice(clinicIds: string[]): Promise<void> {
  await writeNotice(clinicIds, null);
}

async function writeNotice(clinicIds: string[], notice: BillingNotice | null): Promise<void> {
  if (clinicIds.length === 0) return;
  const fs = getFirestoreDb();
  const batch = writeBatch(fs);
  for (const clinicId of clinicIds) {
    batch.set(
      doc(fs, 'clinics', clinicId, 'license', 'data'),
      { billingNotice: notice, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
}

/** Moves the license expiration of each clinic to `date` (YYYY-MM-DD). Platform owner only. */
export async function setLicenseExpiration(clinicIds: string[], date: string): Promise<void> {
  if (clinicIds.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const fs = getFirestoreDb();
  const batch = writeBatch(fs);
  for (const clinicId of clinicIds) {
    batch.set(
      doc(fs, 'clinics', clinicId, 'license', 'data'),
      { expirationDate: date, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
}

export interface ReminderResult { clinicId: string; days: number; sent: number; skipped?: string }

/** Pushes each clinic its expiry reminder right now (to devices with notifications on). */
export async function sendExpiryReminderNow(clinicIds: string[]): Promise<ReminderResult[]> {
  const fn = httpsCallable<{ clinicIds: string[] }, { results: ReminderResult[] }>(
    getFirebaseFunctions(), 'sendExpiryReminderNow',
  );
  return (await fn({ clinicIds })).data.results;
}


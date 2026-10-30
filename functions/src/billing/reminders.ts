import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { PushMessage, PushResult } from './push';

/**
 * Expiry reminders: push the clinic's devices a few days before its license runs
 * out, so nobody is surprised by the lock screen. Runs daily (scheduled function)
 * and on demand from the platform owner's panel.
 */

/** Nicaragua has no daylight saving: UTC-6 all year. */
export const CLINIC_TIME_ZONE = 'America/Managua';

/** Days before expiration on which a reminder goes out (0 = the last day). */
export const REMINDER_DAYS = [3, 1, 0] as const;

export type ClinicPushSender = (clinicId: string, message: PushMessage) => Promise<PushResult>;

/** Today's date (YYYY-MM-DD) in the clinics' time zone. */
export function localToday(now: number, timeZone = CLINIC_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

/** Whole days from `today` to `expirationDate`; negative once it has passed. */
export function daysUntil(expirationDate: string, today: string): number {
  return Math.round((Date.parse(`${expirationDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export interface LicenseSnapshot {
  plan?: string;
  expirationDate?: string;
  subscription?: boolean;
  graceUntil?: number | null;
}

/** The reminder for a license `days` before it expires, or null when none applies. */
export function buildExpiryReminder(license: LicenseSnapshot, days: number): PushMessage | null {
  if (days < 0 || days > 3) return null;
  const what = license.plan === 'Trial' ? 'Tu prueba gratis de VetSystem' : 'Tu suscripción de VetSystem';
  const when = days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : `vence en ${days} días`;
  return {
    title: `${what} ${when}`,
    body:  'Paga por transferencia o Kash desde la app para no perder el acceso.',
    url:   '/admin/?tab=plan',
    tag:   `expiry-${license.expirationDate}`,
  };
}

export interface ReminderRunResult {
  clinicId: string;
  days: number;
  sent: number;
  skipped?: 'already-sent' | 'no-reminder' | 'in-grace' | 'suspended';
}

function shouldSkip(license: LicenseSnapshot, now: number): ReminderRunResult['skipped'] | undefined {
  if (license.subscription === false) return 'suspended';
  if (typeof license.graceUntil === 'number' && license.graceUntil > now) return 'in-grace';
  return undefined;
}

/**
 * Daily pass over every clinic. A clinic gets each reminder once per expiration
 * date and day (recorded in license.remindersSent), so a re-run or a retry of the
 * scheduler never double-notifies.
 */
export async function runExpiryReminders(db: Firestore, send: ClinicPushSender, now = Date.now()): Promise<ReminderRunResult[]> {
  const today = localToday(now);
  const results: ReminderRunResult[] = [];
  // listDocuments includes clinics whose root document does not exist (e.g. legacy ids).
  for (const clinicRef of await db.collection('clinics').listDocuments()) {
    if (clinicRef.id === 'demo') continue;
    const licenseRef = clinicRef.collection('license').doc('data');
    const license = (await licenseRef.get()).data() as (LicenseSnapshot & { remindersSent?: string[] }) | undefined;
    if (!license?.expirationDate) continue;

    const days = daysUntil(license.expirationDate, today);
    if (!(REMINDER_DAYS as readonly number[]).includes(days)) continue;

    const skipped = shouldSkip(license, now);
    if (skipped) { results.push({ clinicId: clinicRef.id, days, sent: 0, skipped }); continue; }

    const key = `${license.expirationDate}:${days}`;
    if (license.remindersSent?.includes(key)) {
      results.push({ clinicId: clinicRef.id, days, sent: 0, skipped: 'already-sent' });
      continue;
    }
    const message = buildExpiryReminder(license, days);
    if (!message) continue;

    const { sent } = await send(clinicRef.id, message);
    // Recorded even with no devices: the reminder's moment has passed for this day.
    await licenseRef.set({ remindersSent: FieldValue.arrayUnion(key) }, { merge: true });
    results.push({ clinicId: clinicRef.id, days, sent });
  }
  return results;
}

/**
 * On demand from the platform owner: send each clinic the reminder that matches
 * its expiration right now, ignoring the once-a-day bookkeeping.
 */
export async function sendExpiryRemindersNow(
  db: Firestore,
  clinicIds: string[],
  send: ClinicPushSender,
  now = Date.now(),
): Promise<ReminderRunResult[]> {
  const today = localToday(now);
  const results: ReminderRunResult[] = [];
  for (const clinicId of clinicIds) {
    const license = (await db.doc(`clinics/${clinicId}/license/data`).get()).data() as LicenseSnapshot | undefined;
    if (!license?.expirationDate) { results.push({ clinicId, days: NaN, sent: 0, skipped: 'no-reminder' }); continue; }
    const days = daysUntil(license.expirationDate, today);
    const message = buildExpiryReminder(license, days);
    if (!message) { results.push({ clinicId, days, sent: 0, skipped: 'no-reminder' }); continue; }
    const { sent } = await send(clinicId, message);
    results.push({ clinicId, days, sent });
  }
  return results;
}

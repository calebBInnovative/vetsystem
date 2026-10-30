import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isPlatformOwnerEmail } from './platform';
import { pushToClinic } from './push';
import { CLINIC_TIME_ZONE, runExpiryReminders, sendExpiryRemindersNow } from './reminders';

// ─── notifyExpiringLicenses ───────────────────────────────────────────────────
// Every morning in Nicaragua: push the reminder to clinics whose license expires
// in 3 days, tomorrow or today.

export const notifyExpiringLicenses = onSchedule(
  { schedule: 'every day 09:00', timeZone: CLINIC_TIME_ZONE },
  async () => {
    const db = getFirestore();
    const results = await runExpiryReminders(db, (clinicId, message) => pushToClinic(db, clinicId, message));
    logger.info('[reminders] daily run', { clinics: results.length, results });
  },
);

// ─── sendExpiryReminderNow ────────────────────────────────────────────────────
// Input: { clinicIds: string[] } — platform owner only.

export const sendExpiryReminderNow = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  if (!isPlatformOwnerEmail(request.auth.token.email)) {
    throw new HttpsError('permission-denied', 'Only the platform owner can send reminders.');
  }
  const data = (request.data && typeof request.data === 'object' ? request.data : {}) as Record<string, unknown>;
  const clinicIds = Array.isArray(data.clinicIds)
    ? data.clinicIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)).slice(0, 100)
    : [];
  if (clinicIds.length === 0) throw new HttpsError('invalid-argument', 'clinicIds is required.');

  const db = getFirestore();
  const results = await sendExpiryRemindersNow(db, clinicIds, (clinicId, message) => pushToClinic(db, clinicId, message));
  logger.info('[reminders] manual run', { results });
  return { results };
});

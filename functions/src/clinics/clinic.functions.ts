import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { RegistrationError, registerClinic as registerClinicInFirestore } from './clinic.registration';

// ─── registerClinic ───────────────────────────────────────────────────────────
// Input:  { clinicName, userName?, phone?, logoUrl? }
// Output: { clinicId, created }
// Called right after sign-up (email) or from /setup (Google). The clinic owner
// gets role 'admin' and a TRIAL_DAYS trial; the license is written only here.

export const registerClinic = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const data = request.data && typeof request.data === 'object' ? (request.data as Record<string, unknown>) : {};

  try {
    return await registerClinicInFirestore(getFirestore(), {
      uid:        request.auth.uid,
      email:      typeof request.auth.token.email === 'string' ? request.auth.token.email : null,
      clinicName: data.clinicName,
      userName:   data.userName,
      phone:      data.phone,
      logoUrl:    data.logoUrl,
    });
  } catch (err) {
    if (err instanceof RegistrationError) throw new HttpsError(err.code, err.message);
    logger.error('[clinics] registration failed', { error: (err as Error).name, message: (err as Error).message });
    throw new HttpsError('internal', 'Could not register the clinic.');
  }
});

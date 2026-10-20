import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * Clinic registration runs on the server so the license is never written by a
 * browser. Firestore rules deny clients any write that could create or extend
 * clinics/{clinicId}/license/data; only this module, a confirmed payment and the
 * platform owner can do that.
 */

export const TRIAL_DAYS = 14;

/** Clinic ids that a registration must never claim. */
const RESERVED_CLINIC_IDS = new Set(['demo', '_']);

const MAX_ID_ATTEMPTS = 5;

export type RegistrationErrorCode = 'invalid-argument' | 'already-exists' | 'failed-precondition';

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationErrorCode, message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export interface RegisterClinicInput {
  uid: string;
  /** From the verified auth token, never from the request body. */
  email: string | null;
  clinicName: unknown;
  userName: unknown;
  phone?: unknown;
  logoUrl?: unknown;
}

export interface RegisterClinicResult {
  clinicId: string;
  /** False when the user already belonged to a clinic and nothing was written. */
  created: boolean;
}

export interface RegisterClinicOptions {
  now?: number;
  /** Suffix used when the clinic name's slug is already taken. */
  randomSuffix?: () => string;
}

/** Same transformation the client used, so ids stay recognisable. */
export function slugifyClinicName(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Last day of a trial that starts on `now`, as YYYY-MM-DD (UTC). */
export function trialExpiration(now: number, days = TRIAL_DAYS): string {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new RegistrationError('invalid-argument', `${field} is required.`);
  if (text.length > max) throw new RegistrationError('invalid-argument', `${field} is too long.`);
  return text;
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function optionalHttpsUrl(value: unknown): string | null {
  const text = optionalText(value, 2048);
  if (!text) return null;
  try {
    return new URL(text).protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

function defaultSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/**
 * Creates the clinic, its trial license and the owner's user document in one
 * transaction. Idempotent per user: a user who already has a profile gets their
 * existing clinic back and nothing is written, so a retried call or a staff
 * member cannot mint a second trial or move to another clinic.
 */
export async function registerClinic(
  db: Firestore,
  input: RegisterClinicInput,
  options: RegisterClinicOptions = {},
): Promise<RegisterClinicResult> {
  const clinicName = requiredText(input.clinicName, 'clinicName', 120);
  const userName   = optionalText(input.userName, 120) ?? input.email ?? 'Usuario';
  const phone      = optionalText(input.phone, 40);
  const logoUrl    = optionalHttpsUrl(input.logoUrl);
  const now        = options.now ?? Date.now();
  const suffix     = options.randomSuffix ?? defaultSuffix;

  const base = slugifyClinicName(clinicName) || input.uid.slice(0, 8).toLowerCase();
  const candidates = [base];
  while (candidates.length < MAX_ID_ATTEMPTS) candidates.push(`${base}-${suffix()}`);

  return db.runTransaction(async (tx) => {
    const userRef  = db.collection('users').doc(input.uid);
    const userSnap = await tx.get(userRef);
    if (userSnap.exists) {
      const clinicId = userSnap.get('clinicId');
      if (typeof clinicId === 'string' && clinicId) return { clinicId, created: false };
      throw new RegistrationError('failed-precondition', 'User profile exists without a clinic.');
    }

    // All reads happen before any write, as Firestore transactions require.
    let clinicId: string | null = null;
    for (const candidate of candidates) {
      if (RESERVED_CLINIC_IDS.has(candidate)) continue;
      const clinicSnap = await tx.get(db.collection('clinics').doc(candidate));
      if (!clinicSnap.exists) { clinicId = candidate; break; }
    }
    if (!clinicId) throw new RegistrationError('already-exists', 'Could not allocate a clinic id. Try another name.');

    const clinicRef = db.collection('clinics').doc(clinicId);
    tx.create(clinicRef, {
      name:      clinicName,
      logoUrl,
      phone,
      ownerUid:  input.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(clinicRef.collection('license').doc('data'), {
      clinicName,
      plan:           'Trial',
      expirationDate: trialExpiration(now),
      subscription:   true,
      trialStartedAt: now,
      updatedAt:      FieldValue.serverTimestamp(),
    });
    tx.create(userRef, {
      uid:           input.uid,
      email:         input.email,
      name:          userName,
      role:          'admin',
      clinicId,
      permissions:   null,
      setupComplete: true,
      ...(phone ? { phone } : {}),
      createdAt:     FieldValue.serverTimestamp(),
    });

    return { clinicId, created: true };
  });
}

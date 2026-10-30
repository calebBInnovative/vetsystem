import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
// TODO: enable when Firebase Storage plan is upgraded
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirestoreDb, getFirebaseFunctions } from '@/lib/firebase/firebase.config';
import { db } from '@/lib/db/database';
import { syncService } from '@/lib/sync/sync.service';
import type { SessionLocal, Permissions, UserRole } from '@/types/license';
import { limitsFromLicense } from '@/lib/billing/plans';

// ─── Firestore structure ──────────────────────────────────────────────────────
//
//  users/{uid}
//    clinicId:     string
//    name:         string
//    email:        string
//    role:         'master' | 'admin' | 'veterinarian' | 'reception'
//    permissions:  Permissions | null  (null = full access)
//    createdAt:    serverTimestamp()
//
//  clinics/{clinicId}
//    name:         string
//    logoUrl:      string | null
//    createdAt:    serverTimestamp()
//
//  clinics/{clinicId}/license/data
//    plan:           string
//    expirationDate: string
//    subscription:   boolean
//    clinicName:     string
//    updatedAt:      serverTimestamp()
//
// ─────────────────────────────────────────────────────────────────────────────

function getAuth_() {
  return getAuth(getFirebaseApp());
}

/**
 * Thrown by refreshSession when the user's Firestore document does not exist.
 * Distinct from a network error so callers can decide whether to force-logout.
 */
export class UserNotFoundError extends Error {
  override name = 'UserNotFoundError';
}

// Default permissions for staff users whose Firestore doc is missing the permissions field
const DEFAULT_STAFF_PERMISSIONS: Permissions = {
  patients: true, schedule: true, consultations: true, sales: true, quotes: true,
  inventory: false, finances: false, invoices: false, services: false,
  promotions: false, import: false,
};

// ─── User-creation semaphore ──────────────────────────────────────────────────
// Set to true BEFORE any await in loginWithGoogle / register so that
// AuthContext.tryRefresh doesn't race to force-logout while we're writing the
// Firestore user doc for the first time.
let _userCreationInFlight = false;
export function isUserCreationInFlight(): boolean { return _userCreationInFlight; }

// ─── Auth principal ───────────────────────────────────────────────────────────

/** Login with email/password. Requires internet. */
export async function login(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(getAuth_(), email, password);
  await refreshSession(credential.user);
}

/**
 * Register a new clinic owner (role admin) with email/password.
 * The registerClinic Cloud Function creates the clinic, its trial license and the user doc.
 */
export async function register(params: {
  email:      string;
  password:   string;
  name:       string;
  clinicName: string;
  phone?:     string;
  logo?:      File | null;
}): Promise<void> {
  _userCreationInFlight = true;
  const credential = await createUserWithEmailAndPassword(getAuth_(), params.email, params.password);
  const user       = credential.user;
  try {
    // Clinic, trial license and user doc are created server-side: the browser is
    // not allowed to write a license (see firestore.rules).
    await _registerClinic({ clinicName: params.clinicName, userName: params.name, phone: params.phone });
    await refreshSession(user);
  } catch (err) {
    // Registration failed — roll back the Auth user so the person can retry with the same email.
    try { await user.delete(); } catch { /* ignore, surface the original error */ }
    throw err;
  } finally {
    _userCreationInFlight = false;
  }
}

/** @deprecated Use register instead */
export const registrarse = register;

/**
 * Sign in with Google via popup.
 * For new users, NO Firestore documents are created here.
 * The /setup page is responsible for creating the clinic + user doc atomically
 * (via createClinicFromSetup), so there is no partial state and no race condition.
 */
export async function loginWithGoogle(): Promise<{ isNewUser: boolean }> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(getAuth_(), provider);
  const user = credential.user;
  const fs   = getFirestoreDb();

  const userDoc = await getDoc(doc(fs, 'users', user.uid));
  if (!userDoc.exists() || userDoc.data().setupComplete === false) {
    return { isNewUser: true };
  }

  await refreshSession(user);
  return { isNewUser: false };
}

/** @deprecated Use loginWithGoogle instead */
export const loginConGoogle = loginWithGoogle;

/** Logout. Deletes local session from Dexie. */
export async function logout(): Promise<void> {
  // Stop sync first: once signed out, every pull and listener still running
  // fails with "Missing or insufficient permissions".
  syncService.stop();
  await firebaseSignOut(getAuth_());
  await db.session.delete('singleton');
}

/**
 * Refreshes session and license from Firestore.
 * Returns null on network/transient errors (caller should keep cached session).
 * Throws UserNotFoundError when the user doc is confirmed missing (caller should force-logout).
 */
export async function refreshSession(user: User): Promise<SessionLocal | null> {
  try {
    const fs = getFirestoreDb();

    const userDoc = await getDoc(doc(fs, 'users', user.uid));
    if (!userDoc.exists()) {
      throw new UserNotFoundError(`User ${user.uid} not found in Firestore.`);
    }

    const userData = userDoc.data();
    const clinicId: string  = userData.clinicId;
    const role:     UserRole = userData.role ?? 'reception';
    const permissions: Permissions | null =
      (role === 'master' || role === 'admin')
        ? null
        : ((userData.permissions as Permissions | null | undefined) ?? DEFAULT_STAFF_PERMISSIONS);

    const licenseDoc  = await getDoc(doc(fs, 'clinics', clinicId, 'license', 'data'));
    // A clinic without a license document has no right to use the app. The
    // generous dev license only applies to a local `next dev` session.
    const licenseData = licenseDoc.exists()
      ? licenseDoc.data()
      : process.env.NODE_ENV === 'development' ? _devLicense() : _missingLicense();

    const clinicDoc   = await getDoc(doc(fs, 'clinics', clinicId));
    const clinicData  = clinicDoc.exists() ? clinicDoc.data() : null;

    await setDoc(doc(fs, 'users', user.uid), { lastAccess: serverTimestamp() }, { merge: true });

    const now = Date.now();
    const session: SessionLocal = {
      id:             'singleton',
      uid:            user.uid,
      email:          user.email ?? '',
      clinicId,
      clinicName:     licenseData.clinicName ?? clinicData?.name ?? clinicId,
      clinicLogoUrl:  clinicData?.logoUrl ?? undefined,
      clinicTel:      clinicData?.phone ?? undefined,
      userTel:        userData.phone ?? undefined,
      userName:       userData.name ?? user.email ?? 'User',
      role,
      permissions,
      plan:           licenseData.plan ?? 'Basic',
      expirationDate: licenseData.expirationDate ?? _missingLicense().expirationDate,
      subscription:   licenseData.subscription !== false,
      ...billingStateFields(licenseData),
      lastSync:       now,
      cachedAt:       now,
      // undefined / missing = already set up (email users, legacy Google users)
      // false = new Google user who hasn't completed the clinic setup form yet
      setupComplete:  userData.setupComplete === false ? false : true,
    };

    await db.session.put(session);
    return session;
  } catch (err) {
    if (err instanceof UserNotFoundError) throw err; // caller must force-logout
    console.error('[auth] refreshSession failed:', err);
    return null; // transient/network error — caller should keep cached session
  }
}

/** @deprecated Use refreshSession instead */
export const refrescarSesion = refreshSession;

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuth_(), callback);
}

export async function getLocalSession(): Promise<SessionLocal | null> {
  return (await db.session.get('singleton')) ?? null;
}

/** @deprecated Use getLocalSession instead */
export const getSesionLocal = getLocalSession;

// ─── User management (from admin) ────────────────────────────────────────────

export interface NewUser {
  email:       string;
  password:    string;
  name:        string;
  role:        UserRole;
  clinicId:    string;
  permissions: Permissions | null;
}

/** @deprecated Use NewUser instead */
export type NuevoUsuario = NewUser;

export interface FirestoreUser {
  uid:         string;
  email:       string;
  name:        string;
  role:        UserRole;
  clinicId:    string;
  permissions: Permissions | null;
  createdAt?:  unknown;
}

/** @deprecated Use FirestoreUser instead */
export type UsuarioFirestore = FirestoreUser;

/**
 * Creates a user in Firebase Auth + their Firestore document.
 * Uses REST API to NOT log out the current master/admin.
 */
export async function createUser(data: NewUser): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('Firebase API key not configured.');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:             data.email,
        password:          data.password,
        returnSecureToken: false,
      }),
    },
  );

  const json = await res.json();
  if (!res.ok) {
    const msg = json.error?.message ?? 'Unknown error';
    if (msg === 'EMAIL_EXISTS') throw new Error('El email ya está registrado.');
    if (msg.includes('WEAK_PASSWORD')) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    throw new Error(msg);
  }

  const uid: string = json.localId;
  const fs = getFirestoreDb();
  await setDoc(doc(fs, 'users', uid), {
    uid,
    email:       data.email,
    name:        data.name,
    role:        data.role,
    clinicId:    data.clinicId,
    permissions: data.permissions,
    createdAt:   serverTimestamp(),
  });

  return uid;
}

/** @deprecated Use createUser instead */
export const crearUsuario = createUser;

/** Updates the clinic's contact profile (name, phone, etc.) in Firestore and local Dexie cache. */
export async function updateClinicProfile(
  clinicId: string,
  data: { name?: string; phone?: string },
): Promise<void> {
  const fs = getFirestoreDb();
  const update: Record<string, unknown> = { phone: data.phone ?? null };
  if (data.name !== undefined) update.name = data.name;
  await setDoc(doc(fs, 'clinics', clinicId), update, { merge: true });
  // If name changed, also update the license doc's clinicName
  if (data.name !== undefined) {
    await setDoc(
      doc(fs, 'clinics', clinicId, 'license', 'data'),
      { clinicName: data.name, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  // Keep Dexie in sync so the receipt and UI reflect the change immediately
  const local = await db.session.get('singleton');
  if (local) {
    await db.session.put({
      ...local,
      clinicTel:  data.phone ?? undefined,
      ...(data.name !== undefined ? { clinicName: data.name } : {}),
    });
  }
}

/** @deprecated Use updateClinicProfile instead */
export const actualizarPerfilClinica = updateClinicProfile;

/**
 * Completes the one-time clinic setup for Google-signup users.
 * Saves the real clinic name + phone, marks setupComplete = true,
 * and refreshes the local session so the app sees the updated data.
 */
export async function completeClinicSetup(params: {
  clinicName: string;
  phone:      string;
}): Promise<void> {
  const user = getAuth_().currentUser;
  if (!user) throw new Error('No authenticated user');

  const local = await db.session.get('singleton');
  if (!local) throw new Error('No local session found');

  const clinicId = local.clinicId;
  const fs = getFirestoreDb();

  await setDoc(doc(fs, 'clinics', clinicId), {
    name:  params.clinicName,
    phone: params.phone,
  }, { merge: true });

  await setDoc(doc(fs, 'clinics', clinicId, 'license', 'data'), {
    clinicName: params.clinicName,
    updatedAt:  serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(fs, 'users', user.uid), {
    setupComplete: true,
  }, { merge: true });

  await refreshSession(user);
}

/** @deprecated Use completeClinicSetup instead */
export const completarSetupClinica = completeClinicSetup;

/**
 * Creates the full clinic setup for a first-time Google user.
 * Called from the /setup page. Creates clinic, license, and user docs in one
 * atomic batch — identical to what email registration does in register().
 * Also handles the legacy case where a user doc already exists with setupComplete=false
 * by reusing the existing clinicId.
 */
export async function createClinicFromSetup(params: {
  clinicName: string;
  phone:      string;
}): Promise<void> {
  const user = getAuth_().currentUser;
  if (!user) throw new Error('No authenticated user');

  // Idempotent: a user who already has a clinic gets it back unchanged.
  await _registerClinic({
    clinicName: params.clinicName,
    userName:   user.displayName ?? user.email ?? undefined,
    phone:      params.phone,
    logoUrl:    user.photoURL ?? undefined,
  });
  await refreshSession(user);
}

/** @deprecated Use createClinicFromSetup instead */
export const crearClinicaDesdeSetup = createClinicFromSetup;

/** Creates or updates the license document for a clinic. */
export async function configureLicense(params: {
  clinicId:       string;
  clinicName:     string;
  plan:           string;
  expirationDate: string;
  subscription:   boolean;
}): Promise<void> {
  const fs = getFirestoreDb();
  await setDoc(
    doc(fs, 'clinics', params.clinicId, 'license', 'data'),
    { ...params, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** @deprecated Use configureLicense instead */
export const configurarLicencia = configureLicense;

/** Updates a user's name, role, permissions and optionally personal phone */
export async function updateUser(
  uid:  string,
  data: { name: string; role: UserRole; permissions: Permissions | null; phone?: string },
): Promise<void> {
  const fs = getFirestoreDb();
  await setDoc(doc(fs, 'users', uid), data, { merge: true });
}

/** @deprecated Use updateUser instead */
export const actualizarUsuario = updateUser;

/** Sends a password reset email via Firebase Auth */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getAuth_(), email);
}

/** @deprecated Use sendPasswordReset instead */
export const enviarResetPassword = sendPasswordReset;

/** Lists all users of a clinic (admin/master only, requires internet) */
export async function listUsers(clinicId: string): Promise<FirestoreUser[]> {
  const fs   = getFirestoreDb();
  const snap = await getDocs(collection(fs, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }) as FirestoreUser)
    .filter((u) => u.clinicId === clinicId);
}

/** @deprecated Use listUsers instead */
export const listarUsuarios = listUsers;

/**
 * Removes a user's Firestore document entirely.
 * This causes refreshSession to return null on their next online check,
 * which forces them out of the app automatically.
 */
export async function deleteUser(uid: string): Promise<void> {
  const fs = getFirestoreDb();
  await deleteDoc(doc(fs, 'users', uid));
}

/** @deprecated Use deleteUser instead */
export const eliminarUsuario = deleteUser;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _registerClinic(data: {
  clinicName: string;
  userName?:  string;
  phone?:     string;
  logoUrl?:   string;
}): Promise<{ clinicId: string; created: boolean }> {
  const fn = httpsCallable<typeof data, { clinicId: string; created: boolean }>(
    getFirebaseFunctions(),
    'registerClinic',
  );
  const result = await fn(data);
  return result.data;
}

async function _createUserDoc(
  user:          User,
  name:          string,
  role:          UserRole,
  clinicId:      string,
  permissions:   Permissions | null,
  setupComplete: boolean = true,
): Promise<void> {
  const fs = getFirestoreDb();
  await setDoc(doc(fs, 'users', user.uid), {
    uid:         user.uid,
    email:       user.email,
    name,
    role,
    clinicId,
    permissions,
    setupComplete,
    createdAt:   serverTimestamp(),
  });
}

/** @deprecated Use _createUserDoc instead */
const _crearDocUsuario = _createUserDoc;
void _crearDocUsuario; // suppress unused warning

// TODO: enable when Firebase Storage plan is upgraded
// async function _uploadLogo(clinicId: string, file: File): Promise<string> {
//   const st      = getStorageBucket();
//   const logoRef = ref(st, `clinics/${clinicId}/logo`);
//   await uploadBytes(logoRef, file, { contentType: file.type });
//   return getDownloadURL(logoRef);
// }

// ─── Dev helpers ──────────────────────────────────────────────────────────────

function _devLicense() {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return {
    plan:           'Dev',
    expirationDate: expiry.toISOString().slice(0, 10),
    subscription:   true,
    clinicName:     'House of Pets (Dev)',
  };
}

/**
 * Maps the license's billing state (billingNotice, graceUntil, lastPaymentAt, plan limits) to the flat session
 * fields. Absent or null = not set, so a cleared notice also clears the session.
 */
export function billingStateFields(
  license: Record<string, unknown>,
): Pick<SessionLocal, 'billingNoticeAt' | 'billingNoticeBlocking' | 'graceUntil' | 'lastPaymentAt' | 'planLimits' | 'planPeriod'> {
  const notice = license.billingNotice as { at?: unknown; blocking?: unknown } | null | undefined;
  const hasNotice = !!notice && typeof notice.at === 'number';
  return {
    billingNoticeAt:       hasNotice ? notice.at as number : undefined,
    billingNoticeBlocking: hasNotice ? notice.blocking === true : undefined,
    graceUntil:            typeof license.graceUntil === 'number' ? license.graceUntil : undefined,
    lastPaymentAt:         typeof license.lastPaymentAt === 'number' ? license.lastPaymentAt : undefined,
    planLimits:            limitsFromLicense(license),
    planPeriod:            license.planPeriod === 'annual' ? 'annual' : license.planPeriod === 'monthly' ? 'monthly' : undefined,
  };
}

/** Already expired: the clinic sees the payment screen instead of the app. */
function _missingLicense() {
  const yesterday = new Date(Date.now() - 86_400_000);
  return {
    plan:           'none',
    expirationDate: yesterday.toISOString().slice(0, 10),
    subscription:   true,
    clinicName:     undefined as string | undefined,
  };
}

/** @deprecated Use _devLicense instead */
const _licenciaDev = _devLicense;
void _licenciaDev; // suppress unused warning

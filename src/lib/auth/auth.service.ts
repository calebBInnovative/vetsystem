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
  writeBatch,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
// TODO: enable when Firebase Storage plan is upgraded
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebaseApp, getFirestoreDb } from '@/lib/firebase/firebase.config';
import { db } from '@/lib/db/database';
import type { SessionLocal, Permissions, RolUsuario } from '@/types/licencia';

// ─── Firestore structure ──────────────────────────────────────────────────────
//
//  users/{uid}
//    clinicId:     string
//    name:         string
//    email:        string
//    role:         'master' | 'admin' | 'veterinario' | 'recepcion'
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
 * Thrown by refrescarSesion when the user's Firestore document does not exist.
 * Distinct from a network error so callers can decide whether to force-logout.
 */
export class UserNotFoundError extends Error {
  override name = 'UserNotFoundError';
}

// Default permissions for staff users whose Firestore doc is missing the permissions field
const DEFAULT_STAFF_PERMISSIONS: Permissions = {
  pacientes: true, agenda: true, consultas: true, ventas: true,
  inventario: false, finanzas: false, facturas: false, servicios: false,
};

// ─── Auth principal ───────────────────────────────────────────────────────────

/** Login with email/password. Requires internet. */
export async function login(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(getAuth_(), email, password);
  await refrescarSesion(credential.user);
}

/**
 * Register new clinic owner (master) with email/password.
 * Creates the clinic document, uploads logo if provided, then opens session.
 */
export async function registrarse(params: {
  email:      string;
  password:   string;
  name:       string;
  clinicName: string;
  telefono?:  string;
  logo?:      File | null;
}): Promise<void> {
  const credential = await createUserWithEmailAndPassword(getAuth_(), params.email, params.password);
  const user       = credential.user;
  const clinicId   = _slugify(params.clinicName) || user.uid.slice(0, 8);

  try {
    // TODO: enable when Firebase Storage plan is upgraded
    const logoUrl: string | null = null;
    // if (params.logo) {
    //   try { logoUrl = await _subirLogo(clinicId, params.logo); }
    //   catch (err) { console.warn('[auth] Logo upload failed:', err); }
    // }

    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);

    const fs    = getFirestoreDb();
    const batch = writeBatch(fs);

    // All 3 documents written atomically — either all succeed or none do
    batch.set(doc(fs, 'clinics', clinicId), {
      name:      params.clinicName,
      logoUrl,
      telefono:  params.telefono ?? null,
      createdAt: serverTimestamp(),
    }, { merge: true });

    batch.set(doc(fs, 'clinics', clinicId, 'license', 'data'), {
      clinicName:     params.clinicName,
      plan:           'Trial',
      expirationDate: expiry.toISOString().slice(0, 10),
      subscription:   true,
      updatedAt:      serverTimestamp(),
    }, { merge: true });

    batch.set(doc(fs, 'users', user.uid), {
      uid:         user.uid,
      email:       user.email,
      name:        params.name,
      role:        'admin',
      clinicId,
      permissions: null,
      createdAt:   serverTimestamp(),
    });

    await batch.commit();
    await refrescarSesion(user);
  } catch (err) {
    // Batch failed — roll back the Auth user so the person can retry with the same email.
    try { await user.delete(); } catch { /* ignore, surface the original error */ }
    throw err;
  }
}

/** Sign in or register with Google popup. Creates clinic + user doc on first login. */
export async function loginConGoogle(): Promise<void> {
  const provider   = new GoogleAuthProvider();
  const credential = await signInWithPopup(getAuth_(), provider);
  const user       = credential.user;
  const fs         = getFirestoreDb();

  const userDoc = await getDoc(doc(fs, 'users', user.uid));
  if (!userDoc.exists()) {
    const name     = user.displayName ?? user.email ?? 'Usuario';
    const clinicId = _slugify(name) || user.uid.slice(0, 8);
    // Google auth can't be rolled back, so we must ensure both writes succeed.
    // If either fails, the error propagates and the user sees it — on retry,
    // setDoc is idempotent so re-running is safe.
    await _crearClinica({ clinicId, clinicName: name, logoUrl: user.photoURL ?? null });
    await _crearDocUsuario(user, name, 'admin', clinicId, null);
  }

  await refrescarSesion(user);
}

/** Logout. Deletes local session from Dexie. */
export async function logout(): Promise<void> {
  await firebaseSignOut(getAuth_());
  await db.session.delete('singleton');
}

/**
 * Refreshes session and license from Firestore.
 * Returns null on network/transient errors (caller should keep cached session).
 * Throws UserNotFoundError when the user doc is confirmed missing (caller should force-logout).
 */
export async function refrescarSesion(user: User): Promise<SessionLocal | null> {
  try {
    const fs = getFirestoreDb();

    const userDoc = await getDoc(doc(fs, 'users', user.uid));
    if (!userDoc.exists()) {
      if (process.env.NODE_ENV === 'development') {
        return await _crearSesionDev(user);
      }
      throw new UserNotFoundError(`User ${user.uid} not found in Firestore.`);
    }

    const userData = userDoc.data();
    const clinicId: string  = userData.clinicId;
    const role:     RolUsuario = userData.role ?? 'recepcion';
    const permissions: Permissions | null =
      (role === 'master' || role === 'admin')
        ? null
        : ((userData.permissions as Permissions | null | undefined) ?? DEFAULT_STAFF_PERMISSIONS);

    const licenseDoc  = await getDoc(doc(fs, 'clinics', clinicId, 'license', 'data'));
    const licenseData = licenseDoc.exists() ? licenseDoc.data() : _licenciaDev();

    const clinicDoc   = await getDoc(doc(fs, 'clinics', clinicId));
    const clinicData  = clinicDoc.exists() ? clinicDoc.data() : null;

    await setDoc(doc(fs, 'users', user.uid), { lastAccess: serverTimestamp() }, { merge: true });

    const ahora = Date.now();
    const session: SessionLocal = {
      id:             'singleton',
      uid:            user.uid,
      email:          user.email ?? '',
      clinicId,
      clinicName:     licenseData.clinicName ?? clinicData?.name ?? clinicId,
      clinicLogoUrl:  clinicData?.logoUrl ?? undefined,
      clinicTel:      clinicData?.telefono ?? undefined,
      userTel:        userData.telefono ?? undefined,
      userName:       userData.name ?? user.email ?? 'User',
      role,
      permissions,
      plan:           licenseData.plan ?? 'Basic',
      expirationDate: licenseData.expirationDate ?? '2099-12-31',
      subscription:   licenseData.subscription !== false,
      lastSync:       ahora,
      cachedAt:       ahora,
    };

    await db.session.put(session);
    return session;
  } catch (err) {
    if (err instanceof UserNotFoundError) throw err; // caller must force-logout
    console.error('[auth] refrescarSesion failed:', err);
    return null; // transient/network error — caller should keep cached session
  }
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuth_(), callback);
}

export async function getSesionLocal(): Promise<SessionLocal | null> {
  return (await db.session.get('singleton')) ?? null;
}

// ─── User management (from admin) ────────────────────────────────────────────

export interface NuevoUsuario {
  email:       string;
  password:    string;
  name:        string;
  role:        RolUsuario;
  clinicId:    string;
  permissions: Permissions | null;
}

export interface UsuarioFirestore {
  uid:         string;
  email:       string;
  name:        string;
  role:        RolUsuario;
  clinicId:    string;
  permissions: Permissions | null;
  createdAt?:  unknown;
}

/**
 * Creates a user in Firebase Auth + their Firestore document.
 * Uses REST API to NOT log out the current master/admin.
 */
export async function crearUsuario(datos: NuevoUsuario): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('Firebase API key not configured.');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:             datos.email,
        password:          datos.password,
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
    email:     datos.email,
    name:      datos.name,
    role:      datos.role,
    clinicId:    datos.clinicId,
    permissions: datos.permissions,
    createdAt:   serverTimestamp(),
  });

  return uid;
}

/** Updates the clinic's contact profile (name, phone, etc.) in Firestore and local Dexie cache. */
export async function actualizarPerfilClinica(
  clinicId: string,
  datos: { nombre?: string; telefono?: string },
): Promise<void> {
  const fs = getFirestoreDb();
  const update: Record<string, unknown> = { telefono: datos.telefono ?? null };
  if (datos.nombre !== undefined) update.name = datos.nombre;
  await setDoc(doc(fs, 'clinics', clinicId), update, { merge: true });
  // If name changed, also update the license doc's clinicName
  if (datos.nombre !== undefined) {
    await setDoc(
      doc(fs, 'clinics', clinicId, 'license', 'data'),
      { clinicName: datos.nombre, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  // Keep Dexie in sync so the receipt and UI reflect the change immediately
  const local = await db.session.get('singleton');
  if (local) {
    await db.session.put({
      ...local,
      clinicTel:  datos.telefono ?? undefined,
      ...(datos.nombre !== undefined ? { clinicName: datos.nombre } : {}),
    });
  }
}

/** Creates or updates the license document for a clinic. */
export async function configurarLicencia(params: {
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

/** Updates a user's name, role, permissions and optionally personal phone */
export async function actualizarUsuario(
  uid:      string,
  datos:    { name: string; role: RolUsuario; permissions: Permissions | null; telefono?: string },
): Promise<void> {
  const fs = getFirestoreDb();
  await setDoc(doc(fs, 'users', uid), datos, { merge: true });
}

/** Sends a password reset email via Firebase Auth */
export async function enviarResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getAuth_(), email);
}

/** Lists all users of a clinic (admin/master only, requires internet) */
export async function listarUsuarios(clinicId: string): Promise<UsuarioFirestore[]> {
  const fs   = getFirestoreDb();
  const snap = await getDocs(collection(fs, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }) as UsuarioFirestore)
    .filter((u) => u.clinicId === clinicId);
}

/**
 * Removes a user's Firestore document entirely.
 * This causes refrescarSesion to return null on their next online check,
 * which forces them out of the app automatically.
 */
export async function eliminarUsuario(uid: string): Promise<void> {
  const fs = getFirestoreDb();
  await deleteDoc(doc(fs, 'users', uid));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _crearClinica(params: {
  clinicId:   string;
  clinicName: string;
  logoUrl:    string | null;
  telefono?:  string;
}): Promise<void> {
  const fs = getFirestoreDb();

  await setDoc(doc(fs, 'clinics', params.clinicId), {
    name:      params.clinicName,
    logoUrl:   params.logoUrl,
    telefono:  params.telefono ?? null,
    createdAt: serverTimestamp(),
  }, { merge: true });

  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);

  await setDoc(doc(fs, 'clinics', params.clinicId, 'license', 'data'), {
    clinicName:     params.clinicName,
    plan:           'Trial',
    expirationDate: expiry.toISOString().slice(0, 10),
    subscription:   true,
    updatedAt:      serverTimestamp(),
  }, { merge: true });
}

async function _crearDocUsuario(
  user:        User,
  name:        string,
  role:        RolUsuario,
  clinicId:    string,
  permissions: Permissions | null,
): Promise<void> {
  const fs = getFirestoreDb();
  await setDoc(doc(fs, 'users', user.uid), {
    uid:         user.uid,
    email:       user.email,
    name,
    role,
    clinicId,
    permissions,
    createdAt:   serverTimestamp(),
  });
}

// TODO: enable when Firebase Storage plan is upgraded
// async function _subirLogo(clinicId: string, file: File): Promise<string> {
//   const st      = getStorageBucket();
//   const logoRef = ref(st, `clinics/${clinicId}/logo`);
//   await uploadBytes(logoRef, file, { contentType: file.type });
//   return getDownloadURL(logoRef);
// }

function _slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Dev helpers ──────────────────────────────────────────────────────────────

function _licenciaDev() {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return {
    plan:           'Dev',
    expirationDate: expiry.toISOString().slice(0, 10),
    subscription:   true,
    clinicName:     'House of Pets (Dev)',
  };
}

async function _crearSesionDev(user: User): Promise<SessionLocal> {
  const ahora   = Date.now();
  const license = _licenciaDev();
  const session: SessionLocal = {
    id:             'singleton',
    uid:            user.uid,
    email:          user.email ?? '',
    clinicId:       process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets',
    clinicName:     license.clinicName,
    userName:       user.displayName ?? user.email ?? 'Dev Admin',
    role:           'master',
    permissions:    null,
    plan:           license.plan,
    expirationDate: license.expirationDate,
    subscription:   true,
    lastSync:       ahora,
    cachedAt:       ahora,
  };
  await db.session.put(session);
  return session;
}

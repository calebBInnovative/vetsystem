'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, useRef,
  type ReactNode,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  onAuthChange, getLocalSession, refreshSession, logout, UserNotFoundError, isUserCreationInFlight,
  billingNoticeFields,
} from '@/lib/auth/auth.service';
import { db, ensureDbReady } from '@/lib/db/database';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';
import { calculateLicense } from '@/lib/license/license.service';
import { setMonitoringContext } from '@/lib/monitoring/context';
import type { LicenseInfo, SessionLocal } from '@/types/license';
import type { User } from 'firebase/auth';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  firebaseUser:     User | null;
  session:          SessionLocal | null;
  license:          LicenseInfo;
  loading:         boolean;
  /** true while a Firestore session refresh is in-flight with no cached session */
  syncing:    boolean;
  refreshFromDexie: () => Promise<void>;
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser:     null,
  session:          null,
  license:          { mode: 'blocked', daysOffline: 0, daysUntilExpiry: null, billingDue: false, session: null },
  loading:         true,
  syncing:    false,
  refreshFromDexie: async () => {},
  retrySession: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser,  setFirebaseUser]  = useState<User | null>(null);
  const [session,       setSession]       = useState<SessionLocal | null>(null);
  const [loading,      setLoading]       = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Keep a ref to the current Firebase user so retrySession can access it
  const firebaseUserRef = useRef<User | null>(null);
  firebaseUserRef.current = firebaseUser;

  // Bumped when a scheduled billing notice comes due, so the license is recalculated.
  const [, setLicenseClock] = useState(0);
  const license = calculateLicense(session);

  // ── Live license ─────────────────────────────────────────────────────────
  // The platform owner can schedule a billing notice or a payment can renew the
  // license at any moment; listening means neither needs a reload or re-login.
  const clinicId = session?.clinicId;
  const isDemoSession = session?.isDemo === true;
  useEffect(() => {
    if (!firebaseUser || !clinicId || isDemoSession) return;
    const ref = doc(getFirestoreDb(), 'clinics', clinicId, 'license', 'data');
    return onSnapshot(ref, async (snap) => {
      if (!snap.exists() || snap.metadata.fromCache) return;
      const data = snap.data();
      const local = await getLocalSession();
      if (!local || local.clinicId !== clinicId) return;
      const now = Date.now();
      const next: SessionLocal = {
        ...local,
        plan:           typeof data.plan === 'string' ? data.plan : local.plan,
        expirationDate: typeof data.expirationDate === 'string' ? data.expirationDate : local.expirationDate,
        subscription:   data.subscription !== false,
        ...billingNoticeFields(data),
        lastSync:       now,
        cachedAt:       now,
      };
      await db.session.put(next);
      setSession(next);
    }, (err) => console.warn('[auth] license listener failed:', err));
  }, [firebaseUser, clinicId, isDemoSession]);

  // ── Fire a scheduled billing notice on time, without waiting for a re-render ──
  const billingNoticeAt = session?.billingNoticeAt;
  useEffect(() => {
    if (billingNoticeAt === undefined) return;
    const delay = billingNoticeAt - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setLicenseClock((n) => n + 1), Math.min(delay + 250, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [billingNoticeAt]);

  // Tag error reports with the clinic, role and plan — never the person
  useEffect(() => { setMonitoringContext(session); }, [session]);

  const refreshFromDexie = useCallback(async () => {
    const local = await getLocalSession();
    setSession(local);
  }, []);

  // ── Core Firestore refresh with retry ─────────────────────────────────────
  const tryRefresh = useCallback(async (user: User) => {
    const local = await getLocalSession();
    if (local?.isDemo) return;

    // Only show syncing when there is no cached session to fall back on
    const noCache = !local;
    if (noCache) setSyncing(true);

    const MAX_RETRIES = 3;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const s = await refreshSession(user);
        if (s) {
          setSession(s);
          setSyncing(false);
          return;
        }
        if (local) { setSyncing(false); return; }
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          // Email register() is mid-write — wait for the batch to commit.
          if (isUserCreationInFlight()) {
            await new Promise<void>((r) => setTimeout(r, 3000));
            continue;
          }
          if (local) {
            // Had a prior session → user doc was deleted → force logout
            await logout();
            setFirebaseUser(null);
            setSession(null);
            setSyncing(false);
            return;
          }
          // No prior session, no write in flight → new Google user waiting for /setup
          setSyncing(false);
          return;
        }
        if (local) { setSyncing(false); return; }
      }
      if (i < MAX_RETRIES - 1) {
        await new Promise<void>((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }

    // All retries exhausted — leave syncing=true so the UI shows retry screen
    // (not "blocked")
  }, []);

  // ── Ensure DB is open (and auto-recover if schema is corrupt) ────────────
  useEffect(() => {
    ensureDbReady().catch((err) =>
      console.error('[DB] Could not open database after recovery attempt:', err)
    );
  }, []);

  // ── Firebase Auth listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);

      if (user) {
        const local = await getLocalSession();
        setSession(local);
        await tryRefresh(user);
      } else {
        const local = await getLocalSession();
        if (local?.isDemo) {
          setSession(local);
        } else {
          setSession(null);
        }
        setSyncing(false);
      }

      setLoading(false);
    });

    return unsub;
  }, [tryRefresh]);

  // ── Refresh when reconnecting ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (firebaseUser && !session?.isDemo) tryRefresh(firebaseUser);
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [firebaseUser, session, tryRefresh]);

  const retrySession = useCallback(() => {
    const user = firebaseUserRef.current;
    if (user) tryRefresh(user);
  }, [tryRefresh]);

  return (
    <AuthContext.Provider value={{
      firebaseUser, session, license, loading,
      syncing, refreshFromDexie, retrySession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, useRef,
  type ReactNode,
} from 'react';
import { onAuthChange, getSesionLocal, refrescarSesion, logout, UserNotFoundError, isUserCreationInFlight } from '@/lib/auth/auth.service';
import { calcularLicencia } from '@/lib/license/license.service';
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
  license:          { modo: 'bloqueado', diasOffline: 0, diasParaVencer: null, session: null },
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
  const [loading,      setCargando]      = useState(true);
  const [syncing, setSincronizando] = useState(false);

  // Keep a ref to the current Firebase user so retrySession can access it
  const firebaseUserRef = useRef<User | null>(null);
  firebaseUserRef.current = firebaseUser;

  const license = calcularLicencia(session);

  const refreshFromDexie = useCallback(async () => {
    const local = await getSesionLocal();
    setSession(local);
  }, []);

  // ── Core Firestore refresh with retry ─────────────────────────────────────
  const tryRefresh = useCallback(async (user: User) => {
    const local = await getSesionLocal();
    if (local?.isDemo) return;

    // Only show syncing when there is no cached session to fall back on
    const sinCache = !local;
    if (sinCache) setSincronizando(true);

    const MAX_INTENTOS = 3;
    for (let i = 0; i < MAX_INTENTOS; i++) {
      try {
        const s = await refrescarSesion(user);
        if (s) {
          setSession(s);
          setSincronizando(false);
          return;
        }
        if (local) { setSincronizando(false); return; }
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          // Email registrarse() is mid-write — wait for the batch to commit.
          if (isUserCreationInFlight()) {
            await new Promise<void>((r) => setTimeout(r, 3000));
            continue;
          }
          if (local) {
            // Had a prior session → user doc was deleted → force logout
            await logout();
            setFirebaseUser(null);
            setSession(null);
            setSincronizando(false);
            return;
          }
          // No prior session, no write in flight → new Google user waiting for /setup
          setSincronizando(false);
          return;
        }
        if (local) { setSincronizando(false); return; }
      }
      if (i < MAX_INTENTOS - 1) {
        await new Promise<void>((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }

    // All retries exhausted — leave syncing=true so the UI shows retry screen
    // (not "bloqueado")
  }, []);

  // ── Firebase Auth listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);

      if (user) {
        const local = await getSesionLocal();
        setSession(local);
        await tryRefresh(user);
      } else {
        const local = await getSesionLocal();
        if (local?.isDemo) {
          setSession(local);
        } else {
          setSession(null);
        }
        setSincronizando(false);
      }

      setCargando(false);
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

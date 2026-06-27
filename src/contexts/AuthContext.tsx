'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, useRef,
  type ReactNode,
} from 'react';
import { onAuthChange, getSesionLocal, refrescarSesion, logout, UserNotFoundError } from '@/lib/auth/auth.service';
import { calcularLicencia } from '@/lib/license/license.service';
import type { LicenseInfo, SessionLocal } from '@/types/licencia';
import type { User } from 'firebase/auth';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  firebaseUser:     User | null;
  session:          SessionLocal | null;
  license:          LicenseInfo;
  cargando:         boolean;
  /** true while a Firestore session refresh is in-flight with no cached session */
  sincronizando:    boolean;
  refreshFromDexie: () => Promise<void>;
  reintentarSesion: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser:     null,
  session:          null,
  license:          { modo: 'bloqueado', diasOffline: 0, diasParaVencer: null, session: null },
  cargando:         true,
  sincronizando:    false,
  refreshFromDexie: async () => {},
  reintentarSesion: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser,  setFirebaseUser]  = useState<User | null>(null);
  const [session,       setSession]       = useState<SessionLocal | null>(null);
  const [cargando,      setCargando]      = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // Keep a ref to the current Firebase user so reintentarSesion can access it
  const firebaseUserRef = useRef<User | null>(null);
  firebaseUserRef.current = firebaseUser;

  const license = calcularLicencia(session);

  const refreshFromDexie = useCallback(async () => {
    const local = await getSesionLocal();
    setSession(local);
  }, []);

  // ── Core Firestore refresh with retry ─────────────────────────────────────
  const intentarRefrescar = useCallback(async (user: User) => {
    const local = await getSesionLocal();
    if (local?.isDemo) return;

    // Only show sincronizando when there is no cached session to fall back on
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
          await logout();
          setFirebaseUser(null);
          setSession(null);
          setSincronizando(false);
          return;
        }
        if (local) { setSincronizando(false); return; }
      }
      if (i < MAX_INTENTOS - 1) {
        await new Promise<void>((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }

    // All retries exhausted — leave sincronizando=true so the UI shows retry screen
    // (not "bloqueado")
  }, []);

  // ── Firebase Auth listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);

      if (user) {
        const local = await getSesionLocal();
        setSession(local);
        await intentarRefrescar(user);
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
  }, [intentarRefrescar]);

  // ── Refresh when reconnecting ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (firebaseUser && !session?.isDemo) intentarRefrescar(firebaseUser);
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [firebaseUser, session, intentarRefrescar]);

  const reintentarSesion = useCallback(() => {
    const user = firebaseUserRef.current;
    if (user) intentarRefrescar(user);
  }, [intentarRefrescar]);

  return (
    <AuthContext.Provider value={{
      firebaseUser, session, license, cargando,
      sincronizando, refreshFromDexie, reintentarSesion,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

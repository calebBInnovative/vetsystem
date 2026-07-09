'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, WifiOff } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, session, loading, syncing, retrySession } = useAuth();
  const router = useRouter();

  const isDemo = session?.isDemo === true;

  useEffect(() => {
    if (!loading && !firebaseUser && !isDemo) {
      router.replace('/login');
      return;
    }
    if (!loading && session?.setupComplete === false) {
      router.replace('/setup');
      return;
    }
    // New Google user with no session yet (no Firestore docs) → send to setup
    if (!loading && firebaseUser && !session && !syncing && !isDemo) {
      router.replace('/setup');
    }
  }, [loading, firebaseUser, session, syncing, isDemo, router]);

  // 1. Estado inicial — Firebase auth aún no resolvió
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 2. No autenticado → el useEffect redirige a /login
  if (!firebaseUser && !isDemo) return null;

  // 3. Firebase auth OK pero la sesión de Firestore aún carga (o todos los reintentos fallaron)
  //    Nunca mostrar "Sistema bloqueado" aquí — ese mensaje es para licencias vencidas
  if (!session && !isDemo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
        {syncing ? (
          <>
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Iniciando sesión…</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <WifiOff size={24} className="text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">No se pudo conectar al servidor</p>
              <p className="text-sm text-muted-foreground">
                Verifica tu conexión e intenta nuevamente.
              </p>
            </div>
            <button
              onClick={retrySession}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reintentar
            </button>
          </>
        )}
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}

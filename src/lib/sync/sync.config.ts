/**
 * ─── PUNTO DE CONFIGURACIÓN ÚNICO ────────────────────────────────────────────
 *
 * Para cambiar de backend cambia SOLO este archivo.
 * El resto de la app nunca importa Firebase ni Supabase directamente.
 *
 * Opciones disponibles:
 *   FirebaseSyncProvider  → Firestore (producción)
 *   LocalSyncProvider     → Sin sync, solo local (dev / tests)
 *
 * Cuando quieras agregar Supabase:
 *   1. Crea src/lib/sync/providers/supabase.provider.ts
 *   2. Cambia la línea de abajo
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FirebaseSyncProvider } from './providers/firebase.provider';
import { LocalSyncProvider }    from './providers/local.provider';
import type { SyncProvider }    from './sync.provider';
import { CLINIC_ID }            from '@/lib/config';

function buildProvider(): SyncProvider {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    return new FirebaseSyncProvider(CLINIC_ID);
  }
  // Sin variables de entorno → modo offline puro
  return new LocalSyncProvider();
}

export const syncProvider: SyncProvider = buildProvider();

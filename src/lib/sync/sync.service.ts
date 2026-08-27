'use client';

/**
 * SyncService — zero-polling, event-driven sync.
 *
 * Read cost model:
 *   start()         → 1 pull (catch-up from cursor) + 15 onSnapshot opens (1 read each, 0 docs if cursor is fresh)
 *   idle            → 0 reads (Firestore pushes changes to listeners, never polled)
 *   remote change   → 1 read per changed document, pushed by Firestore
 *   local mutation  → 1 write (flush), 0 reads
 *   reconnect       → flush() only, no re-pull (listeners auto-reconnect)
 *
 * There are NO setInterval calls in this file.
 */

import { db } from '@/lib/db/database';
import { syncProvider } from './sync.config';
import { toast } from 'sonner';
import type { RemoteDoc } from './sync.provider';

async function isDemoSession(): Promise<boolean> {
  const s = await db.session.get('singleton');
  return s?.isDemo === true;
}

const MAX_INTENTOS = 5;
const BATCH_SIZE   = 20;

const TABLAS_SYNC = [
  { nombre: 'owners',               tabla: () => db.owners               },
  { nombre: 'patients',             tabla: () => db.patients             },
  { nombre: 'products',             tabla: () => db.products             },
  { nombre: 'services',             tabla: () => db.services             },
  { nombre: 'consultations',        tabla: () => db.consultations        },
  { nombre: 'appointments',         tabla: () => db.appointments         },
  { nombre: 'movements',            tabla: () => db.movements            },
  { nombre: 'payments',             tabla: () => db.payments             },
  { nombre: 'invoices',             tabla: () => db.invoices             },
  { nombre: 'sales',                tabla: () => db.sales                },
  { nombre: 'fixedExpenses',        tabla: () => db.fixedExpenses        },
  { nombre: 'expensePayments',      tabla: () => db.expensePayments      },
  { nombre: 'collaborators',        tabla: () => db.collaborators        },
  { nombre: 'collaboratorPayments', tabla: () => db.collaboratorPayments },
  { nombre: 'promotions',           tabla: () => db.promotions           },
] as const;

export type SyncAllProgress = {
  collection:    string;
  enviados:      number;
  total:         number;
  errores:       number;
  mensajesError: string[];
};

// ─── Dexie upsert helper (shared by pullAll and subscribeAll) ─────────────────

async function upsertRemoteDocs(
  nombre: string,
  remoteDocs: RemoteDoc[],
): Promise<void> {
  if (remoteDocs.length === 0) return;

  type LocalTable = {
    get(id: string): Promise<{ updatedAt: number } | undefined>;
    put(item: object): Promise<unknown>;
  };
  const t = (
    TABLAS_SYNC.find((x) => x.nombre === nombre)!.tabla()
  ) as unknown as LocalTable;

  for (const remoteDoc of remoteDocs) {
    const { _syncedAt, ...clean } = remoteDoc as Record<string, unknown>;
    void _syncedAt;
    const local = await t.get(clean.id as string);
    if (!local || (clean.updatedAt as number) > local.updatedAt) {
      await t.put({ ...clean, syncStatus: 'synced' });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class SyncService {
  private corriendo   = false;
  private pulling     = false;
  private hookReg     = false;
  private unsubscribers: (() => void)[] = [];

  // ── Start / stop ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Prevent double-start (e.g., React StrictMode double-effect)
    if (this.unsubscribers.length > 0) return;

    // Immediately push any queued items whenever a new one is added
    if (!this.hookReg) {
      db.syncQueue.hook('creating', () => {
        setTimeout(() => this.flush(), 0);
      });
      this.hookReg = true;
    }

    // On reconnect: only flush pending writes. The onSnapshot listeners
    // reconnect automatically and will deliver any changes we missed.
    window.addEventListener('online', this.onOnline);

    // Step 1 — one-time catch-up pull: fetches everything that changed while
    // this device was offline (or since the last session). Advances the cursor.
    const cursor = await this.pullAll();

    // Step 2 — push anything queued from the offline period
    await this.resetDeadQueueItems();
    await this.flush();

    // Step 3 — open real-time listeners starting from the cursor we just set.
    // Any document pushed to Firestore after this point will arrive here without
    // us having to ask. Zero reads until something actually changes.
    await this.subscribeAll(cursor);
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    window.removeEventListener('online', this.onOnline);
  }

  private onOnline = () => {
    // Listeners reconnect on their own — we only need to flush pending writes.
    this.flush();
  };

  // ── Real-time subscriptions ───────────────────────────────────────────────

  private async subscribeAll(since: number): Promise<void> {
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;

    const { clinicId } = session;

    for (const { nombre } of TABLAS_SYNC) {
      const unsub = syncProvider.subscribe(
        nombre,
        since,
        clinicId,
        async (docs) => {
          console.log(`[sync] realtime — ${docs.length} doc(s) from ${nombre}`);
          try {
            await upsertRemoteDocs(nombre, docs);
          } catch (err) {
            console.error(`[sync] realtime upsert ${nombre}:`, err);
          }
        },
      );
      this.unsubscribers.push(unsub);
    }

    console.log(`[sync] subscribed to ${TABLAS_SYNC.length} collections (since ${new Date(since).toISOString()})`);
  }

  // ── Catch-up pull (called ONCE on start) ─────────────────────────────────

  /**
   * Fetches all documents changed since the last known cursor.
   * Returns the cursor timestamp to pass to subscribeAll().
   */
  async pullAll(): Promise<number> {
    if (this.pulling || !navigator.onLine) return Date.now();
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return Date.now();
    this.pulling = true;

    const { clinicId, uid } = session;
    const LAST_PULL_KEY   = `vetsystem_last_pull_${clinicId}_${uid}`;
    const ACTIVE_USER_KEY = 'vetsystem_sync_active_user';
    const currentUser     = `${clinicId}__${uid}`;

    if (localStorage.getItem(ACTIVE_USER_KEY) !== currentUser) {
      localStorage.removeItem(LAST_PULL_KEY);
      localStorage.setItem(ACTIVE_USER_KEY, currentUser);
    }

    const lastPull      = parseInt(localStorage.getItem(LAST_PULL_KEY) ?? '0', 10);
    const pullStartedAt = Date.now();
    let   pullErrored   = false;
    let   totalReads    = 0;

    console.log(`[sync] pull start — since ${lastPull ? new Date(lastPull).toISOString() : 'beginning'}`);

    try {
      for (const { nombre } of TABLAS_SYNC) {
        try {
          const docs = await syncProvider.pull(nombre, lastPull, clinicId);
          totalReads += 1 + docs.length;
          if (docs.length > 0) {
            console.log(`[sync] pull ${nombre} — ${docs.length} doc(s)`);
            await upsertRemoteDocs(nombre, docs);
          }
        } catch (err) {
          pullErrored = true;
          console.error(`[sync] pull ${nombre} failed:`, err);
        }
      }

      console.log(`[sync] pull done — ${totalReads} Firestore reads`);

      if (!pullErrored) {
        localStorage.setItem(LAST_PULL_KEY, pullStartedAt.toString());
        return pullStartedAt;
      } else {
        if (lastPull === 0) {
          toast.error(
            'Error al sincronizar datos de la clínica. Revisa la consola del navegador.',
            { duration: 8000, id: 'sync-pull-error' },
          );
        }
        return lastPull; // keep old cursor so next pull retries from same point
      }
    } finally {
      this.pulling = false;
    }
  }

  // ── Flush (push local queue → Firestore) ─────────────────────────────────

  async flush(): Promise<void> {
    if (this.corriendo || !navigator.onLine) return;
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    this.corriendo = true;

    try {
      const pendientes = await db.syncQueue
        .where('attempts').below(MAX_INTENTOS)
        .limit(BATCH_SIZE)
        .sortBy('createdAt');

      if (pendientes.length > 0) {
        console.log(`[sync] flush — pushing ${pendientes.length} item(s)`);
      }

      for (const item of pendientes) {
        const itemClinicId =
          ((item.data as Record<string, unknown>).clinicId as string | undefined) ??
          session.clinicId;
        try {
          await syncProvider.push(item.collection, item.documentId, item.data, itemClinicId);
          await db.syncQueue.delete(item.id!);
        } catch (err) {
          console.warn(`[sync] push failed ${item.collection}/${item.documentId}:`, err);
          await db.syncQueue.update(item.id!, { attempts: item.attempts + 1 });
        }
      }
    } finally {
      this.corriendo = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resetDeadQueueItems(): Promise<void> {
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    const dead = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
    if (dead > 0) {
      console.log(`[sync] resetting ${dead} dead queue item(s) for retry`);
      await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).modify({ attempts: 0 });
    }
  }

  // ── Dev-only: force-push everything from Dexie to Firestore ──────────────

  async syncAll(
    onProgress?: (p: SyncAllProgress) => void,
  ): Promise<{ total: number; errores: number; detalles: SyncAllProgress[] }> {
    if (await isDemoSession()) return { total: 0, errores: 0, detalles: [] };
    let totalGlobal   = 0;
    let erroresGlobal = 0;
    const detalles: SyncAllProgress[] = [];

    for (const { nombre, tabla } of TABLAS_SYNC) {
      const docs          = await tabla().toArray();
      let enviados        = 0;
      let errores         = 0;
      const mensajesError: string[] = [];

      for (const doc of docs) {
        const docClinicId = (doc as { clinicId?: string }).clinicId ?? '';
        try {
          await syncProvider.push(nombre, (doc as { id: string }).id, doc, docClinicId);
          enviados++;
        } catch (err) {
          errores++;
          const msg = err instanceof Error ? err.message : String(err);
          if (!mensajesError.includes(msg)) mensajesError.push(msg);
          console.error(`[syncAll] ${nombre}/${(doc as { id: string }).id}:`, msg);
        }
      }

      totalGlobal   += enviados;
      erroresGlobal += errores;
      const progreso: SyncAllProgress = { collection: nombre, enviados, total: docs.length, errores, mensajesError };
      detalles.push(progreso);
      onProgress?.(progreso);
    }

    return { total: totalGlobal, errores: erroresGlobal, detalles };
  }

  // ── Queue status (for UI display) ─────────────────────────────────────────

  async estadoQueue() {
    const pendientes = await db.syncQueue.where('attempts').below(MAX_INTENTOS).count();
    const conError   = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
    return { pendientes, conError };
  }

  async conteoTablas(): Promise<Record<string, number>> {
    const resultado: Record<string, number> = {};
    for (const { nombre, tabla } of TABLAS_SYNC) {
      resultado[nombre] = await tabla().count();
    }
    return resultado;
  }
}

export const syncService = new SyncService();

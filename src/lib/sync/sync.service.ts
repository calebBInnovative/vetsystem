'use client';

/**
 * SyncService — event-driven, zero-polling offline-first sync.
 *
 * Read cost model:
 *   start()        → pullAll (cursor-based, cheap) + 15 onSnapshot opens (0 docs if cursor fresh)
 *   idle           → 0 reads (Firestore pushes changes to listeners)
 *   remote change  → 1 read per changed document, pushed by Firestore
 *   local mutation → 1 write (flush), 0 reads
 *   reconnect      → catch-up pull (from the stored cursor) + flush(); listeners auto-reconnect
 *
 * Retry model:
 *   Push failures use exponential backoff (30s→60s→120s→300s).
 *   Backoff fires whether items are new-failed OR already stuck (attempts≥MAX).
 *   Tab focus / visibility-change also triggers a retry pass.
 *   No setInterval anywhere in this file.
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

// Backoff delays (ms) for failed push retries. The last value repeats forever.
// Fast at first (5 s, 15 s) so brief network blips resolve quickly, then slower.
const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 300_000];

// The pull cursor is a client clock value, but the backend filters on a
// server-set timestamp. Rewind the cursor by this margin on every query so a
// device clock that runs ahead of the server cannot skip documents.
// Re-reading a few docs is harmless: upsertRemoteDocs ignores non-newer data.
const CURSOR_SAFETY_MS = 5 * 60_000;

function rewindCursor(cursor: number): number {
  // 0 means "never pulled" — keep it so providers can run their full-fetch path.
  return cursor > 0 ? Math.max(1, cursor - CURSOR_SAFETY_MS) : 0;
}

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
  { nombre: 'quotes',               tabla: () => db.quotes               },
] as const;

export type SyncAllProgress = {
  collection:    string;
  enviados:      number;
  total:         number;
  errores:       number;
  mensajesError: string[];
};

// ─── Dexie upsert helper ──────────────────────────────────────────────────────

async function upsertRemoteDocs(nombre: string, remoteDocs: RemoteDoc[], clinicId: string): Promise<void> {
  if (remoteDocs.length === 0) return;

  type LocalTable = {
    get(id: string): Promise<{ updatedAt: number } | undefined>;
    put(item: object): Promise<unknown>;
  };
  const t = (TABLAS_SYNC.find((x) => x.nombre === nombre)!.tabla()) as unknown as LocalTable;

  for (const remoteDoc of remoteDocs) {
    const { _syncedAt, ...clean } = remoteDoc as Record<string, unknown>;
    void _syncedAt;
    // The document came from clinics/{clinicId}/..., so its owner is known even
    // when the field is absent. Records pushed with a partial payload arrive
    // without it, and a row with no clinicId is invisible to every query in the
    // app, so stamp it here rather than store an unusable record.
    if (!clean.clinicId) clean.clinicId = clinicId;
    const local = await t.get(clean.id as string);
    if (!local || (clean.updatedAt as number) > local.updatedAt) {
      await t.put({ ...clean, syncStatus: 'synced' });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class SyncService {
  private corriendo     = false;
  private flushRequested = false;
  private started       = false;
  private pulling       = false;
  private hookReg       = false;
  private unsubscribers: (() => void)[] = [];
  private retryTimeout:  ReturnType<typeof setTimeout> | null = null;
  private retryAttempt   = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Guard against concurrent start() calls (e.g. React StrictMode double
    // effects) which would otherwise open duplicate listeners.
    if (this.started) return;
    this.started = true;

    if (!this.hookReg) {
      db.syncQueue.hook('creating', () => {
        setTimeout(() => this.flush(), 0);
      });
      this.hookReg = true;
    }

    window.addEventListener('online',            this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('focus',             this.onFocus);

    const cursor = await this.pullAll();
    await this.flushWithReset();
    if (!this.started) return; // stop() was called while we were pulling
    await this.subscribeAll(cursor);
  }

  stop(): void {
    this.started = false;
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    window.removeEventListener('online',            this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focus',             this.onFocus);
    this.cancelRetry();
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private onOnline = () => {
    console.log('[sync] network online — catch-up pull + flush');
    this.retryAttempt = 0;
    this.cancelRetry();
    // If the app started offline (or the initial pull failed), remote changes
    // made before the listeners opened were never fetched. Pull from the stored
    // cursor to close that gap, then push local changes.
    this.pullAll()
      .catch(() => undefined)
      .then(() => this.flushWithReset())
      .catch(() => undefined);
  };

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.flushWithReset().catch(() => undefined);
    }
  };

  private onFocus = () => {
    this.flushWithReset().catch(() => undefined);
  };

  // ── Retry scheduling ──────────────────────────────────────────────────────

  private scheduleRetry(): void {
    if (this.retryTimeout !== null) return;
    const delay = RETRY_BACKOFF_MS[Math.min(this.retryAttempt, RETRY_BACKOFF_MS.length - 1)];
    this.retryAttempt++;
    console.log(`[sync] retry in ${delay / 1000}s (attempt ${this.retryAttempt})`);
    this.retryTimeout = setTimeout(async () => {
      this.retryTimeout = null;
      if (navigator.onLine) await this.flushWithReset();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimeout !== null) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  // ── Flush helpers ─────────────────────────────────────────────────────────

  /**
   * Reset dead items (attempts ≥ MAX_INTENTOS) back to 0, then flush.
   * Always call this instead of flush() when recovering from failures.
   */
  async flushWithReset(): Promise<void> {
    await this.resetDeadQueueItems();
    await this.flush();
  }

  private async resetDeadQueueItems(): Promise<void> {
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    const dead = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
    if (dead > 0) {
      console.log(`[sync] resetting ${dead} dead queue item(s) for retry`);
      await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).modify({ attempts: 0 });
    }
  }

  // ── Flush (push local syncQueue → Firestore) ─────────────────────────────

  async flush(): Promise<void> {
    if (this.corriendo) {
      // A flush is already running — remember to run again once it finishes so
      // items enqueued mid-flush are not left waiting for the next event.
      this.flushRequested = true;
      return;
    }
    if (!navigator.onLine) return;
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    this.corriendo = true;

    try {
      let hadFailure = false;

      // Drain the queue in batches until it is empty, a push fails (then the
      // backoff takes over), or nothing new was requested.
      for (;;) {
        this.flushRequested = false;

        // Oldest first: order by the createdAt index, then limit.
        const pendientes = await db.syncQueue
          .orderBy('createdAt')
          .filter((i) => i.attempts < MAX_INTENTOS)
          .limit(BATCH_SIZE)
          .toArray();

        if (pendientes.length > 0) {
          console.log(`[sync] flush — pushing ${pendientes.length} item(s)`);
        }

        for (const item of pendientes) {
          const tableEntry = TABLAS_SYNC.find((t) => t.nombre === item.collection);

          // Push the current local row rather than the queued payload. Queued
          // payloads for updates carry only the changed fields, and setDoc with
          // merge happily creates a document from them — so if the original
          // create never synced, the remote ends up holding a few-field ghost
          // that other devices download as a record missing everything the UI
          // expects. The local row is complete by construction.
          type Rec = (Record<string, unknown> & { clinicId?: string }) | undefined;
          const record = tableEntry
            ? await (tableEntry.tabla() as unknown as { get(id: string): Promise<Rec> })
                .get(item.documentId)
            : undefined;

          const payload      = record ?? (item.data as Record<string, unknown>);
          let   itemClinicId = record?.clinicId
            ?? ((item.data as Record<string, unknown>).clinicId as string | undefined);

          // Known collection, no local row, and no owner in the payload: only
          // clearDemo() removes rows outright (real deletes are soft), so this
          // item belongs to data that no longer exists. Nothing can resolve its
          // owner, and pushing it under the current session would leak a foreign
          // record into this clinic.
          if (tableEntry && !record && !itemClinicId) {
            console.warn(
              `[sync] dropping ${item.collection}/${item.documentId} — local record gone, owner unknown`,
            );
            await db.syncQueue.delete(item.id!);
            continue;
          }

          itemClinicId ??= session.clinicId;

          // Dead letter: an item addressed to another clinic can never succeed —
          // the rules deny it, so retrying only loops forever and hides real sync
          // failures behind a permanent "unsynced data" warning.
          if (itemClinicId !== session.clinicId) {
            console.warn(
              `[sync] dropping ${item.collection}/${item.documentId} — belongs to clinic "${itemClinicId}", session is "${session.clinicId}"`,
            );
            await db.syncQueue.delete(item.id!);
            continue;
          }

          try {
            await syncProvider.push(item.collection, item.documentId, payload, itemClinicId);
            await db.syncQueue.delete(item.id!);
            this.retryAttempt = 0;
          } catch (err) {
            hadFailure = true;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[sync] push failed ${item.collection}/${item.documentId}:`, errMsg);

            const newAttempts = item.attempts + 1;
            await db.syncQueue.update(item.id!, { attempts: newAttempts, lastError: errMsg });

            // Notify user when an item officially gets stuck (hits the attempt ceiling)
            if (newAttempts >= MAX_INTENTOS) {
              toast.error(
                'Datos sin sincronizar. Revisa tu conexión o ve a Admin → Sync.',
                { id: 'sync-stuck', duration: 10_000 },
              );
            }
          }
        }

        // Stop on failure (backoff retries later) or when offline; otherwise keep
        // going while the batch was full or new items arrived mid-flush.
        if (hadFailure || !navigator.onLine) break;
        if (pendientes.length < BATCH_SIZE && !this.flushRequested) break;
      }

      // Schedule a retry if there are already-stuck items not in the current batch
      // (accumulated failures from a previous session that weren't reset yet).
      if (!hadFailure) {
        const stuck = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
        if (stuck > 0) hadFailure = true;
      }

      if (hadFailure) this.scheduleRetry();
    } finally {
      this.corriendo = false;
    }
  }

  // ── Real-time subscriptions ───────────────────────────────────────────────

  private async subscribeAll(since: number): Promise<void> {
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    const { clinicId } = session;
    const from = rewindCursor(since);

    for (const { nombre } of TABLAS_SYNC) {
      this.openSubscription(nombre, clinicId, from);
    }

    console.log(`[sync] ${TABLAS_SYNC.length} subscriptions open (since ${new Date(since).toISOString()})`);
  }

  private openSubscription(nombre: string, clinicId: string, since: number): void {
    const unsub = syncProvider.subscribe(
      nombre,
      since,
      clinicId,
      async (docs) => {
        console.log(`[sync] realtime — ${docs.length} doc(s) from ${nombre}`);
        try {
          await upsertRemoteDocs(nombre, docs, clinicId);
        } catch (err) {
          console.error(`[sync] realtime upsert ${nombre}:`, err);
        }
      },
      (err) => {
        // Subscription failed (network drop, auth expiry, etc.).
        // Remove the dead unsub from our list and reopen after a delay.
        console.warn(`[sync] subscription ${nombre} failed — will reopen:`, err.message);
        const idx = this.unsubscribers.indexOf(unsub);
        if (idx !== -1) this.unsubscribers.splice(idx, 1);
        // Reopen in 10 s unless the service was stopped. Checking `started`
        // (not unsubscribers.length) so a listener still reopens when every
        // subscription fails at once, e.g. on auth token expiry.
        setTimeout(() => {
          if (this.started) this.openSubscription(nombre, clinicId, since);
        }, 10_000);
      },
    );
    this.unsubscribers.push(unsub);
  }

  // ── Catch-up pull (called once on start) ─────────────────────────────────

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

    console.log(`[sync] pull start — since ${lastPull ? new Date(lastPull).toISOString() : 'epoch'}`);

    try {
      for (const { nombre } of TABLAS_SYNC) {
        try {
          const docs = await syncProvider.pull(nombre, rewindCursor(lastPull), clinicId);
          totalReads += 1 + docs.length;
          if (docs.length > 0) {
            console.log(`[sync] pull ${nombre} — ${docs.length} doc(s)`);
            await upsertRemoteDocs(nombre, docs, clinicId);
          }
        } catch (err) {
          pullErrored = true;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[sync] pull ${nombre} failed:`, errMsg);
          // Show a toast so the user knows something went wrong
          toast.error(`Error al sincronizar "${nombre}". Revisa conexión.`, {
            id:       `sync-pull-${nombre}`,
            duration: 8_000,
          });
        }
      }

      console.log(`[sync] pull done — ${totalReads} Firestore reads`);

      if (!pullErrored) {
        localStorage.setItem(LAST_PULL_KEY, pullStartedAt.toString());
        return pullStartedAt;
      } else {
        return lastPull; // keep old cursor so next pull retries from same point
      }
    } finally {
      this.pulling = false;
    }
  }

  // ── Force full re-pull (clears cursor, fetches ALL from Firestore) ────────

  async forcePull(): Promise<number> {
    if (!navigator.onLine) throw new Error('Sin conexión a internet');
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) throw new Error('Sesión no válida');

    const { clinicId, uid } = session;
    const LAST_PULL_KEY = `vetsystem_last_pull_${clinicId}_${uid}`;
    localStorage.removeItem(LAST_PULL_KEY);

    let docsWritten = 0;
    for (const { nombre } of TABLAS_SYNC) {
      try {
        const docs = await syncProvider.pull(nombre, 0, clinicId);
        if (docs.length > 0) {
          console.log(`[sync] forcePull ${nombre} — ${docs.length} doc(s)`);
          await upsertRemoteDocs(nombre, docs, clinicId);
          docsWritten += docs.length;
        }
      } catch (err) {
        console.error(`[sync] forcePull ${nombre} failed:`, err);
      }
    }

    localStorage.setItem(LAST_PULL_KEY, Date.now().toString());
    console.log(`[sync] forcePull complete — ${docsWritten} doc(s) written`);
    return docsWritten;
  }

  // ── Queue diagnostics ─────────────────────────────────────────────────────

  async queueErrors(): Promise<{ collection: string; documentId: string; lastError?: string }[]> {
    const dead = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).toArray();
    return dead.map((item) => ({
      collection:  item.collection,
      documentId:  item.documentId,
      lastError:   (item as { lastError?: string }).lastError,
    }));
  }

  async estadoQueue() {
    const pendientes = await db.syncQueue.where('attempts').below(MAX_INTENTOS).count();
    const conError   = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
    return { pendientes, conError };
  }

  // ── Force-push ALL local data to Firestore (bypass queue) ────────────────

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
        const docClinicId = (doc as { clinicId?: string }).clinicId;
        if (!docClinicId) {
          errores++;
          const msg = 'Registro sin clinicId — omitido';
          if (!mensajesError.includes(msg)) mensajesError.push(msg);
          continue;
        }
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

  async conteoTablas(): Promise<Record<string, number>> {
    const resultado: Record<string, number> = {};
    for (const { nombre, tabla } of TABLAS_SYNC) {
      resultado[nombre] = await tabla().count();
    }
    return resultado;
  }
}

export const syncService = new SyncService();

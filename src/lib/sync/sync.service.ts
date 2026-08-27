'use client';

/**
 * SyncService — drena la syncQueue de Dexie hacia el backend configurado.
 *
 * Flujo normal (por escritura):
 *   Hook escribe en Dexie → encolarSync() → hook 'creating' → flush() → Firebase
 *
 * Flujo manual (syncAll):
 *   Admin pulsa "Sync todo" → lee todas las tablas Dexie → push a Firebase
 *   Útil al agregar campos/colecciones nuevas en dev y querer probar en Firebase.
 */

import { db } from '@/lib/db/database';
import { syncProvider } from './sync.config';
import { toast } from 'sonner';

async function isDemoSession(): Promise<boolean> {
  const s = await db.session.get('singleton');
  return s?.isDemo === true;
}

const MAX_INTENTOS = 5;
const BATCH_SIZE   = 20;

// ── Pull throttling ───────────────────────────────────────────────────────────
// Firestore charges 1 read per query (even 0-result), so pulling 15 collections
// every 30 s would cost 43,200 reads/day per active user — far above the free
// tier (50 K/day shared across ALL users).
//
// Budget math (target: ≤ 10 K reads/day per user):
//   15 collections × N pulls/day = 10 000 → N ≤ 666 pulls/day ≈ 1 pull / 2 min
//   We use 5 min (300 s) as the minimum gap between any two full pulls.
//   That gives 15 × 288 = 4,320 reads/day in the worst case (user active 24 h).
//
// Push (flush) is NOT rate-limited — it only writes, and a write is only triggered
// when the user actually creates/edits something locally.
const MIN_PULL_GAP_MS = 5 * 60 * 1_000;  // 5 minutes between full pulls
const FLUSH_INTERVAL_MS = 60_000;          // retry failed pushes every 60 s (reads: 0)

// All tables that are synced (in order for foreign keys)
const TABLAS_SYNC = [
  { nombre: 'owners',             tabla: () => db.owners             },
  { nombre: 'patients',           tabla: () => db.patients           },
  { nombre: 'products',           tabla: () => db.products           },
  { nombre: 'services',           tabla: () => db.services           },
  { nombre: 'consultations',      tabla: () => db.consultations      },
  { nombre: 'appointments',       tabla: () => db.appointments       },
  { nombre: 'movements',          tabla: () => db.movements          },
  { nombre: 'payments',           tabla: () => db.payments           },
  { nombre: 'invoices',           tabla: () => db.invoices           },
  { nombre: 'sales',              tabla: () => db.sales              },
  { nombre: 'fixedExpenses',        tabla: () => db.fixedExpenses        },
  { nombre: 'expensePayments',        tabla: () => db.expensePayments        },
  { nombre: 'collaborators',      tabla: () => db.collaborators      },
  { nombre: 'collaboratorPayments', tabla: () => db.collaboratorPayments },
  { nombre: 'promotions',           tabla: () => db.promotions           },
] as const;

export type SyncAllProgress = {
  collection: string;
  enviados:  number;
  total:     number;
  errores:   number;
  mensajesError: string[]; // first error message per failed doc
};

class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private corriendo      = false;
  private pulling        = false;
  private hookReg        = false;
  private lastPullAt     = 0; // ms timestamp of the last completed pull attempt

  // ── Arrancar / detener ────────────────────────────────────────────────────

  start(): Promise<void> {
    if (this.timer) return Promise.resolve();

    // Trigger inmediato: cada ítem nuevo en syncQueue dispara flush
    if (!this.hookReg) {
      db.syncQueue.hook('creating', () => {
        setTimeout(() => this.flush(), 0);
      });
      this.hookReg = true;
    }

    // Heartbeat: retry failed pushes every 60 s. Pull runs inside but is
    // throttled by MIN_PULL_GAP_MS — it will only fire every 5 min at most.
    // Separating flush and pull intervals lets push stay reactive while pull
    // stays frugal with Firestore reads.
    this.timer = setInterval(() => {
      this.flush();
      this.pullIfDue();
    }, FLUSH_INTERVAL_MS);

    // Push + pull on network reconnect. Pull is still throttled.
    window.addEventListener('online', this.onOnline);

    // Pull when tab regains focus, but only if enough time has passed.
    // Prevents read spikes when users switch tabs rapidly.
    window.addEventListener('visibilitychange', this.onVisible);

    // Reset any permanently-failed queue items (attempts >= MAX_INTENTOS) so they
    // are retried with the current session's clinicId. Previous builds used a
    // build-time CLINIC_ID constant that didn't match the actual clinic, causing
    // all pushes to fail with permission-denied and exhaust their retry limit.
    this.resetDeadQueueItems().then(() => this.flush());
    // Run the first pull immediately on start; subsequent ones are throttled.
    return this.pullAll();  // sets this.lastPullAt, blocking duplicates for 5 min
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('visibilitychange', this.onVisible);
  }

  private onOnline = () => {
    this.flush();
    this.pullIfDue();
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible') {
      // Only flush (no reads). Pull will fire on the next heartbeat if due.
      // This prevents a read spike when users switch tabs or wake their laptop.
      this.flush();
    }
  };

  // Calls pullAll() only when the minimum gap since the last pull has elapsed.
  // This is the single choke-point for all Firestore read traffic.
  private pullIfDue(): void {
    if (Date.now() - this.lastPullAt >= MIN_PULL_GAP_MS) {
      this.pullAll();
    }
  }

  // ── Flush de la queue ─────────────────────────────────────────────────────

  private async resetDeadQueueItems(): Promise<void> {
    const session = await db.session.get('singleton');
    if (!session || session.isDemo) return;
    const dead = await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).count();
    if (dead > 0) {
      console.log(`[sync] resetting ${dead} dead queue items for retry`);
      await db.syncQueue.where('attempts').aboveOrEqual(MAX_INTENTOS).modify({ attempts: 0 });
    }
  }

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

      if (pendientes.length > 0) console.log(`[sync] flush — pushing ${pendientes.length} items`);

      for (const item of pendientes) {
        // Use the clinicId embedded in the queued document data (always set by hooks
        // from the live session), falling back to the current session clinicId.
        const itemClinicId =
          ((item.data as Record<string, unknown>).clinicId as string | undefined) ??
          session.clinicId;
        try {
          await syncProvider.push(item.collection, item.documentId, item.data, itemClinicId);
          await db.syncQueue.delete(item.id!);
        } catch (err) {
          console.warn(`[sync] fallo ${item.collection}/${item.documentId}:`, err);
          await db.syncQueue.update(item.id!, { attempts: item.attempts + 1 });
        }
      }
    } finally {
      this.corriendo = false;
    }
  }

  // ── Pull: Firebase → Dexie ────────────────────────────────────────────────

  /**
   * Descarga de Firebase todos los docs modificados desde el último pull
   * y los upserta en Dexie (last-write-wins por updatedAt).
   * Se llama automáticamente al arrancar y al reconectar.
   */
  async pullAll(): Promise<void> {
    if (this.pulling || !navigator.onLine) return;
    const session = await db.session.get('singleton');
    // Skip if no session yet (app not fully initialized) or demo mode
    if (!session || session.isDemo) return;
    this.pulling = true;

    const clinicId = session.clinicId;
    const uid      = session.uid;
    const LAST_PULL_KEY   = `vetsystem_last_pull_${clinicId}_${uid}`;
    // Track which (clinicId, uid) pair performed the last pull so we can detect
    // when a different user logs in on the same browser and force a full re-sync.
    const ACTIVE_USER_KEY = 'vetsystem_sync_active_user';
    const activeUser      = localStorage.getItem(ACTIVE_USER_KEY);
    const currentUser     = `${clinicId}__${uid}`;
    if (activeUser !== currentUser) {
      // New user (or first-ever login): clear any stale cursor left by the previous
      // session so we pull all documents from the beginning, not just deltas.
      localStorage.removeItem(LAST_PULL_KEY);
      localStorage.setItem(ACTIVE_USER_KEY, currentUser);
    }
    const lastPull = parseInt(localStorage.getItem(LAST_PULL_KEY) ?? '0', 10);
    // Snapshot the current time before starting the pull. We save this as the new
    // cursor only on full success, so any documents written to Firestore during the
    // pull (between now and when we finish) will be captured on the next pull.
    const pullStartedAt = Date.now();
    let pullErrored = false;

    // Stamp lastPullAt immediately so concurrent triggers are blocked for the
    // full MIN_PULL_GAP_MS even while this pull is still running.
    this.lastPullAt = Date.now();

    let totalReads = 0;

    try {
      for (const { nombre, tabla } of TABLAS_SYNC) {
        try {
          const remoteDocs = await syncProvider.pull(nombre, lastPull, clinicId);
          // Every pull() call costs 1 Firestore read (the query itself) plus
          // 1 read per document returned.
          totalReads += 1 + remoteDocs.length;

          if (remoteDocs.length === 0) continue;
          console.log(`[sync] pulled ${remoteDocs.length} docs from ${nombre}`);

          const t = tabla() as unknown as { get(id: string): Promise<{ updatedAt: number } | undefined>; put(item: object): Promise<unknown> };

          for (const remoteDoc of remoteDocs) {
            const { _syncedAt, ...clean } = remoteDoc as Record<string, unknown>;
            void _syncedAt;
            const local = await t.get(clean.id as string);
            // Remote wins when newer or doc doesn't exist locally yet
            if (!local || (clean.updatedAt as number) > local.updatedAt) {
              await t.put({ ...clean, syncStatus: 'synced' });
            }
          }
        } catch (err) {
          pullErrored = true;
          console.error(`[sync] pull ${nombre} falló:`, err);
        }
      }

      console.log(`[sync] pull done — ~${totalReads} Firestore reads, gap enforced ${MIN_PULL_GAP_MS / 1000}s`);

      // Only advance the cursor when all collections pulled successfully.
      if (!pullErrored) {
        localStorage.setItem(LAST_PULL_KEY, pullStartedAt.toString());
      } else if (lastPull === 0) {
        toast.error('Error al sincronizar datos de la clínica. Revisa la consola del navegador para más detalles.', {
          duration: 8000,
          id: 'sync-pull-error',
        });
      }
    } finally {
      this.pulling = false;
    }
  }

  // ── Sync completo (dev workflow) ──────────────────────────────────────────

  /**
   * Lee TODAS las tablas de Dexie y las empuja a Firebase.
   * Usar cuando agregas campos/colecciones nuevas y quieres poblar Firebase
   * desde cero sin esperar la queue.
   *
   * @param onProgress callback opcional para mostrar progreso en UI
   */
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
        const docClinicId = (doc as { id: string; clinicId?: string }).clinicId ?? '';
        try {
          await syncProvider.push(nombre, (doc as { id: string }).id, doc, docClinicId);
          enviados++;
        } catch (err) {
          errores++;
          const msg = err instanceof Error ? err.message : String(err);
          // Keep unique error messages (avoid repeating the same rule error 70x)
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

  // ── Estado para mostrar en UI ─────────────────────────────────────────────

  async estadoQueue() {
    const pendientes = await db.syncQueue
      .where('attempts').below(MAX_INTENTOS).count();
    const conError = await db.syncQueue
      .where('attempts').aboveOrEqual(MAX_INTENTOS).count();
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


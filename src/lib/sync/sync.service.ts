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
const INTERVALO_MS = 30_000;
const BATCH_SIZE   = 20;

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
  private corriendo   = false;
  private pulling     = false;
  private hookReg     = false;

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

    // Heartbeat: push de items fallidos + pull de cambios remotos cada 30 s.
    // Esto permite que User B vea los cambios de User A en ≤30 segundos
    // sin necesidad de refrescar el browser.
    this.timer = setInterval(() => { this.flush(); this.pullAll(); }, INTERVALO_MS);

    // Push + pull al reconectar a internet
    window.addEventListener('online', this.onOnline);

    // Pull al recuperar el foco de la ventana (usuario vuelve a la computadora,
    // desbloquea pantalla, o regresa desde otro módulo tras un período largo).
    window.addEventListener('visibilitychange', this.onVisible);

    // Flush inicial + pull al arrancar — devuelve la Promise del pull
    // para que el caller pueda mostrar un spinner de "primera sincronización"
    this.flush();
    return this.pullAll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('visibilitychange', this.onVisible);
  }

  private onOnline = () => {
    this.flush();
    this.pullAll();
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible') {
      this.flush();
      this.pullAll();
    }
  };

  // ── Flush de la queue ─────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.corriendo || !navigator.onLine) return;
    if (await isDemoSession()) return;
    this.corriendo = true;

    try {
      const pendientes = await db.syncQueue
        .where('attempts').below(MAX_INTENTOS)
        .limit(BATCH_SIZE)
        .sortBy('createdAt');

      for (const item of pendientes) {
        try {
          await syncProvider.push(item.collection, item.documentId, item.data);
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
    const LAST_PULL_KEY = `vetsystem_last_pull_${clinicId}_${uid}`;
    const lastPull = parseInt(localStorage.getItem(LAST_PULL_KEY) ?? '0', 10);
    let pullErrored = false;

    try {
      for (const { nombre, tabla } of TABLAS_SYNC) {
        try {
          const remoteDocs = await syncProvider.pull(nombre, lastPull);
          if (remoteDocs.length === 0) continue;

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
          // Use console.error so this is visible in browser DevTools
          console.error(`[sync] pull ${nombre} falló:`, err);
        }
      }

      // Only advance the cursor when all collections pulled successfully.
      // If any failed, we keep lastPull unchanged so the next pull retries
      // from the same point — preventing a permanently empty app.
      if (!pullErrored) {
        localStorage.setItem(LAST_PULL_KEY, Date.now().toString());
      } else if (lastPull === 0) {
        // First-ever pull for this user on this browser failed — show a visible
        // error so the problem is clear (not just a silent empty app).
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
        try {
          await syncProvider.push(nombre, (doc as { id: string }).id, doc);
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


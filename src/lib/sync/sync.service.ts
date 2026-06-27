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

async function isDemoSession(): Promise<boolean> {
  const s = await db.session.get('singleton');
  return s?.isDemo === true;
}

const MAX_INTENTOS = 5;
const INTERVALO_MS = 30_000;
const BATCH_SIZE   = 20;

// All tables that are synced (in order for foreign keys)
const TABLAS_SYNC = [
  { nombre: 'owners',        tabla: () => db.owners        },
  { nombre: 'patients',      tabla: () => db.patients      },
  { nombre: 'products',      tabla: () => db.products      },
  { nombre: 'services',      tabla: () => db.services      },
  { nombre: 'consultations', tabla: () => db.consultations },
  { nombre: 'appointments',  tabla: () => db.appointments  },
  { nombre: 'movements',     tabla: () => db.movements     },
  { nombre: 'payments',      tabla: () => db.payments      },
  { nombre: 'invoices',      tabla: () => db.invoices      },
  { nombre: 'sales',         tabla: () => db.sales         },
] as const;

export type SyncAllProgress = {
  coleccion: string;
  enviados:  number;
  total:     number;
  errores:   number;
  mensajesError: string[]; // first error message per failed doc
};

class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private corriendo   = false;
  private hookReg     = false;

  // ── Arrancar / detener ────────────────────────────────────────────────────

  iniciar() {
    if (this.timer) return;

    // Trigger inmediato: cada ítem nuevo en syncQueue dispara flush
    if (!this.hookReg) {
      db.syncQueue.hook('creating', () => {
        setTimeout(() => this.flush(), 0);
      });
      this.hookReg = true;
    }

    // Fallback: reintentar items fallidos cada 30 s
    this.timer = setInterval(() => this.flush(), INTERVALO_MS);

    // Flush al reconectar
    window.addEventListener('online', this.onOnline);

    // Flush inicial (items que quedaron de sesión anterior)
    this.flush();
  }

  detener() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('online', this.onOnline);
  }

  private onOnline = () => this.flush();

  // ── Flush de la queue ─────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.corriendo || !navigator.onLine) return;
    if (await isDemoSession()) return;
    this.corriendo = true;

    try {
      const pendientes = await db.syncQueue
        .where('intentos').below(MAX_INTENTOS)
        .limit(BATCH_SIZE)
        .sortBy('creadoEn');

      for (const item of pendientes) {
        try {
          await syncProvider.push(item.coleccion, item.documentoId, item.datos);
          await db.syncQueue.delete(item.id!);
        } catch (err) {
          console.warn(`[sync] fallo ${item.coleccion}/${item.documentoId}:`, err);
          await db.syncQueue.update(item.id!, { intentos: item.intentos + 1 });
        }
      }
    } finally {
      this.corriendo = false;
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
      const progreso: SyncAllProgress = { coleccion: nombre, enviados, total: docs.length, errores, mensajesError };
      detalles.push(progreso);
      onProgress?.(progreso);
    }

    return { total: totalGlobal, errores: erroresGlobal, detalles };
  }

  // ── Estado para mostrar en UI ─────────────────────────────────────────────

  async estadoQueue() {
    const pendientes = await db.syncQueue
      .where('intentos').below(MAX_INTENTOS).count();
    const conError = await db.syncQueue
      .where('intentos').aboveOrEqual(MAX_INTENTOS).count();
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

// ─────────────────────────────────────────────────────────────────────────────
// BASE DE DATOS LOCAL — Dexie (IndexedDB)
//
// Arquitectura Offline-First:
//   - Dexie es la FUENTE DE VERDAD en tiempo real
//   - Firestore es el respaldo y sincronización entre dispositivos
//   - Toda escritura va primero a Dexie y luego a la syncQueue
//
// Para agregar nuevas tablas en el futuro:
//   1. Definir la interface del tipo local (en src/types/)
//   2. Agregar la propiedad a la clase VetSystemDB
//   3. Incrementar la versión y agregar el store con sus índices
// ─────────────────────────────────────────────────────────────────────────────

import Dexie, { type EntityTable } from 'dexie';
import type { PatientLocal, OwnerLocal } from '@/types/patient';
import type { ConsultationLocal } from '@/types/consultation';
import type { AppointmentLocal } from '@/types/appointment';
import type { ProductLocal, StockMovementLocal } from '@/types/inventory';
import type { PaymentLocal } from '@/types/finances';
import type { InvoiceLocal } from '@/types/invoice';
import type { ServiceLocal } from '@/types/service';
import type { SaleLocal }    from '@/types/sale';
import type { SessionLocal }  from '@/types/license';
import type { FixedExpense, ExpensePayment } from '@/types/expense';
import type { Collaborator, CollaboratorPayment } from '@/types/collaborator';
import type { PromotionLocal } from '@/types/promotion';
import type { QuoteLocal }     from '@/types/quote';
import type { AuditEntryLocal } from '@/types/audit';
import { MAIN_BRANCH_ID, type BranchLocal } from '@/types/branch';
import { sessionLimits } from '@/lib/billing/plans';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un ítem en la cola de sincronización.
 * Cada mutación (create/update/delete) genera un ítem aquí.
 * El SyncEngine los procesa cuando hay conexión.
 */
export interface SyncQueueItem {
  id?: number;
  /** Firestore collection name */
  collection: string;
  documentId: string;
  operation: 'create' | 'update' | 'delete';
  /** Full payload. For delete, only { id, deletedAt } needed. */
  data: object;
  /** Failed attempt count. If it reaches MAX_INTENTOS, item is "stuck". */
  attempts: number;
  createdAt: number;
  /** Error message from the last failed push attempt (for diagnostics). */
  lastError?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFINICIÓN DE LA BASE DE DATOS
// ─────────────────────────────────────────────────────────────────────────────

class VetSystemDB extends Dexie {
  // Patients module
  patients!:      EntityTable<PatientLocal,        'id'>;
  owners!:        EntityTable<OwnerLocal,            'id'>;

  // Clinical history module
  consultations!: EntityTable<ConsultationLocal,         'id'>;

  // Agenda module
  appointments!:  EntityTable<AppointmentLocal,             'id'>;

  // Inventory module
  products!:      EntityTable<ProductLocal,         'id'>;
  movements!:     EntityTable<StockMovementLocal,  'id'>;

  // Finance module
  payments!:      EntityTable<PaymentLocal,             'id'>;
  invoices!:      EntityTable<InvoiceLocal,          'id'>;

  // Services catalog
  services!:      EntityTable<ServiceLocal,         'id'>;

  // Product sales (POS)
  sales!:         EntityTable<SaleLocal,            'id'>;

  // Session & license (singleton — always id = 'singleton')
  session!:       EntityTable<SessionLocal,          'id'>;

  // Fixed expenses module
  fixedExpenses!:   EntityTable<FixedExpense,          'id'>;
  expensePayments!: EntityTable<ExpensePayment,        'id'>;

  // Collaborators / payroll module
  collaborators!:        EntityTable<Collaborator,        'id'>;
  collaboratorPayments!: EntityTable<CollaboratorPayment, 'id'>;

  // Promotions / bundles module
  promotions!: EntityTable<PromotionLocal, 'id'>;

  // Quotes — priced documents that only become sales when accepted
  quotes!: EntityTable<QuoteLocal, 'id'>;
  branches!: EntityTable<BranchLocal, 'id'>;
  /** Bitácora: sensitive actions, append-only */
  auditLog!: EntityTable<AuditEntryLocal, 'id'>;
  /** Device-local preferences (e.g. the active branch); never synced. */
  prefs!: EntityTable<{ key: string; value: string }, 'key'>;

  // Sync infrastructure
  syncQueue!:     EntityTable<SyncQueueItem,         'id'>;

  constructor() {
    super('vetsystem-db');

    /**
     * VERSIÓN 1 — Schema inicial
     */
    this.version(1).stores({
      patients: [
        'id',
        'nombre',
        'especie',
        'duenoId',
        'clinicaId',
        'activo',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),

      duenos: [
        'id',
        'nombre',
        'telefono',
        'clinicaId',
        'syncStatus',
        'updatedAt',
      ].join(', '),

      syncQueue: [
        '++id',
        'coleccion',
        'documentoId',
        'creadoEn',
      ].join(', '),
    });

    this.version(2).stores({
      consultations: [
        'id',
        'pacienteId',
        'clinicaId',
        'fecha',
        'tipo',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(3).stores({
      appointments: [
        'id',
        'pacienteId',
        'duenoId',
        'clinicaId',
        'fecha',
        'estado',
        'tipo',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(4).stores({
      products: [
        'id',
        'nombre',
        'categoria',
        'clinicaId',
        'activo',
        'stockActual',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),

      movements: [
        'id',
        'productoId',
        'clinicaId',
        'tipo',
        'creadoEn',
        'syncStatus',
        'updatedAt',
      ].join(', '),
    });

    this.version(5).stores({
      payments: [
        'id',
        'pacienteId',
        'clinicaId',
        'fecha',
        'tipo',
        'estado',
        'metodoPago',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(6).stores({
      consultations: [
        'id',
        'pacienteId',
        'duenoId',
        'clinicaId',
        'fecha',
        'tipo',
        'estado',
        'citaId',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(7).stores({
      invoices: [
        'id',
        'numero',
        'consultaId',
        'pacienteId',
        'duenoId',
        'clinicaId',
        'fecha',
        'estado',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(8).stores({
      services: [
        'id',
        'clinicaId',
        'categoria',
        'activo',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(9).stores({
      ventas: [
        'id',
        'clinicaId',
        'fecha',
        'estado',
        'pacienteId',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(10).stores({
      sesion: 'id, uid, clinicaId',
    });

    this.version(11).stores({
      patients:      'id, name, species, ownerId, clinicId, active, syncStatus, updatedAt, deletedAt',
      owners:        'id, name, phone, clinicId, syncStatus, updatedAt',
      consultations: 'id, patientId, ownerId, clinicId, date, type, status, appointmentId, syncStatus, updatedAt, deletedAt',
      appointments:  'id, patientId, ownerId, clinicId, date, status, type, syncStatus, updatedAt, deletedAt',
      products:      'id, name, category, clinicId, active, currentStock, syncStatus, updatedAt, deletedAt',
      movements:     'id, productId, clinicId, type, createdAt, syncStatus, updatedAt',
      payments:      'id, patientId, clinicId, date, type, status, paymentMethod, syncStatus, updatedAt, deletedAt',
      invoices:      'id, number, consultationId, patientId, ownerId, clinicId, date, status, syncStatus, updatedAt, deletedAt',
      services:      'id, clinicId, category, active, syncStatus, updatedAt, deletedAt',
      sales:         'id, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
      session:       'id, uid, clinicId',
      // Drop old Spanish stores
      pacientes:     null,
      duenos:        null,
      consultas:     null,
      citas:         null,
      productos:     null,
      movimientos:   null,
      pagos:         null,
      facturas:      null,
      servicios:     null,
      ventas:        null,
      sesion:        null,
    }).upgrade(() => {
      // No data migration needed — dev environment, data will be re-seeded
    });

    this.version(12).stores({
      syncQueue: '++id, coleccion, documentoId, creadoEn, intentos',
    });

    // v11 used wrong (English) field names as indexes — Dexie indexes must match
    // the actual property names on the stored objects (still Spanish in TypeScript types).
    this.version(13).stores({
      patients:      'id, nombre, especie, duenoId, clinicaId, activo, syncStatus, updatedAt, deletedAt',
      owners:        'id, nombre, telefono, clinicaId, syncStatus, updatedAt',
      consultations: 'id, pacienteId, duenoId, clinicaId, fecha, tipo, estado, citaId, syncStatus, updatedAt, deletedAt',
      appointments:  'id, pacienteId, duenoId, clinicaId, fecha, estado, tipo, syncStatus, updatedAt, deletedAt',
      products:      'id, nombre, categoria, clinicaId, activo, stockActual, syncStatus, updatedAt, deletedAt',
      movements:     'id, productoId, clinicaId, tipo, creadoEn, syncStatus, updatedAt',
      payments:      'id, pacienteId, clinicaId, fecha, tipo, estado, metodoPago, syncStatus, updatedAt, deletedAt',
      invoices:      'id, numero, consultaId, pacienteId, duenoId, clinicaId, fecha, estado, syncStatus, updatedAt, deletedAt',
      services:      'id, clinicaId, categoria, activo, syncStatus, updatedAt, deletedAt',
      sales:         'id, clinicaId, fecha, estado, pacienteId, syncStatus, updatedAt, deletedAt',
    });

    this.version(14).stores({
      gastosFijos: 'id, clinicaId, nextDueDate, activo, syncStatus, updatedAt, deletedAt',
      pagosGastos: 'id, clinicaId, gastoFijoId, fechaPago, syncStatus, updatedAt',
    });

    this.version(15).stores({
      colaboradores:      'id, clinicaId, nextPaymentDate, activo, syncStatus, updatedAt, deletedAt',
      pagosColaboradores: 'id, clinicaId, colaboradorId, fechaPago, syncStatus, updatedAt',
    });

    // v16: rename Spanish table names to English
    this.version(16).stores({
      gastosFijos:        null,
      pagosGastos:        null,
      colaboradores:      null,
      pagosColaboradores: null,
      fixedExpenses:   'id, clinicaId, nextDueDate, activo, syncStatus, updatedAt, deletedAt',
      expensePayments: 'id, clinicaId, gastoFijoId, fechaPago, syncStatus, updatedAt',
      collaborators:        'id, clinicaId, nextPaymentDate, activo, syncStatus, updatedAt, deletedAt',
      collaboratorPayments: 'id, clinicaId, colaboradorId, fechaPago, syncStatus, updatedAt',
    });

    // v17: rename all Spanish field index names to English to match updated TypeScript types
    this.version(17).stores({
      patients:      'id, name, species, ownerId, clinicId, active, syncStatus, updatedAt, deletedAt',
      owners:        'id, name, phone, clinicId, syncStatus, updatedAt',
      consultations: 'id, patientId, ownerId, clinicId, date, type, status, appointmentId, syncStatus, updatedAt, deletedAt',
      appointments:  'id, patientId, ownerId, clinicId, date, status, type, syncStatus, updatedAt, deletedAt',
      products:      'id, name, category, clinicId, active, currentStock, syncStatus, updatedAt, deletedAt',
      movements:     'id, productId, clinicId, type, createdAt, syncStatus, updatedAt',
      payments:      'id, patientId, clinicId, date, type, status, paymentMethod, syncStatus, updatedAt, deletedAt',
      invoices:      'id, number, consultationId, patientId, ownerId, clinicId, date, status, syncStatus, updatedAt, deletedAt',
      services:      'id, clinicId, category, active, syncStatus, updatedAt, deletedAt',
      sales:         'id, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
      fixedExpenses:        'id, clinicId, nextDueDate, active, syncStatus, updatedAt, deletedAt',
      expensePayments:      'id, clinicId, fixedExpenseId, paymentDate, syncStatus, updatedAt',
      collaborators:        'id, clinicId, nextPaymentDate, active, syncStatus, updatedAt, deletedAt',
      collaboratorPayments: 'id, clinicId, collaboratorId, paymentDate, syncStatus, updatedAt',
    }).upgrade(() => {});

    // v18: rename syncQueue index fields to English
    this.version(18).stores({
      syncQueue: '++id, collection, documentId, createdAt, attempts',
    }).upgrade(() => {});

    this.version(19).stores({
      promotions: 'id, clinicId, active, validFrom, validUntil, syncStatus, updatedAt, deletedAt',
    });

    // v20: full consolidated schema — ensures any browser upgrading from any prior
    // version gets a clean, consistent set of stores with correct English field names.
    this.version(22).stores({
      patients:             'id, name, species, ownerId, clinicId, active, syncStatus, updatedAt, deletedAt',
      owners:               'id, name, phone, clinicId, syncStatus, updatedAt',
      consultations:        'id, patientId, ownerId, clinicId, date, type, status, appointmentId, syncStatus, updatedAt, deletedAt',
      appointments:         'id, patientId, ownerId, clinicId, date, status, type, syncStatus, updatedAt, deletedAt',
      products:             'id, name, category, clinicId, active, currentStock, syncStatus, updatedAt, deletedAt',
      movements:            'id, productId, clinicId, type, createdAt, syncStatus, updatedAt',
      payments:             'id, patientId, clinicId, date, type, status, paymentMethod, syncStatus, updatedAt, deletedAt',
      invoices:             'id, number, consultationId, patientId, ownerId, clinicId, date, status, syncStatus, updatedAt, deletedAt',
      services:             'id, clinicId, category, active, syncStatus, updatedAt, deletedAt',
      sales:                'id, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
      session:              'id, uid, clinicId',
      fixedExpenses:        'id, clinicId, nextDueDate, active, syncStatus, updatedAt, deletedAt',
      expensePayments:      'id, clinicId, fixedExpenseId, paymentDate, syncStatus, updatedAt',
      collaborators:        'id, clinicId, nextPaymentDate, active, syncStatus, updatedAt, deletedAt',
      collaboratorPayments: 'id, clinicId, collaboratorId, paymentDate, syncStatus, updatedAt',
      promotions:           'id, clinicId, active, validFrom, validUntil, syncStatus, updatedAt, deletedAt',
      syncQueue:            '++id, collection, documentId, createdAt, attempts',
    }).upgrade(() => {});

    // v24: quotes module
    this.version(24).stores({
      quotes: 'id, number, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
    });

    // v26: full consolidated schema again (so bump-db-version.mjs keeps hashing
    // the real schema), plus a data repair.
    //
    // Sales used to push their generated payment as a subset of fields, without
    // clinicId. Any device that pulled those payments stored rows that no
    // clinicId-filtered query can see, so the finance cards read zero while the
    // data sat right there in IndexedDB. The incremental pull will never send
    // those documents again, so the rows are fixed in place here. Every row in
    // this database belongs to the session's clinic by definition.
    this.version(26).stores({
      patients:             'id, name, species, ownerId, clinicId, active, syncStatus, updatedAt, deletedAt',
      owners:               'id, name, phone, clinicId, syncStatus, updatedAt',
      consultations:        'id, patientId, ownerId, clinicId, date, type, status, appointmentId, syncStatus, updatedAt, deletedAt',
      appointments:         'id, patientId, ownerId, clinicId, date, status, type, syncStatus, updatedAt, deletedAt',
      products:             'id, name, category, clinicId, active, currentStock, syncStatus, updatedAt, deletedAt',
      movements:            'id, productId, clinicId, type, createdAt, syncStatus, updatedAt',
      payments:             'id, patientId, clinicId, date, type, status, paymentMethod, syncStatus, updatedAt, deletedAt',
      invoices:             'id, number, consultationId, patientId, ownerId, clinicId, date, status, syncStatus, updatedAt, deletedAt',
      services:             'id, clinicId, category, active, syncStatus, updatedAt, deletedAt',
      sales:                'id, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
      session:              'id, uid, clinicId',
      fixedExpenses:        'id, clinicId, nextDueDate, active, syncStatus, updatedAt, deletedAt',
      expensePayments:      'id, clinicId, fixedExpenseId, paymentDate, syncStatus, updatedAt',
      collaborators:        'id, clinicId, nextPaymentDate, active, syncStatus, updatedAt, deletedAt',
      collaboratorPayments: 'id, clinicId, collaboratorId, paymentDate, syncStatus, updatedAt',
      promotions:           'id, clinicId, active, validFrom, validUntil, syncStatus, updatedAt, deletedAt',
      quotes:               'id, number, clinicId, date, status, patientId, syncStatus, updatedAt, deletedAt',
      syncQueue:            '++id, collection, documentId, createdAt, attempts',
    }).upgrade(async (tx) => {
      const session  = await tx.table('session').get('singleton');
      const clinicId = session?.clinicId;
      if (!clinicId) return;

      const tables = [
        'payments', 'invoices', 'sales', 'patients', 'owners', 'consultations',
        'appointments', 'products', 'movements', 'services', 'fixedExpenses',
        'expensePayments', 'collaborators', 'collaboratorPayments', 'promotions',
        'quotes',
      ];
      let repaired = 0;
      for (const name of tables) {
        await tx.table(name).toCollection().modify((row: { clinicId?: string }) => {
          if (!row.clinicId) { row.clinicId = clinicId; repaired++; }
        });
      }
      if (repaired > 0) console.log(`[DB] v26: stamped clinicId on ${repaired} orphaned row(s)`);
    });

    // v27 — branches (points of sale). Existing rows keep no branchId and are
    // read as the main branch, so no data migration is needed.
    this.version(27).stores({
      branches: 'id, clinicId, active, syncStatus, updatedAt, deletedAt',
      prefs:    'key',
    });

    // v29 — Bitácora (audit log of sensitive actions), per branch
    this.version(29).stores({
      auditLog: 'id, clinicId, branchId, action, createdAt, syncStatus',
    });

    // Every new row of a branch-scoped table belongs to the branch the user is
    // working in, without each form having to pass it. Rows downloaded by sync
    // arrive with their branchId already set (see upsertRemoteDocs).
    for (const name of BRANCH_SCOPED_TABLES) {
      this.table(name).hook('creating', (_key, row: { branchId?: string }) => {
        if (row.branchId == null) row.branchId = activeBranchCache;
      });
    }
  }
}

// ─── Branches ────────────────────────────────────────────────────────────────

/** Tables whose rows belong to one branch. Everything else is shared by the clinic. */
export const BRANCH_SCOPED_TABLES = [
  'products', 'movements', 'sales', 'payments', 'invoices', 'appointments', 'quotes',
  'consultations', 'fixedExpenses', 'expensePayments', 'collaborators', 'collaboratorPayments', 'auditLog',
] as const;

/** Last known active branch, for the synchronous `creating` hook. */
let activeBranchCache: string = MAIN_BRANCH_ID;

/** A row's branch; rows from before branches existed belong to the main one. */
export function branchOf(row: object): string {
  return (row as { branchId?: string | null }).branchId || MAIN_BRANCH_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCIA SINGLETON
// Se importa como: import { db } from '@/lib/db/database'
// ─────────────────────────────────────────────────────────────────────────────

export const db = new VetSystemDB();

// If another tab has already upgraded the schema, close this stale connection
// and reload so the current tab picks up the new version.
if (typeof window !== 'undefined') {
  db.on('versionchange', () => {
    db.close();
    window.location.reload();
  });
}

/**
 * Opens the database and automatically recovers from schema corruption.
 * If the open fails (e.g. a prior upgrade left the DB in a broken state),
 * the entire database is deleted and recreated from scratch.
 * Data loss is acceptable because Firebase is the source of truth and will
 * re-sync on the next online connection.
 *
 * Call this once at app startup (e.g. in AuthContext) before any DB access.
 */
/**
 * Opens the database and automatically recovers from schema corruption.
 * If the open fails (e.g. a prior upgrade left the DB in a broken state),
 * the entire database is deleted and recreated from scratch.
 * Data loss is acceptable because Firebase is the source of truth and will
 * re-sync on the next online connection.
 *
 * Call this once at app startup (e.g. in AuthContext) before any DB access.
 */
export async function ensureDbReady(): Promise<void> {
  if (db.isOpen()) return;
  try {
    await db.open();
  } catch (err) {
    console.warn('[DB] Failed to open — resetting database:', err);
    try {
      await Dexie.delete('vetsystem-db');
    } catch (deleteErr) {
      console.error('[DB] Could not delete corrupt database:', deleteErr);
    }
    await db.open();
  }
}

/** Returns the current session's clinicId from Dexie, falling back to env var. */
export async function getClinicId(): Promise<string> {
  const s = await db.session.get('singleton');
  return s?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';
}

/** @deprecated Use getClinicId() */
export const getClinicaId = getClinicId;

// ─── Active branch ───────────────────────────────────────────────────────────

const activeBranchKey = (clinicId: string, uid: string) => `activeBranch:${clinicId}:${uid}`;

/**
 * Branches this session may work in: clinic managers (master/admin) every active
 * branch of the clinic, branch managers and staff the ones assigned to them (main when none).
 * Reads Dexie, so a useLiveQuery calling it re-runs when branches change.
 */
export async function getAllowedBranchIds(): Promise<string[]> {
  const s = await db.session.get('singleton');
  if (!s) return [MAIN_BRANCH_ID];
  if (s.role === 'master' || s.role === 'admin' || s.isDemo) {
    const rows = await db.branches.where('clinicId').equals(s.clinicId).filter((b) => !b.deletedAt && b.active).toArray();
    const others = rows.filter((b) => b.id !== MAIN_BRANCH_ID).sort((a, b) => a.createdAt - b.createdAt).map((b) => b.id);
    // A plan with fewer branches (a downgrade, or a plan previewed in the demo) keeps the oldest ones.
    const { maxBranches } = sessionLimits(s);
    return [MAIN_BRANCH_ID, ...others].slice(0, maxBranches ?? undefined);
  }
  return s.branchIds?.length ? s.branchIds : [MAIN_BRANCH_ID];
}

/**
 * The branch the user is working in on this device. Reads Dexie (session,
 * prefs, branches), so every useLiveQuery that calls it — directly or through
 * getBranchFilter — re-runs when the user switches branch.
 */
export async function getActiveBranchId(): Promise<string> {
  const s = await db.session.get('singleton');
  const allowed = await getAllowedBranchIds();
  const stored = s ? (await db.prefs.get(activeBranchKey(s.clinicId, s.uid)))?.value : undefined;
  const branchId = stored && allowed.includes(stored) ? stored : allowed[0];
  activeBranchCache = branchId;
  return branchId;
}

export async function setActiveBranchId(branchId: string): Promise<void> {
  const s = await db.session.get('singleton');
  if (!s) return;
  activeBranchCache = branchId;
  await db.prefs.put({ key: activeBranchKey(s.clinicId, s.uid), value: branchId });
}

/** Predicate for rows of the active branch: `rows.filter(await getBranchFilter())`. */
export async function getBranchFilter(): Promise<(row: object) => boolean> {
  const branchId = await getActiveBranchId();
  // Entity types do not declare branchId (it is stamped by the creating hook), so accept any row.
  return (row) => branchOf(row) === branchId;
}

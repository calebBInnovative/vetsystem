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

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un ítem en la cola de sincronización.
 * Cada mutación (create/update/delete) genera un ítem aquí.
 * El SyncEngine los procesa cuando hay conexión.
 */
export interface SyncQueueItem {
  /** Auto-incremental — no necesita UUID */
  id?: number;
  /** Nombre de la colección en Firestore */
  coleccion: string;
  /** ID del documento que se debe sincronizar */
  documentoId: string;
  /** Tipo de operación a ejecutar en Firestore */
  operacion: 'create' | 'update' | 'delete';
  /** Payload completo a enviar. Para delete, solo necesita { id, deletedAt } */
  datos: object;
  /** Número de intentos fallidos. Si llega a 5, se marca como error. */
  intentos: number;
  creadoEn: number;
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

  // Sync infrastructure
  syncQueue!:     EntityTable<SyncQueueItem,         'id'>;

  constructor() {
    super('vetsystem-db');

    /**
     * VERSIÓN 1 — Schema inicial
     *
     * Formato de índices Dexie:
     *   "primaryKey, campo1, campo2, ..."
     *   Prefijo "&" → único
     *   Prefijo "*" → multiEntry (arrays)
     *   Prefijo "++" → auto-increment
     *
     * Solo se indexan campos que se usan en .where(), .filter() o .sortBy().
     * No indexar todo — aumenta el tamaño y reduce el rendimiento.
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
      // Add 'intentos' index to syncQueue so .where('intentos').below(N) works
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCIA SINGLETON
// Se importa como: import { db } from '@/lib/db/database'
// ─────────────────────────────────────────────────────────────────────────────

export const db = new VetSystemDB();

/** Returns the current session's clinicId from Dexie, falling back to env var. */
export async function getClinicaId(): Promise<string> {
  const s = await db.session.get('singleton');
  return s?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';
}

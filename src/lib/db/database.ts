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
import type { PacienteLocal, DuenoLocal } from '@/types/paciente';
import type { ConsultaLocal } from '@/types/consulta';
import type { CitaLocal } from '@/types/agenda';
import type { ProductoLocal, MovimientoStockLocal } from '@/types/inventario';
import type { PagoLocal } from '@/types/finanzas';
import type { FacturaLocal } from '@/types/factura';
import type { ServicioLocal } from '@/types/servicio';

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
  /** Nombre de la colección en Firestore: "pacientes", "duenos", etc. */
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
  // Módulo Pacientes
  pacientes!: EntityTable<PacienteLocal, 'id'>;
  duenos!:    EntityTable<DuenoLocal,    'id'>;

  // Módulo Historial Clínico
  consultas!: EntityTable<ConsultaLocal, 'id'>;

  // Módulo Agenda
  citas!: EntityTable<CitaLocal, 'id'>;

  // Módulo Inventario
  productos!:   EntityTable<ProductoLocal,        'id'>;
  movimientos!: EntityTable<MovimientoStockLocal, 'id'>;

  // Módulo Finanzas
  pagos!:    EntityTable<PagoLocal,    'id'>;
  facturas!: EntityTable<FacturaLocal, 'id'>;

  // Catálogo de servicios
  servicios!: EntityTable<ServicioLocal, 'id'>;

  // Infraestructura de sync
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

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
      pacientes: [
        'id',           // PK
        'nombre',       // búsqueda por nombre
        'especie',      // filtro por especie
        'duenoId',      // join con duenos
        'clinicaId',    // multi-clínica
        'activo',       // filtrar activos/inactivos
        'syncStatus',   // procesar pendientes
        'updatedAt',    // ordenar por reciente
        'deletedAt',    // soft delete
      ].join(', '),

      duenos: [
        'id',           // PK
        'nombre',       // búsqueda por nombre de dueño
        'telefono',     // deduplicación por teléfono
        'clinicaId',
        'syncStatus',
        'updatedAt',
      ].join(', '),

      syncQueue: [
        '++id',         // auto-increment
        'coleccion',    // para procesar por colección
        'documentoId',  // para actualizar/cancelar items
        'creadoEn',     // para procesar en orden FIFO
      ].join(', '),
    });

    this.version(2).stores({
      consultas: [
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
      citas: [
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
      productos: [
        'id',
        'nombre',         // búsqueda por nombre
        'categoria',      // filtrar por categoría
        'clinicaId',
        'activo',
        'stockActual',    // ordenar/filtrar por stock
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),

      movimientos: [
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
      pagos: [
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
      // Re-indexa consultas con los nuevos campos del módulo Atenciones
      consultas: [
        'id',
        'pacienteId',
        'duenoId',       // nuevo — join con dueños
        'clinicaId',
        'fecha',
        'tipo',
        'estado',        // nuevo — filtrar en_proceso / completada / cancelada
        'citaId',        // nuevo — link desde agenda
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(7).stores({
      facturas: [
        'id',
        'numero',        // FAC-YYYY-NNNN — búsqueda directa
        'consultaId',    // link a la consulta origen
        'pacienteId',
        'duenoId',
        'clinicaId',
        'fecha',
        'estado',        // pagada / pendiente / parcialmente_pagada / cancelada
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });

    this.version(8).stores({
      servicios: [
        'id',
        'clinicaId',
        'categoria',
        'activo',
        'syncStatus',
        'updatedAt',
        'deletedAt',
      ].join(', '),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCIA SINGLETON
// Se importa como: import { db } from '@/lib/db/database'
// ─────────────────────────────────────────────────────────────────────────────

export const db = new VetSystemDB();

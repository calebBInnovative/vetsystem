// ─────────────────────────────────────────────────────────────────────────────
// TIPOS — Módulo Consultas / Atenciones
//
// Una "Consulta" es el evento central que une:
//   Agenda → Historial Clínico → Inventario → Finanzas
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './paciente';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type EstadoConsulta = 'en_proceso' | 'completada' | 'cancelada';

export type TipoConsulta =
  | 'consulta_general'
  | 'vacunacion'
  | 'cirugia'
  | 'emergencia'
  | 'control'
  | 'desparasitacion'
  | 'estetica'
  | 'otro';

// ─── Item de la consulta ──────────────────────────────────────────────────────

/** Un producto o servicio agregado durante la atención */
export interface ConsultaItem {
  /** UUID local — no se persiste en Firestore como campo separado */
  id: string;
  /** Referencia al producto en inventario. Undefined = servicio manual */
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  /** Si es servicio, NO descuenta inventario al finalizar */
  esServicio: boolean;
}

// ─── Consulta principal ───────────────────────────────────────────────────────

export interface Consulta {
  id: string;
  pacienteId: string;
  duenoId: string;
  clinicaId: string;

  /** Cita desde la que se originó (opcional — puede ser walk-in) */
  citaId?: string;

  /** Timestamp Unix de inicio de la atención */
  fecha: number;

  tipo: TipoConsulta;
  estado: EstadoConsulta;

  /** Motivo de la visita tal como lo reporta el dueño */
  motivo: string;

  // ── Signos vitales ────────────────────────────────────────────────────────
  peso?: number;
  temperatura?: number;
  frecuenciaCardiaca?: number;
  frecuenciaRespiratoria?: number;

  // ── Historia clínica ──────────────────────────────────────────────────────
  /** Historia del problema, antecedentes */
  anamnesis?: string;
  /** Hallazgos del examen físico */
  examenFisico?: string;
  diagnostico?: string;
  tratamiento?: string;
  observaciones?: string;

  /** Fecha recomendada de próxima visita "YYYY-MM-DD" */
  proximaVisita?: string;

  veterinario?: string;

  // ── Facturación ───────────────────────────────────────────────────────────
  items: ConsultaItem[];
  subtotal: number;
  /** Descuento en monto fijo (córdobas) */
  descuento: number;
  total: number;

  /** ID del pago generado al finalizar */
  pagoId?: string;
  /** ID de la factura generada al finalizar */
  facturaId?: string;

  creadoEn: number;
}

export interface ConsultaLocal extends Consulta, SyncMeta {}

/** Consulta con datos del paciente ya unidos — para listas */
export interface ConsultaConPaciente extends ConsultaLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
  nombreDueno?: string;
}

// ─── Constantes de UI ─────────────────────────────────────────────────────────

export const TIPOS_CONSULTA: Record<TipoConsulta, { label: string; emoji: string; color: string }> = {
  consulta_general: { label: 'Consulta general', emoji: '🩺', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800' },
  vacunacion:       { label: 'Vacunación',        emoji: '💉', color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800' },
  cirugia:          { label: 'Cirugía',           emoji: '🔬', color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800' },
  emergencia:       { label: 'Emergencia',        emoji: '🚨', color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800' },
  control:          { label: 'Control',           emoji: '📋', color: 'text-teal-600 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-950/40 dark:border-teal-800' },
  desparasitacion:  { label: 'Desparasitación',   emoji: '🐛', color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800' },
  estetica:         { label: 'Estética',          emoji: '✂️', color: 'text-pink-600 bg-pink-50 border-pink-200 dark:text-pink-400 dark:bg-pink-950/40 dark:border-pink-800' },
  otro:             { label: 'Otro',              emoji: '📌', color: 'text-muted-foreground bg-muted border-border' },
};

export const ESTADOS_CONSULTA: Record<EstadoConsulta, { label: string; color: string; punto: string }> = {
  en_proceso: { label: 'En proceso', color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800', punto: 'bg-amber-400' },
  completada: { label: 'Completada', color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800', punto: 'bg-green-500' },
  cancelada:  { label: 'Cancelada',  color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',            punto: 'bg-red-400' },
};

export const TIPO_PAGO_POR_CONSULTA: Record<TipoConsulta, string> = {
  consulta_general: 'consulta',
  vacunacion:       'vacunacion',
  cirugia:          'cirugia',
  emergencia:       'consulta',
  control:          'consulta',
  desparasitacion:  'consulta',
  estetica:         'estetica',
  otro:             'otro',
};

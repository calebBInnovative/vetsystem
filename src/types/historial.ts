// ─────────────────────────────────────────────────────────────────────────────
// TIPOS BASE — Módulo Historial Clínico
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './paciente';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS / UNION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Tipo de visita */
export type TipoConsulta =
  | 'consulta_general'
  | 'vacunacion'
  | 'cirugia'
  | 'emergencia'
  | 'control'
  | 'desparasitacion'
  | 'estetica'
  | 'otro';

// ─────────────────────────────────────────────────────────────────────────────
// MEDICAMENTO RECETADO
// Embebido dentro de ConsultaLocal (no tiene tabla propia).
// ─────────────────────────────────────────────────────────────────────────────

export interface MedicamentoRecetado {
  nombre: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
  notas?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA
// ─────────────────────────────────────────────────────────────────────────────

/** Datos puros de la consulta — espejo del schema de Firestore */
export interface Consulta {
  id: string;
  pacienteId: string;
  clinicaId: string;

  /** Timestamp de la fecha/hora de la consulta */
  fecha: number;

  tipo: TipoConsulta;

  /** Motivo de la visita tal como lo reporta el dueño */
  motivo: string;

  /** Signos/síntomas observados */
  sintomas?: string;

  /** Temperatura corporal en °C */
  temperatura?: number;

  /** Peso al momento de la consulta (puede diferir del peso base del paciente) */
  pesoConsulta?: number;

  /** Diagnóstico del veterinario */
  diagnostico?: string;

  /** Descripción del tratamiento indicado */
  tratamiento?: string;

  /** Medicamentos recetados — array embebido, no tabla separada */
  medicamentos?: MedicamentoRecetado[];

  /** Observaciones adicionales del veterinario */
  observaciones?: string;

  /** Timestamp de la próxima cita recomendada */
  proximaCita?: number;

  /** Nombre del veterinario que atendió */
  veterinario?: string;

  creadoEn: number;
}

/** Consulta tal como se almacena en Dexie (incluye campos de sync) */
export interface ConsultaLocal extends Consulta, SyncMeta {}

/**
 * Consulta con el nombre del paciente ya unido.
 * Útil para listas que muestran consultas de múltiples pacientes.
 */
export interface ConsultaConPaciente extends ConsultaLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE UI
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_CONSULTA: Record<TipoConsulta, { label: string; emoji: string; color: string }> = {
  consulta_general: { label: 'Consulta general', emoji: '🩺', color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40' },
  vacunacion:       { label: 'Vacunación',       emoji: '💉', color: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40' },
  cirugia:          { label: 'Cirugía',          emoji: '🔬', color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40' },
  emergencia:       { label: 'Emergencia',       emoji: '🚨', color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40' },
  control:          { label: 'Control',          emoji: '📋', color: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/40' },
  desparasitacion:  { label: 'Desparasitación',  emoji: '🐛', color: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40' },
  estetica:         { label: 'Estética',         emoji: '✂️', color: 'text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-950/40' },
  otro:             { label: 'Otro',             emoji: '📌', color: 'text-muted-foreground bg-muted' },
};

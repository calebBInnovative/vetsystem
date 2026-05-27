// ─────────────────────────────────────────────────────────────────────────────
// TIPOS BASE — Módulo Agenda / Citas
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './paciente';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoCita =
  | 'pendiente'
  | 'confirmada'
  | 'en_curso'
  | 'completada'
  | 'cancelada'
  | 'no_asistio';

export type TipoCita =
  | 'consulta'
  | 'vacunacion'
  | 'cirugia'
  | 'control'
  | 'desparasitacion'
  | 'estetica'
  | 'emergencia'
  | 'otro';

// ─────────────────────────────────────────────────────────────────────────────
// CITA
// ─────────────────────────────────────────────────────────────────────────────

/** Datos puros de la cita — espejo del schema de Firestore */
export interface Cita {
  id: string;
  pacienteId: string;
  duenoId: string;
  clinicaId: string;

  /** ISO date string "YYYY-MM-DD" — día de la cita */
  fecha: string;

  /** Hora de inicio "HH:mm" */
  horaInicio: string;

  /** Duración en minutos (default 30) */
  duracionMinutos: number;

  tipo: TipoCita;
  estado: EstadoCita;
  motivo: string;

  veterinario?: string;
  notas?: string;

  creadoEn: number;
}

/** Cita tal como se almacena en Dexie */
export interface CitaLocal extends Cita, SyncMeta {}

/**
 * Cita con nombre del paciente y dueño ya unidos.
 * Usado en la vista de agenda sin queries adicionales.
 */
export interface CitaConPaciente extends CitaLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
  nombreDueno?: string;
  telefonoDueno?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE UI
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS_CITA: Record<EstadoCita, { label: string; color: string; punto: string }> = {
  pendiente:   { label: 'Pendiente',    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',     punto: 'bg-amber-400' },
  confirmada:  { label: 'Confirmada',   color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',           punto: 'bg-blue-500' },
  en_curso:    { label: 'En curso',     color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800', punto: 'bg-purple-500 animate-pulse' },
  completada:  { label: 'Completada',   color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',     punto: 'bg-green-500' },
  cancelada:   { label: 'Cancelada',    color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',                 punto: 'bg-red-400' },
  no_asistio:  { label: 'No asistió',   color: 'text-muted-foreground bg-muted border-border',                                                                    punto: 'bg-muted-foreground' },
};

export const TIPOS_CITA: Record<TipoCita, { label: string; emoji: string }> = {
  consulta:       { label: 'Consulta general',  emoji: '🩺' },
  vacunacion:     { label: 'Vacunación',        emoji: '💉' },
  cirugia:        { label: 'Cirugía',           emoji: '🔬' },
  control:        { label: 'Control',           emoji: '📋' },
  desparasitacion:{ label: 'Desparasitación',   emoji: '🐛' },
  estetica:       { label: 'Estética',          emoji: '✂️' },
  emergencia:     { label: 'Emergencia',        emoji: '🚨' },
  otro:           { label: 'Otro',              emoji: '📌' },
};

/** Duraciones disponibles en el formulario */
export const DURACIONES = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1 h 30 min' },
  { value: 120, label: '2 horas' },
];

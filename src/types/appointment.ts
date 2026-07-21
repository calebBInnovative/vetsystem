// ─────────────────────────────────────────────────────────────────────────────
// BASE TYPES — Agenda / Appointments Module
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './patient';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentType =
  | 'consultation'
  | 'vaccination'
  | 'surgery'
  | 'checkup'
  | 'deworming'
  | 'grooming'
  | 'emergency'
  | 'other';

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENT
// ─────────────────────────────────────────────────────────────────────────────

/** Pure appointment data — mirrors the Firestore schema */
export interface Appointment {
  id: string;
  patientId: string;
  ownerId: string;
  clinicId: string;

  /** ISO date string "YYYY-MM-DD" — day of the appointment */
  date: string;

  /** Start time "HH:mm" */
  startTime: string;

  /** Duration in minutes (default 30) */
  durationMinutes: number;

  type: AppointmentType;
  status: AppointmentStatus;
  reason: string;

  veterinarian?: string;
  notes?: string;

  createdAt: number;
}

/** Appointment as stored in Dexie */
export interface AppointmentLocal extends Appointment, SyncMeta {}

/**
 * Appointment with patient name and owner already joined.
 * Used in the agenda view without extra queries.
 */
export interface AppointmentWithPatient extends AppointmentLocal {
  patientName?: string;
  patientSpecies?: string;
  ownerName?: string;
  ownerPhone?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const APPOINTMENT_STATUSES: Record<AppointmentStatus, { label: string; color: string; punto: string }> = {
  pending:     { label: 'Pendiente',    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',     punto: 'bg-amber-400' },
  confirmed:   { label: 'Confirmada',   color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',           punto: 'bg-blue-500' },
  in_progress: { label: 'En curso',     color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800', punto: 'bg-purple-500 animate-pulse' },
  completed:   { label: 'Completada',   color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',     punto: 'bg-green-500' },
  cancelled:   { label: 'Cancelada',    color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',                 punto: 'bg-red-400' },
  no_show:     { label: 'No asistió',   color: 'text-muted-foreground bg-muted border-border',                                                                    punto: 'bg-muted-foreground' },
};

export const APPOINTMENT_TYPES: Record<AppointmentType, { label: string; emoji: string }> = {
  consultation: { label: 'Consultation general',  emoji: '🩺' },
  vaccination:  { label: 'Vacunación',        emoji: '💉' },
  surgery:      { label: 'Cirugía',           emoji: '🔬' },
  checkup:      { label: 'Control',           emoji: '📋' },
  deworming:    { label: 'Desparasitación',   emoji: '🐛' },
  grooming:     { label: 'Estética',          emoji: '✂️' },
  emergency:    { label: 'Emergencia',        emoji: '🚨' },
  other:        { label: 'Otro',              emoji: '📌' },
};

/** Durations available in the form */
export const APPOINTMENT_DURATIONS = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1 h 30 min' },
  { value: 120, label: '2 horas' },
];

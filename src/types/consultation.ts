// ─────────────────────────────────────────────────────────────────────────────
// TYPES — Consultations / Appointments Module
//
// A "Consultation" is the central event that connects:
//   Agenda → Clinical History → Inventory → Finances
// ─────────────────────────────────────────────────────────────────────────────

import type { SyncMeta } from './patient';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type ConsultationStatus = 'in_progress' | 'completed' | 'cancelled';

export type ConsultationType =
  | 'general_consultation'
  | 'vaccination'
  | 'surgery'
  | 'emergency'
  | 'checkup'
  | 'deworming'
  | 'grooming'
  | 'other';

// ─── Consultation item ────────────────────────────────────────────────────────

/** A product or service added during the visit */
export interface ConsultationItem {
  /** Local UUID — not persisted in Firestore as a separate field */
  id: string;
  /** Reference to the inventory product. Undefined = manual service */
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  /** If true, does NOT deduct from inventory when finalised */
  isService: boolean;
}

// ─── Main Consultation ────────────────────────────────────────────────────────

export interface Consultation {
  id: string;
  patientId: string;
  ownerId: string;
  clinicId: string;

  /** Appointment that originated this consultation (optional — may be walk-in) */
  appointmentId?: string;

  /** Unix timestamp of the start of the visit */
  date: number;

  type: ConsultationType;
  status: ConsultationStatus;

  /** Reason for the visit as reported by the owner */
  reason: string;

  // ── Vital signs ───────────────────────────────────────────────────────────
  weight?: number;
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;

  // ── Clinical history ──────────────────────────────────────────────────────
  /** Problem history and background */
  anamnesis?: string;
  /** Physical exam findings */
  physicalExam?: string;
  diagnosis?: string;
  treatment?: string;
  observations?: string;

  /** Recommended date for next visit "YYYY-MM-DD" */
  nextVisit?: string;

  veterinarian?: string;

  // ── Billing ───────────────────────────────────────────────────────────────
  items: ConsultationItem[];
  subtotal: number;
  /** Discount as a fixed amount (currency) */
  discount: number;
  total: number;

  /** ID of the payment generated on completion */
  paymentId?: string;
  /** ID of the invoice generated on completion */
  invoiceId?: string;

  createdAt: number;
}

export interface ConsultationLocal extends Consultation, SyncMeta {}

/** Consultation with patient data already joined — for lists */
export interface ConsultationWithPatient extends ConsultationLocal {
  patientName?: string;
  patientSpecies?: string;
  ownerName?: string;
}

// ─── UI Constants ─────────────────────────────────────────────────────────────

export const CONSULTATION_TYPES: Record<ConsultationType, { label: string; emoji: string; color: string }> = {
  general_consultation: { label: 'Consultation general', emoji: '🩺', color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800' },
  vaccination:          { label: 'Vacunación',        emoji: '💉', color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800' },
  surgery:              { label: 'Cirugía',           emoji: '🔬', color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800' },
  emergency:            { label: 'Emergencia',        emoji: '🚨', color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800' },
  checkup:              { label: 'Control',           emoji: '📋', color: 'text-teal-600 bg-teal-50 border-teal-200 dark:text-teal-400 dark:bg-teal-950/40 dark:border-teal-800' },
  deworming:            { label: 'Desparasitación',   emoji: '🐛', color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800' },
  grooming:             { label: 'Estética',          emoji: '✂️', color: 'text-pink-600 bg-pink-50 border-pink-200 dark:text-pink-400 dark:bg-pink-950/40 dark:border-pink-800' },
  other:                { label: 'Otro',              emoji: '📌', color: 'text-muted-foreground bg-muted border-border' },
};

export const CONSULTATION_STATUSES: Record<ConsultationStatus, { label: string; color: string; punto: string }> = {
  in_progress: { label: 'En proceso', color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800', punto: 'bg-amber-400' },
  completed:   { label: 'Completada', color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800', punto: 'bg-green-500' },
  cancelled:   { label: 'Cancelada',  color: 'text-red-500 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',            punto: 'bg-red-400' },
};

export const PAYMENT_TYPE_BY_CONSULTATION: Record<ConsultationType, string> = {
  general_consultation: 'consultation',
  vaccination:          'vaccination',
  surgery:              'surgery',
  emergency:            'consultation',
  checkup:              'consultation',
  deworming:            'consultation',
  grooming:             'grooming',
  other:                'other',
};

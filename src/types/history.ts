// Types for the Clinical History module (simple patient notes without billing)
// These are distinct from the full Consultation type which includes billing/items.

import type { SyncMeta } from './patient';
import type { ConsultationType } from './consultation';

// Re-export ConsultationType and CONSULTATION_TYPES from the main module
export type { ConsultationType } from './consultation';
export { CONSULTATION_TYPES } from './consultation';

// ─── Prescribed Medication ───────────────────────────────────────────────────

export interface PrescribedMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string;
}

// ─── Historical Consultation (simple clinical note) ──────────────────────────

export interface HistoricalConsultation {
  id: string;
  patientId: string;
  clinicId: string;
  date: number;
  type: ConsultationType;
  reason: string;
  symptoms?: string;
  temperatura?: number;
  consultationWeight?: number;
  diagnosis?: string;
  treatment?: string;
  medications?: PrescribedMedication[];
  observations?: string;
  nextAppointment?: number;
  veterinarian?: string;
  createdAt: number;
}

export interface HistoricalConsultationLocal extends HistoricalConsultation, SyncMeta {}

export interface HistoricalConsultationWithPatient extends HistoricalConsultationLocal {
  patientName?: string;
  patientSpecies?: string;
}

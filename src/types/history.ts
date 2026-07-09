// Types for the Clinical History module (simple patient notes without billing)
// These are distinct from the full Consultation type which includes billing/items.

import type { SyncMeta } from './patient';
import type { ConsultationType } from './consultation';

// Re-export ConsultationType and CONSULTATION_TYPES from the main module
export type { ConsultationType } from './consultation';
export { CONSULTATION_TYPES } from './consultation';

// ─── Prescribed Medication ───────────────────────────────────────────────────

export interface PrescribedMedication {
  nombre: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
  notas?: string;
}

// ─── Historical Consultation (simple clinical note) ──────────────────────────

export interface HistoricalConsultation {
  id: string;
  pacienteId: string;
  clinicaId: string;
  fecha: number;
  tipo: ConsultationType;
  motivo: string;
  sintomas?: string;
  temperatura?: number;
  pesoConsulta?: number;
  diagnostico?: string;
  tratamiento?: string;
  medicamentos?: PrescribedMedication[];
  observaciones?: string;
  proximaCita?: number;
  veterinario?: string;
  creadoEn: number;
}

export interface HistoricalConsultationLocal extends HistoricalConsultation, SyncMeta {}

export interface HistoricalConsultationWithPatient extends HistoricalConsultationLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
}

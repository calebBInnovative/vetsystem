// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Historial Clínico
// Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Medicamento recetado
// ─────────────────────────────────────────────────────────────────────────────

export const medicamentoSchema = z.object({
  name:      z.string().min(1, 'Ingresa el nombre del medicamento').max(100),
  dosage:    z.string().min(1, 'Ingresa la dosis').max(100),
  frequency: z.string().min(1, 'Ingresa la frecuencia').max(100),
  duration:  z.string().min(1, 'Ingresa la duración').max(100),
  notes:     z.string().max(200).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Consultation
// ─────────────────────────────────────────────────────────────────────────────

export const consultaSchema = z.object({
  type: z.enum(
    ['general_consultation', 'vaccination', 'surgery', 'emergency', 'checkup', 'deworming', 'grooming', 'other'],
    { error: 'Selecciona el tipo de consulta' }
  ),

  /** ISO 8601 datetime string: "YYYY-MM-DDTHH:mm" — valor del input datetime-local */
  date: z
    .string()
    .min(1, 'La fecha es requerida'),

  reason: z
    .string()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(300, 'Máximo 300 caracteres'),

  symptoms: z.string().max(500).optional(),

  temperature: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    },
    z.number()
      .min(30, 'Temperatura mínima 30 °C')
      .max(45, 'Temperatura máxima 45 °C')
      .optional()
  ),

  consultationWeight: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    },
    z.number().positive('El peso debe ser mayor a 0').max(999).optional()
  ),

  diagnosis:    z.string().max(500).optional(),
  treatment:    z.string().max(500).optional(),
  observations: z.string().max(1000).optional(),

  medications: z.array(medicamentoSchema).optional(),

  /** ISO 8601 date string: "YYYY-MM-DD" */
  nextAppointment: z.string().optional(),

  veterinarian: z.string().max(100).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INFERIDOS
// ─────────────────────────────────────────────────────────────────────────────

export type ConsultaFormData    = z.infer<typeof consultaSchema>;
export type MedicamentoFormData = z.infer<typeof medicamentoSchema>;

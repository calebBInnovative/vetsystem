// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Agenda / Citas
// Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const citaSchema = z.object({
  patientId: z
    .string()
    .min(1, 'Selecciona un paciente'),

  date: z
    .string()
    .min(1, 'La fecha es requerida'),

  startTime: z
    .string()
    .min(1, 'La hora de inicio es requerida')
    .regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido'),

  durationMinutes: z.preprocess(
    (val) => (val === '' || val === undefined ? 30 : Number(val)),
    z.number().int().min(5).max(480)
  ),

  type: z.enum(
    ['consultation', 'vaccination', 'surgery', 'checkup', 'deworming', 'grooming', 'emergency', 'other'],
    { error: 'Selecciona el tipo de cita' }
  ),

  reason: z
    .string()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(200),

  veterinarian: z.string().max(100).optional(),

  notes: z.string().max(500).optional(),
});

export type CitaFormData = z.infer<typeof citaSchema>;

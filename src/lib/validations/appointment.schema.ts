// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Agenda / Citas
// Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const citaSchema = z.object({
  pacienteId: z
    .string()
    .min(1, 'Selecciona un paciente'),

  fecha: z
    .string()
    .min(1, 'La fecha es requerida'),

  horaInicio: z
    .string()
    .min(1, 'La hora de inicio es requerida')
    .regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido'),

  duracionMinutos: z.preprocess(
    (val) => (val === '' || val === undefined ? 30 : Number(val)),
    z.number().int().min(5).max(480)
  ),

  tipo: z.enum(
    ['consulta', 'vacunacion', 'cirugia', 'control', 'desparasitacion', 'estetica', 'emergencia', 'otro'],
    { error: 'Selecciona el tipo de cita' }
  ),

  motivo: z
    .string()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(200),

  veterinario: z.string().max(100).optional(),

  notas: z.string().max(500).optional(),
});

export type CitaFormData = z.infer<typeof citaSchema>;

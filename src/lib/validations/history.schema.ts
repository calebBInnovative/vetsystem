// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Historial Clínico
// Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Medicamento recetado
// Se usa como array en el formulario de consulta.
// ─────────────────────────────────────────────────────────────────────────────

export const medicamentoSchema = z.object({
  nombre:     z.string().min(1, 'Ingresa el nombre del medicamento').max(100),
  dosis:      z.string().min(1, 'Ingresa la dosis').max(100),
  frecuencia: z.string().min(1, 'Ingresa la frecuencia').max(100),
  duracion:   z.string().min(1, 'Ingresa la duración').max(100),
  notas:      z.string().max(200).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Consultation
// ─────────────────────────────────────────────────────────────────────────────

export const consultaSchema = z.object({
  tipo: z.enum(
    ['consulta_general', 'vacunacion', 'cirugia', 'emergencia', 'control', 'desparasitacion', 'estetica', 'otro'],
    { error: 'Selecciona el tipo de consulta' }
  ),

  /** ISO 8601 datetime string: "YYYY-MM-DDTHH:mm" — valor del input datetime-local */
  fecha: z
    .string()
    .min(1, 'La fecha es requerida'),

  motivo: z
    .string()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(300, 'Máximo 300 caracteres'),

  sintomas: z.string().max(500).optional(),

  temperatura: z.preprocess(
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

  pesoConsulta: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    },
    z.number().positive('El peso debe ser mayor a 0').max(999).optional()
  ),

  diagnostico:  z.string().max(500).optional(),
  tratamiento:  z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),

  medicamentos: z.array(medicamentoSchema).optional(),

  /** ISO 8601 date string: "YYYY-MM-DD" */
  proximaCita: z.string().optional(),

  veterinario: z.string().max(100).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INFERIDOS
// ─────────────────────────────────────────────────────────────────────────────

export type ConsultaFormData    = z.infer<typeof consultaSchema>;
export type MedicamentoFormData = z.infer<typeof medicamentoSchema>;

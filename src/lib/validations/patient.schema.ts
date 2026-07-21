// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Pacientes
// Usa Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Owner
// ─────────────────────────────────────────────────────────────────────────────

export const duenoSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),

  phone: z
    .string()
    .min(7, 'Ingresa un número de teléfono válido')
    .max(20, 'Número demasiado largo')
    .regex(/^[\d\s\-\+\(\)]+$/, 'Solo se permiten números, espacios y guiones'),

  // Email opcional: acepta string vacío "" o un email válido
  email: z
    .string()
    .email('Correo electrónico inválido')
    .optional()
    .or(z.literal('')),

  address: z.string().max(200, 'La dirección es demasiado larga').optional(),

  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Patient
// ─────────────────────────────────────────────────────────────────────────────

export const pacienteSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre de la mascota es requerido')
    .max(60, 'El nombre es demasiado largo'),

  species: z.enum(
    ['dog', 'cat', 'bird', 'rabbit', 'reptile', 'other'],
    { error: 'Selecciona una especie' }
  ),

  breed: z.string().max(60, 'Raza demasiado larga').optional(),

  sex: z.enum(
    ['male', 'female'],
    { error: 'Selecciona el sexo' }
  ),

  birthDate: z
    .string()
    .refine((v) => {
      if (!v) return true;
      const d = new Date(v);
      return !isNaN(d.getTime());
    }, 'Fecha de nacimiento inválida')
    .refine((v) => {
      if (!v) return true;
      return new Date(v) <= new Date();
    }, 'La fecha no puede ser en el futuro')
    .optional(),

  /**
   * Peso: el input HTML siempre retorna string.
   * `z.preprocess` convierte "" → undefined y "4.5" → 4.5 antes de validar.
   */
  weight: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    },
    z.number({ error: 'Ingresa un número válido' })
      .positive('El peso debe ser mayor a 0')
      .max(999, 'El peso parece incorrecto')
      .optional()
  ),

  color: z.string().max(60, 'Descripción demasiado larga').optional(),

  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),

  owner: duenoSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INFERIDOS
// ─────────────────────────────────────────────────────────────────────────────

export type PacienteFormData = z.infer<typeof pacienteSchema>;
export type DuenoFormData    = z.infer<typeof duenoSchema>;

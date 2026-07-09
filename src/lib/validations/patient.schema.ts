// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS DE VALIDACIÓN — Módulo Pacientes
// Usa Zod v4. Compatible con React Hook Form via @hookform/resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Dueño
// Se define por separado para poder reutilizarlo en el formulario de edición.
// ─────────────────────────────────────────────────────────────────────────────

export const duenoSchema = z.object({
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),

  telefono: z
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

  direccion: z.string().max(200, 'La dirección es demasiado larga').optional(),

  notas: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA: Patient
// Incluye el objeto `dueno` anidado para registrar ambos en un solo formulario.
// ─────────────────────────────────────────────────────────────────────────────

export const pacienteSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre de la mascota es requerido')
    .max(60, 'El nombre es demasiado largo'),

  especie: z.enum(
    ['perro', 'gato', 'ave', 'conejo', 'reptil', 'otro'],
    { error: 'Selecciona una especie' }
  ),

  raza: z.string().max(60, 'Raza demasiado larga').optional(),

  sexo: z.enum(
    ['macho', 'hembra'],
    { error: 'Selecciona el sexo' }
  ),

  fechaNacimiento: z
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
  peso: z.preprocess(
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

  notas: z.string().max(500, 'Máximo 500 caracteres').optional(),

  dueno: duenoSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INFERIDOS
// Se exportan para usarlos como tipado del formulario.
// ─────────────────────────────────────────────────────────────────────────────

export type PacienteFormData = z.infer<typeof pacienteSchema>;
export type DuenoFormData    = z.infer<typeof duenoSchema>;

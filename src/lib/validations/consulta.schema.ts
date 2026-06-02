import { z } from 'zod';

// ─── Item ─────────────────────────────────────────────────────────────────────

export const consultaItemSchema = z.object({
  id:              z.string(),
  productoId:      z.string().optional(),
  descripcion:     z.string().min(1, 'El producto/servicio requiere descripción'),
  cantidad:        z.number().positive('La cantidad debe ser mayor a 0'),
  precioUnitario:  z.number().min(0),
  subtotal:        z.number().min(0),
  esServicio:      z.boolean(),
});

// ─── Consulta principal ───────────────────────────────────────────────────────

function numOpt(error: string) {
  return z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ error }).positive(error).optional()
  );
}

export const consultaSchema = z.object({
  pacienteId: z.string().min(1, 'Selecciona un paciente'),
  citaId:     z.string().optional(),

  tipo: z.enum(
    ['consulta_general', 'vacunacion', 'cirugia', 'emergencia', 'control', 'desparasitacion', 'estetica', 'otro'],
    { error: 'Selecciona el tipo de atención' }
  ),

  motivo: z
    .string()
    .min(3, 'Describe el motivo de la visita')
    .max(500),

  // ── Signos vitales ────────────────────────────────────────────────────────
  peso:                 numOpt('Peso inválido'),
  temperatura:          numOpt('Temperatura inválida'),
  frecuenciaCardiaca:   numOpt('FC inválida'),
  frecuenciaRespiratoria: numOpt('FR inválida'),

  // ── Historia clínica (todos opcionales) ──────────────────────────────────
  anamnesis:    z.string().max(3000).optional(),
  examenFisico: z.string().max(3000).optional(),
  diagnostico:  z.string().max(1000).optional(),
  tratamiento:  z.string().max(1000).optional(),
  observaciones:z.string().max(500).optional(),

  proximaVisita: z
    .string()
    .refine((v) => !v || !isNaN(new Date(v).getTime()), 'Fecha inválida')
    .optional(),

  veterinario: z.string().max(100).optional(),

  // ── Facturación ───────────────────────────────────────────────────────────
  items: z.array(consultaItemSchema).default([]),

  descuento: z.preprocess(
    (v) => (v === '' || v == null ? 0 : Number(v)),
    z.number().min(0, 'El descuento no puede ser negativo').default(0)
  ),
});

export type ConsultaFormData = z.infer<typeof consultaSchema>;
export type ConsultaItemData = z.infer<typeof consultaItemSchema>;

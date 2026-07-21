import { z } from 'zod';

// ─── Item ─────────────────────────────────────────────────────────────────────

export const consultaItemSchema = z.object({
  id:            z.string(),
  productId:     z.string().optional(),
  description:   z.string().min(1, 'El producto/servicio requiere descripción'),
  quantity:      z.number().positive('La cantidad debe ser mayor a 0'),
  unitPrice:     z.number().min(0),
  subtotal:      z.number().min(0),
  isService:     z.boolean(),
});

// ─── Consultation principal ───────────────────────────────────────────────────

function numOpt(error: string) {
  return z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ error }).positive(error).optional()
  );
}

export const consultaSchema = z.object({
  patientId:     z.string().min(1, 'Selecciona un paciente'),
  appointmentId: z.string().optional(),

  type: z.enum(
    ['general_consultation', 'vaccination', 'surgery', 'emergency', 'checkup', 'deworming', 'grooming', 'other'],
    { error: 'Selecciona el tipo de atención' }
  ),

  reason: z.string().max(500).optional().default(''),

  // ── Signos vitales ────────────────────────────────────────────────────────
  weight:          numOpt('Peso inválido'),
  temperature:     numOpt('Temperatura inválida'),
  heartRate:       numOpt('FC inválida'),
  respiratoryRate: numOpt('FR inválida'),

  // ── Historia clínica (todos opcionales) ──────────────────────────────────
  anamnesis:    z.string().max(3000).optional(),
  physicalExam: z.string().max(3000).optional(),
  diagnosis:    z.string().max(1000).optional(),
  treatment:    z.string().max(1000).optional(),
  observations: z.string().max(500).optional(),

  nextVisit: z
    .string()
    .refine((v) => !v || !isNaN(new Date(v).getTime()), 'Fecha inválida')
    .optional(),

  veterinarian: z.string().max(100).optional(),

  // ── Facturación ───────────────────────────────────────────────────────────
  items: z.array(consultaItemSchema).default([]),

  discount: z.preprocess(
    (v) => (v === '' || v == null ? 0 : Number(v)),
    z.number().min(0, 'El descuento no puede ser negativo').default(0)
  ),
});

export type ConsultaFormData = z.infer<typeof consultaSchema>;
export type ConsultaItemData = z.infer<typeof consultaItemSchema>;

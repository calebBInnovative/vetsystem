import { z } from 'zod';

export const pagoSchema = z.object({
  patientId: z.string().min(1, 'Selecciona un paciente'),

  date: z.string().min(1, 'La fecha es requerida'),

  concept: z
    .string()
    .min(2, 'El concepto debe tener al menos 2 caracteres')
    .max(200),

  type: z.enum(
    ['consultation', 'vaccination', 'surgery', 'product', 'grooming', 'other'],
    { error: 'Selecciona el tipo de ingreso' }
  ),

  amount: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number({ error: 'Ingresa un monto válido' })
      .positive('El monto debe ser mayor a 0')
      .max(99999, 'Monto demasiado alto')
  ),

  paymentMethod: z.enum(
    ['cash', 'card', 'transfer', 'check', 'other'],
    { error: 'Selecciona el método de pago' }
  ),

  status: z.enum(['pending', 'paid', 'cancelled', 'refunded']).default('paid'),

  notes: z.string().max(300).optional(),
});

export type PagoFormData = z.infer<typeof pagoSchema>;

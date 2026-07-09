import { z } from 'zod';

export const pagoSchema = z.object({
  pacienteId: z.string().min(1, 'Selecciona un paciente'),

  fecha: z.string().min(1, 'La fecha es requerida'),

  concepto: z
    .string()
    .min(2, 'El concepto debe tener al menos 2 caracteres')
    .max(200),

  tipo: z.enum(
    ['consulta', 'vacunacion', 'cirugia', 'producto', 'estetica', 'otro'],
    { error: 'Selecciona el tipo de ingreso' }
  ),

  monto: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number({ error: 'Ingresa un monto válido' })
      .positive('El monto debe ser mayor a 0')
      .max(99999, 'Monto demasiado alto')
  ),

  metodoPago: z.enum(
    ['efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro'],
    { error: 'Selecciona el método de pago' }
  ),

  estado: z.enum(['pendiente', 'pagado', 'cancelado', 'reembolsado']).default('pagado'),

  notas: z.string().max(300).optional(),
});

export type PagoFormData = z.infer<typeof pagoSchema>;

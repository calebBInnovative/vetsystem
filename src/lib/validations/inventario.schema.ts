import { z } from 'zod';

export const productoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),

  categoria: z.enum(
    ['medicamento', 'vacuna', 'antiparasitario', 'alimento', 'accesorio', 'higiene', 'cirugia', 'laboratorio', 'otro'],
    { error: 'Selecciona una categoría' }
  ),

  descripcion: z.string().max(300).optional(),

  stockActual: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().int('Debe ser número entero').min(0, 'No puede ser negativo')
  ),

  stockMinimo: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().int('Debe ser número entero').min(0, 'No puede ser negativo')
  ),

  unidad: z.enum(
    ['unidad', 'caja', 'frasco', 'ampolla', 'tableta', 'ml', 'mg', 'kg', 'gramo', 'litro'],
    { error: 'Selecciona una unidad' }
  ),

  precioVenta: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number().positive('Debe ser mayor a 0').optional()
  ),

  precioCosto: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number().positive('Debe ser mayor a 0').optional()
  ),

  fechaVencimiento: z.string().optional(),
  lote:             z.string().max(50).optional(),
  proveedor:        z.string().max(100).optional(),
});

export const ajusteStockSchema = z.object({
  tipo: z.enum(['entrada', 'salida', 'ajuste']),
  cantidad: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().int().positive('La cantidad debe ser mayor a 0')
  ),
  motivo: z.string().max(200).optional(),
});

export type ProductoFormData    = z.infer<typeof productoSchema>;
export type AjusteStockFormData = z.infer<typeof ajusteStockSchema>;

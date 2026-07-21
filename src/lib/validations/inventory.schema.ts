import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),

  category: z.enum(
    ['medication', 'vaccine', 'antiparasitic', 'food', 'accessory', 'hygiene', 'surgery', 'laboratory', 'other'],
    { error: 'Selecciona una categoría' }
  ),

  description: z.string().max(300).optional(),

  currentStock: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().min(0, 'No puede ser negativo')
  ),

  minimumStock: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().min(0, 'No puede ser negativo')
  ),

  unit: z.enum(
    ['unit', 'box', 'bottle', 'ampoule', 'tablet', 'dose', 'ml', 'mg', 'kg', 'gram', 'liter', 'pound'],
    { error: 'Selecciona una unidad' }
  ),

  salePrice: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number().positive('Debe ser mayor a 0').optional()
  ),

  costPrice: z.preprocess(
    (val) => (val === '' || val == null ? undefined : Number(val)),
    z.number().positive('Debe ser mayor a 0').optional()
  ),

  expirationDate: z.string().optional(),
  batch:          z.string().max(50).optional(),
  supplier:       z.string().max(100).optional(),
});

export const stockAdjustmentSchema = z.object({
  type: z.enum(['entry', 'exit', 'adjustment']),
  quantity: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().int().positive('La cantidad debe ser mayor a 0')
  ),
  reason: z.string().max(200).optional(),
});

export type ProductFormData        = z.infer<typeof productSchema>;
export type StockAdjustmentFormData = z.infer<typeof stockAdjustmentSchema>;

// Backward-compat aliases
export const productoSchema       = productSchema;
export const ajusteStockSchema    = stockAdjustmentSchema;
export type ProductoFormData      = ProductFormData;
export type AjusteStockFormData   = StockAdjustmentFormData;

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { productoSchema, type ProductoFormData } from '@/lib/validations/inventory.schema';
import { PRODUCT_CATEGORIES, MEASUREMENT_UNITS } from '@/types/inventory';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ProductoFormProps {
  onSubmit: (data: ProductoFormData) => Promise<void>;
  loading?: boolean;
  defaultValues?: Partial<ProductoFormData>;
  textoBoton?: string;
}

export function ProductoForm({
  onSubmit,
  loading = false,
  defaultValues,
  textoBoton = 'Guardar Producto',
}: ProductoFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductoFormData>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      category:     'medication',
      unit:         'unit',
      currentStock: 0,
      minimumStock: 5,
      ...defaultValues,
    },
  });

  const categoryActual = watch('category');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* ── Categoría ────────────────────────────────────── */}
      <section>
        <h3 className={sectionLabel}>Categoría</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(Object.entries(PRODUCT_CATEGORIES) as [keyof typeof PRODUCT_CATEGORIES, { label: string; emoji: string }][]).map(
            ([valor, { label, emoji }]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setValue('category', valor, { shouldValidate: true })}
                className={cn(
                  'flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                  categoryActual === valor
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-center leading-tight">{label}</span>
              </button>
            )
          )}
        </div>
        {errors.category && <Err>{errors.category.message}</Err>}
      </section>

      {/* ── Datos básicos ────────────────────────────────── */}
      <section>
        <h3 className={sectionLabel}>Información del Producto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              {...register('name')}
              placeholder="Nombre del producto o medicamento"
              className={field(!!errors.name)}
              autoFocus
            />
            {errors.name && <Err>{errors.name.message}</Err>}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Descripción</label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Descripción, concentración, presentación..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          <div>
            <label className={labelClass}>Proveedor / Laboratorio</label>
            <input
              {...register('supplier')}
              placeholder="Nombre del proveedor"
              className={field(false)}
            />
          </div>

          <div>
            <label className={labelClass}>
              Unidad de medida <span className="text-destructive">*</span>
            </label>
            <select {...register('unit')} className={field(!!errors.unit)}>
              {(Object.entries(MEASUREMENT_UNITS) as [string, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            {errors.unit && <Err>{errors.unit.message}</Err>}
          </div>

        </div>
      </section>

      {/* ── Stock ────────────────────────────────────────── */}
      <section>
        <h3 className={sectionLabel}>Control de Stock</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">

          <div>
            <label className={labelClass}>
              Stock actual <span className="text-destructive">*</span>
            </label>
            <input
              {...register('currentStock')}
              type="number"
              min="0"
              step="any"
              placeholder="0"
              className={field(!!errors.currentStock)}
            />
            {errors.currentStock && <Err>{errors.currentStock.message}</Err>}
          </div>

          <div>
            <label className={labelClass}>
              Stock mínimo <span className="text-destructive">*</span>
            </label>
            <input
              {...register('minimumStock')}
              type="number"
              min="0"
              step="any"
              placeholder="5"
              className={field(!!errors.minimumStock)}
            />
            {errors.minimumStock && <Err>{errors.minimumStock.message}</Err>}
          </div>

          <div>
            <label className={labelClass}>Precio de venta ($)</label>
            <input
              {...register('salePrice')}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className={field(!!errors.salePrice)}
            />
            {errors.salePrice && <Err>{errors.salePrice.message}</Err>}
          </div>

          <div>
            <label className={labelClass}>Precio de costo ($)</label>
            <input
              {...register('costPrice')}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className={field(false)}
            />
          </div>

        </div>
      </section>

      {/* ── Lote y vencimiento ───────────────────────────── */}
      <section>
        <h3 className={sectionLabel}>Lote y Vencimiento</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <div>
            <label className={labelClass}>Número de lote</label>
            <input
              {...register('batch')}
              placeholder="Ej: LOT-2024-001"
              className={field(false)}
            />
          </div>

          <div>
            <label className={labelClass}>Fecha de vencimiento</label>
            <DatePicker
              value={watch('expirationDate')}
              onChange={(v) => setValue('expirationDate', v, { shouldValidate: true })}
              placeholder="Selecciona la fecha"
              toDate={new Date(new Date().getFullYear() + 10, 11, 31)}
              fromDate={new Date()}
            />
          </div>

        </div>
      </section>

      {/* ── Submit ───────────────────────────────────────── */}
      <Button type="submit" className="w-full h-12 text-base font-medium" disabled={loading}>
        {loading
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
          : textoBoton
        }
      </Button>

    </form>
  );
}

const sectionLabel = 'text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 block';
const labelClass   = 'block text-sm font-medium mb-1.5';

function field(hasError: boolean) {
  return cn(
    'w-full rounded-xl border bg-background px-3 py-2.5 text-sm',
    'placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
    'transition-colors',
    hasError ? 'border-destructive' : 'border-input'
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}

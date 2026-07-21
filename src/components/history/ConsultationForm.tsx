'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { consultaSchema, type ConsultaFormData } from '@/lib/validations/history.schema';
import { CONSULTATION_TYPES } from '@/types/consultation';
import { Button } from '@/components/ui/button';
import { DatePicker, DateTimePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface ConsultaFormProps {
  onSubmit: (datos: ConsultaFormData) => Promise<void>;
  loading?: boolean;
  defaultValues?: Partial<ConsultaFormData>;
  textoBoton?: string;
}

export function ConsultaForm({
  onSubmit,
  loading = false,
  defaultValues,
  textoBoton = 'Guardar Consultation',
}: ConsultaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<ConsultaFormData>({
    resolver: zodResolver(consultaSchema),
    defaultValues: {
      type: 'general_consultation',
      date: new Date().toISOString().slice(0, 16),
      medications: [],
      ...defaultValues,
    },
  });

  const tipoActual = watch('type');

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'medications',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* ── Tipo de consulta ─────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Tipo de Consultation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(CONSULTATION_TYPES) as [keyof typeof CONSULTATION_TYPES, { label: string; emoji: string }][]).map(
            ([valor, { label, emoji }]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setValue('type', valor, { shouldValidate: true })}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                  tipoActual === valor
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="text-lg leading-none shrink-0">{emoji}</span>
                <span className="truncate">{label}</span>
              </button>
            )
          )}
        </div>
        {errors.type && <Err>{errors.type.message}</Err>}
      </section>

      {/* ── Datos básicos ────────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Datos de la Visita</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Fecha */}
          <div>
            <label className={labelClass}>
              Fecha y hora <span className="text-destructive">*</span>
            </label>
            <DateTimePicker
              value={watch('date')}
              onChange={(v) => setValue('date', v, { shouldValidate: true })}
              hasError={!!errors.date}
            />
            {errors.date && <Err>{errors.date.message}</Err>}
          </div>

          {/* Veterinario */}
          <div>
            <label className={labelClass}>Veterinario</label>
            <input
              {...register('veterinarian')}
              placeholder="Nombre del veterinario"
              className={field(false)}
            />
          </div>

          {/* Motivo */}
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Motivo de consulta <span className="text-destructive">*</span>
            </label>
            <input
              {...register('reason')}
              placeholder="¿Por qué trae a la mascota hoy?"
              className={field(!!errors.reason)}
              autoFocus
            />
            {errors.reason && <Err>{errors.reason.message}</Err>}
          </div>

          {/* Síntomas */}
          <div className="sm:col-span-2">
            <label className={labelClass}>Síntomas observados</label>
            <textarea
              {...register('symptoms')}
              rows={2}
              placeholder="Signos clínicos, comportamiento, tiempo de evolución..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          {/* Temperatura */}
          <div>
            <label className={labelClass}>Temperatura (°C)</label>
            <input
              {...register('temperature')}
              type="number"
              step="0.1"
              min="30"
              max="45"
              placeholder="38.5"
              className={field(!!errors.temperature)}
            />
            {errors.temperature && <Err>{errors.temperature.message}</Err>}
          </div>

          {/* Peso en consulta */}
          <div>
            <label className={labelClass}>Peso en consulta (kg)</label>
            <input
              {...register('consultationWeight')}
              type="number"
              step="0.1"
              min="0"
              placeholder="4.5"
              className={field(!!errors.consultationWeight)}
            />
            {errors.consultationWeight && <Err>{errors.consultationWeight.message}</Err>}
          </div>

        </div>
      </section>

      {/* ── Diagnóstico y tratamiento ─────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Diagnóstico y Tratamiento</h3>
        <div className="grid grid-cols-1 gap-4">

          <div>
            <label className={labelClass}>Diagnóstico</label>
            <textarea
              {...register('diagnosis')}
              rows={2}
              placeholder="Diagnóstico presuntivo o definitivo..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          <div>
            <label className={labelClass}>Tratamiento indicado</label>
            <textarea
              {...register('treatment')}
              rows={2}
              placeholder="Procedimientos realizados, indicaciones al dueño..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          <div>
            <label className={labelClass}>Observaciones adicionales</label>
            <textarea
              {...register('observations')}
              rows={2}
              placeholder="Notas del veterinario, seguimiento recomendado..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

        </div>
      </section>

      {/* ── Medicamentos ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className={seccionLabel + ' mb-0'}>Medicamentos Recetados</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', dosage: '', frequency: '', duration: '', notes: '' })}
            className="gap-1.5 text-xs"
          >
            <Plus size={13} />
            Agregar
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded-xl">
            Sin medications recetados
          </p>
        ) : (
          <div className="space-y-3">
            {fields.map((field_item, index) => (
              <div
                key={field_item.id}
                className="bg-muted/40 rounded-xl p-4 space-y-3 border border-border/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Medicamento {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    aria-label="Eliminar medicamento"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Nombre del medicamento *</label>
                    <input
                      {...register(`medications.${index}.name`)}
                      placeholder="Ej: Amoxicilina"
                      className={field(!!errors.medications?.[index]?.name)}
                    />
                    {errors.medications?.[index]?.name && (
                      <Err>{errors.medications[index]?.name?.message}</Err>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Dosis *</label>
                    <input
                      {...register(`medications.${index}.dosage`)}
                      placeholder="Ej: 250mg"
                      className={field(!!errors.medications?.[index]?.dosage)}
                    />
                    {errors.medications?.[index]?.dosage && (
                      <Err>{errors.medications[index]?.dosage?.message}</Err>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Frecuencia *</label>
                    <input
                      {...register(`medications.${index}.frequency`)}
                      placeholder="Ej: Cada 12 horas"
                      className={field(!!errors.medications?.[index]?.frequency)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Duración *</label>
                    <input
                      {...register(`medications.${index}.duration`)}
                      placeholder="Ej: 7 días"
                      className={field(!!errors.medications?.[index]?.duration)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Notas</label>
                    <input
                      {...register(`medications.${index}.notes`)}
                      placeholder="Con o sin comida, etc."
                      className={field(false)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Próxima cita ─────────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Seguimiento</h3>
        <div className="max-w-xs">
          <label className={labelClass}>Próxima cita recomendada</label>
          <DatePicker
            value={watch('nextAppointment')}
            onChange={(v) => setValue('nextAppointment', v, { shouldValidate: true })}
            placeholder="Selecciona la fecha"
            fromDate={new Date()}
            toDate={new Date(new Date().getFullYear() + 2, 11, 31)}
          />
        </div>
      </section>

      {/* ── Submit ───────────────────────────────────────── */}
      <Button type="submit" className="w-full h-12 text-base font-medium" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Guardando...
          </>
        ) : (
          textoBoton
        )}
      </Button>

    </form>
  );
}

// ─── Helpers de estilo ────────────────────────────────────────────────────────

const seccionLabel = 'text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 block';
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

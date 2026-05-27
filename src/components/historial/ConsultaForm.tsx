'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { consultaSchema, type ConsultaFormData } from '@/lib/validations/historial.schema';
import { TIPOS_CONSULTA } from '@/types/historial';
import { Button } from '@/components/ui/button';
import { DatePicker, DateTimePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface ConsultaFormProps {
  onSubmit: (datos: ConsultaFormData) => Promise<void>;
  cargando?: boolean;
  defaultValues?: Partial<ConsultaFormData>;
  textoBoton?: string;
}

export function ConsultaForm({
  onSubmit,
  cargando = false,
  defaultValues,
  textoBoton = 'Guardar Consulta',
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
      tipo: 'consulta_general',
      fecha: new Date().toISOString().slice(0, 16),
      medicamentos: [],
      ...defaultValues,
    },
  });

  const tipoActual = watch('tipo');

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'medicamentos',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* ── Tipo de consulta ─────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Tipo de Consulta</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(TIPOS_CONSULTA) as [keyof typeof TIPOS_CONSULTA, { label: string; emoji: string }][]).map(
            ([valor, { label, emoji }]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setValue('tipo', valor, { shouldValidate: true })}
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
        {errors.tipo && <Err>{errors.tipo.message}</Err>}
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
              value={watch('fecha')}
              onChange={(v) => setValue('fecha', v, { shouldValidate: true })}
              hasError={!!errors.fecha}
            />
            {errors.fecha && <Err>{errors.fecha.message}</Err>}
          </div>

          {/* Veterinario */}
          <div>
            <label className={labelClass}>Veterinario</label>
            <input
              {...register('veterinario')}
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
              {...register('motivo')}
              placeholder="¿Por qué trae a la mascota hoy?"
              className={field(!!errors.motivo)}
              autoFocus
            />
            {errors.motivo && <Err>{errors.motivo.message}</Err>}
          </div>

          {/* Síntomas */}
          <div className="sm:col-span-2">
            <label className={labelClass}>Síntomas observados</label>
            <textarea
              {...register('sintomas')}
              rows={2}
              placeholder="Signos clínicos, comportamiento, tiempo de evolución..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          {/* Temperatura */}
          <div>
            <label className={labelClass}>Temperatura (°C)</label>
            <input
              {...register('temperatura')}
              type="number"
              step="0.1"
              min="30"
              max="45"
              placeholder="38.5"
              className={field(!!errors.temperatura)}
            />
            {errors.temperatura && <Err>{errors.temperatura.message}</Err>}
          </div>

          {/* Peso en consulta */}
          <div>
            <label className={labelClass}>Peso en consulta (kg)</label>
            <input
              {...register('pesoConsulta')}
              type="number"
              step="0.1"
              min="0"
              placeholder="4.5"
              className={field(!!errors.pesoConsulta)}
            />
            {errors.pesoConsulta && <Err>{errors.pesoConsulta.message}</Err>}
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
              {...register('diagnostico')}
              rows={2}
              placeholder="Diagnóstico presuntivo o definitivo..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          <div>
            <label className={labelClass}>Tratamiento indicado</label>
            <textarea
              {...register('tratamiento')}
              rows={2}
              placeholder="Procedimientos realizados, indicaciones al dueño..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

          <div>
            <label className={labelClass}>Observaciones adicionales</label>
            <textarea
              {...register('observaciones')}
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
            onClick={() => append({ nombre: '', dosis: '', frecuencia: '', duracion: '', notas: '' })}
            className="gap-1.5 text-xs"
          >
            <Plus size={13} />
            Agregar
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded-xl">
            Sin medicamentos recetados
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
                      {...register(`medicamentos.${index}.nombre`)}
                      placeholder="Ej: Amoxicilina"
                      className={field(!!errors.medicamentos?.[index]?.nombre)}
                    />
                    {errors.medicamentos?.[index]?.nombre && (
                      <Err>{errors.medicamentos[index]?.nombre?.message}</Err>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Dosis *</label>
                    <input
                      {...register(`medicamentos.${index}.dosis`)}
                      placeholder="Ej: 250mg"
                      className={field(!!errors.medicamentos?.[index]?.dosis)}
                    />
                    {errors.medicamentos?.[index]?.dosis && (
                      <Err>{errors.medicamentos[index]?.dosis?.message}</Err>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Frecuencia *</label>
                    <input
                      {...register(`medicamentos.${index}.frecuencia`)}
                      placeholder="Ej: Cada 12 horas"
                      className={field(!!errors.medicamentos?.[index]?.frecuencia)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Duración *</label>
                    <input
                      {...register(`medicamentos.${index}.duracion`)}
                      placeholder="Ej: 7 días"
                      className={field(!!errors.medicamentos?.[index]?.duracion)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Notas</label>
                    <input
                      {...register(`medicamentos.${index}.notas`)}
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
            value={watch('proximaCita')}
            onChange={(v) => setValue('proximaCita', v, { shouldValidate: true })}
            placeholder="Selecciona la fecha"
            fromDate={new Date()}
            toDate={new Date(new Date().getFullYear() + 2, 11, 31)}
          />
        </div>
      </section>

      {/* ── Submit ───────────────────────────────────────── */}
      <Button type="submit" className="w-full h-12 text-base font-medium" disabled={cargando}>
        {cargando ? (
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

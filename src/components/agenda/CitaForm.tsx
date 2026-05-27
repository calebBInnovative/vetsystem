'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { citaSchema, type CitaFormData } from '@/lib/validations/agenda.schema';
import { TIPOS_CITA, DURACIONES } from '@/types/agenda';
import { PacienteSelector } from '@/components/common/PacienteSelector';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface CitaFormProps {
  onSubmit: (datos: CitaFormData) => Promise<void>;
  cargando?: boolean;
  defaultValues?: Partial<CitaFormData>;
  textoBoton?: string;
}

export function CitaForm({
  onSubmit,
  cargando = false,
  defaultValues,
  textoBoton = 'Agendar Cita',
}: CitaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CitaFormData>({
    resolver: zodResolver(citaSchema),
    defaultValues: {
      tipo:             'consulta',
      duracionMinutos:  30,
      horaInicio:       '08:00',
      fecha:            new Date().toISOString().slice(0, 10),
      ...defaultValues,
    },
  });

  const tipoActual = watch('tipo');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* ── Paciente ─────────────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Paciente</h3>
        <PacienteSelector
          value={watch('pacienteId')}
          onChange={(id) => setValue('pacienteId', id, { shouldValidate: true })}
          hasError={!!errors.pacienteId}
        />
        {errors.pacienteId && <Err>{errors.pacienteId.message}</Err>}
      </section>

      {/* ── Tipo de cita ─────────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Tipo de Cita</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(TIPOS_CITA) as [keyof typeof TIPOS_CITA, { label: string; emoji: string }][]).map(
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

      {/* ── Fecha y hora ─────────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Fecha y Hora</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

          {/* Fecha */}
          <div className="sm:col-span-1">
            <label className={labelClass}>
              Fecha <span className="text-destructive">*</span>
            </label>
            <DatePicker
              value={watch('fecha')}
              onChange={(v) => setValue('fecha', v ?? '', { shouldValidate: true })}
              placeholder="Selecciona la fecha"
              hasError={!!errors.fecha}
              fromDate={new Date()}
              toDate={new Date(new Date().getFullYear() + 2, 11, 31)}
            />
            {errors.fecha && <Err>{errors.fecha.message}</Err>}
          </div>

          {/* Hora de inicio */}
          <div>
            <label className={labelClass}>
              Hora de inicio <span className="text-destructive">*</span>
            </label>
            <input
              {...register('horaInicio')}
              type="time"
              className={field(!!errors.horaInicio)}
            />
            {errors.horaInicio && <Err>{errors.horaInicio.message}</Err>}
          </div>

          {/* Duración */}
          <div>
            <label className={labelClass}>Duración</label>
            <select
              {...register('duracionMinutos')}
              className={field(false)}
            >
              {DURACIONES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

        </div>
      </section>

      {/* ── Motivo y detalles ────────────────────────────── */}
      <section>
        <h3 className={seccionLabel}>Detalles</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Motivo <span className="text-destructive">*</span>
            </label>
            <input
              {...register('motivo')}
              placeholder="¿Por qué viene la mascota?"
              className={field(!!errors.motivo)}
              autoFocus
            />
            {errors.motivo && <Err>{errors.motivo.message}</Err>}
          </div>

          <div>
            <label className={labelClass}>Veterinario asignado</label>
            <input
              {...register('veterinario')}
              placeholder="Nombre del veterinario"
              className={field(false)}
            />
          </div>

          <div>
            <label className={labelClass}>Notas internas</label>
            <input
              {...register('notas')}
              placeholder="Notas adicionales..."
              className={field(false)}
            />
          </div>

        </div>
      </section>

      {/* ── Submit ───────────────────────────────────────── */}
      <Button type="submit" className="w-full h-12 text-base font-medium" disabled={cargando}>
        {cargando ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
        ) : (
          textoBoton
        )}
      </Button>

    </form>
  );
}

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

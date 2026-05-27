'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pacienteSchema, type PacienteFormData } from '@/lib/validations/paciente.schema';
import { ESPECIES } from '@/types/paciente';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface PacienteFormProps {
  onSubmit: (datos: PacienteFormData) => Promise<void>;
  cargando?: boolean;
  defaultValues?: Partial<PacienteFormData>;
  textoBoton?: string;
}

export function PacienteForm({
  onSubmit,
  cargando = false,
  defaultValues,
  textoBoton = 'Registrar Paciente',
}: PacienteFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PacienteFormData>({
    resolver: zodResolver(pacienteSchema),
    defaultValues: {
      especie: 'perro',
      sexo: 'macho',
      ...defaultValues,
    },
  });

  const especieActual = watch('especie');
  const sexoActual = watch('sexo');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

      {/* ── Sección: Mascota ─────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Datos de la Mascota
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Nombre */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              {...register('nombre')}
              placeholder="Ej: Max, Luna, Toby..."
              className={field(!!errors.nombre)}
              autoFocus
            />
            {errors.nombre && <Err>{errors.nombre.message}</Err>}
          </div>

          {/* Especie */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Especie <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(Object.entries(ESPECIES) as [keyof typeof ESPECIES, { label: string; emoji: string }][]).map(
                ([valor, { label, emoji }]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setValue('especie', valor, { shouldValidate: true })}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                      especieActual === valor
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    )}
                  >
                    <span className="text-2xl leading-none">{emoji}</span>
                    {label}
                  </button>
                )
              )}
            </div>
            {errors.especie && <Err>{errors.especie.message}</Err>}
          </div>

          {/* Raza */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Raza</label>
            <input
              {...register('raza')}
              placeholder="Ej: Labrador, Persa..."
              className={field(false)}
            />
          </div>

          {/* Sexo */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Sexo <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['macho', 'hembra'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue('sexo', s, { shouldValidate: true })}
                  className={cn(
                    'py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                    sexoActual === s
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  {s === 'macho' ? '♂ Macho' : '♀ Hembra'}
                </button>
              ))}
            </div>
            {errors.sexo && <Err>{errors.sexo.message}</Err>}
          </div>

          {/* Fecha de Nacimiento */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Fecha de Nacimiento</label>
            <DatePicker
              value={watch('fechaNacimiento')}
              onChange={(v) => setValue('fechaNacimiento', v, { shouldValidate: true })}
              placeholder="Selecciona la fecha"
              toDate={new Date()}
            />
          </div>

          {/* Peso */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Peso (kg)</label>
            <input
              {...register('peso')}
              type="number"
              step="0.1"
              min="0"
              placeholder="Ej: 4.5"
              className={field(!!errors.peso)}
            />
            {errors.peso && <Err>{errors.peso.message}</Err>}
          </div>

          {/* Color */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Color / Pelaje</label>
            <input
              {...register('color')}
              placeholder="Ej: Dorado, Negro y blanco, Atigrado..."
              className={field(false)}
            />
          </div>

          {/* Notas */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Notas adicionales</label>
            <textarea
              {...register('notas')}
              rows={2}
              placeholder="Alergias conocidas, observaciones importantes..."
              className={cn(field(false), 'resize-none')}
            />
          </div>

        </div>
      </section>

      {/* ── Sección: Dueño ───────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Datos del Dueño
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Nombre completo <span className="text-destructive">*</span>
            </label>
            <input
              {...register('dueno.nombre')}
              placeholder="Nombre del dueño"
              className={field(!!errors.dueno?.nombre)}
            />
            {errors.dueno?.nombre && <Err>{errors.dueno.nombre.message}</Err>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Teléfono / WhatsApp <span className="text-destructive">*</span>
            </label>
            <input
              {...register('dueno.telefono')}
              type="tel"
              placeholder="Ej: 8888-1234"
              className={field(!!errors.dueno?.telefono)}
            />
            {errors.dueno?.telefono && <Err>{errors.dueno.telefono.message}</Err>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Correo electrónico</label>
            <input
              {...register('dueno.email')}
              type="email"
              placeholder="correo@ejemplo.com (opcional)"
              className={field(!!errors.dueno?.email)}
            />
            {errors.dueno?.email && <Err>{errors.dueno.email.message}</Err>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Dirección</label>
            <input
              {...register('dueno.direccion')}
              placeholder="Barrio, ciudad..."
              className={field(false)}
            />
          </div>

        </div>
      </section>

      {/* ── Botón submit ─────────────────────────────────── */}
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

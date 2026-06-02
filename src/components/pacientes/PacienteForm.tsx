'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { pacienteSchema, type PacienteFormData } from '@/lib/validations/paciente.schema';
import { ESPECIES } from '@/types/paciente';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { Loader2, Camera } from 'lucide-react';

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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
      
      {/* Datos de la Mascota */}
      <section className="space-y-6">
        <h3 className="text-lg font-semibold">Datos de la Mascota</h3>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Nombre */}
          <div className="sm:col-span-2">
            <Label htmlFor="nombre">Nombre <span className="text-destructive">*</span></Label>
            <Input
              id="nombre"
              {...register('nombre')}
              placeholder="Ej: Max, Luna, Toby"
              autoFocus
              className={cn(errors.nombre && "border-destructive")}
            />
            {errors.nombre && <p className="text-sm text-destructive mt-1">{errors.nombre.message}</p>}
          </div>

          {/* Especie */}
          <div className="sm:col-span-2">
            <Label>Especie <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-2">
              {Object.entries(ESPECIES).map(([valor, { label, emoji }]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setValue('especie', valor as any, { shouldValidate: true })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all hover:border-primary/50",
                    especieActual === valor 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-border"
                  )}
                >
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Raza, Sexo, Peso, Fecha */}
          <div>
            <Label htmlFor="raza">Raza</Label>
            <Input id="raza" {...register('raza')} placeholder="Labrador, Persa..." />
          </div>

          <div>
            <Label>Sexo <span className="text-destructive">*</span></Label>
            <div className="flex gap-3 mt-2">
              {(['macho', 'hembra'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue('sexo', s, { shouldValidate: true })}
                  className={cn(
                    "flex-1 py-3 rounded-2xl border-2 text-sm font-medium transition-all",
                    sexoActual === s 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-border hover:border-primary/40"
                  )}
                >
                  {s === 'macho' ? '♂ Macho' : '♀ Hembra'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Fecha de Nacimiento</Label>
            <DatePicker
              value={watch('fechaNacimiento')}
              onChange={(v) => setValue('fechaNacimiento', v, { shouldValidate: true })}
              placeholder="DD/MM/AAAA"
              toDate={new Date()}
              fromDate={new Date(1990, 0, 1)}
              hasError={!!errors.fechaNacimiento}
            />
            {errors.fechaNacimiento && (
              <p className="text-sm text-destructive mt-1">{errors.fechaNacimiento.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="peso">Peso (kg)</Label>
            <Input
              id="peso"
              type="number"
              step="0.1"
              min="0"
              {...register('peso')}
              placeholder="4.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="color">Color / Pelaje</Label>
            <Input id="color" {...register('color')} placeholder="Dorado, Atigrado..." />
          </div>
        </div>
      </section>

      {/* Datos del Dueño */}
      <section className="space-y-6">
        <h3 className="text-lg font-semibold">Datos del Dueño</h3>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="dueno.nombre">Nombre completo <span className="text-destructive">*</span></Label>
            <Input id="dueno.nombre" {...register('dueno.nombre')} placeholder="Nombre del dueño" />
          </div>

          <div>
            <Label htmlFor="dueno.telefono">Teléfono / WhatsApp <span className="text-destructive">*</span></Label>
            <Input id="dueno.telefono" type="tel" {...register('dueno.telefono')} placeholder="8888-1234" />
          </div>

          <div>
            <Label htmlFor="dueno.email">Correo electrónico</Label>
            <Input id="dueno.email" type="email" {...register('dueno.email')} placeholder="ejemplo@email.com" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="dueno.direccion">Dirección</Label>
            <Input id="dueno.direccion" {...register('dueno.direccion')} placeholder="Barrio, casa, referencia..." />
          </div>
        </div>
      </section>

      <Button type="submit" className="w-full h-12 text-base" disabled={cargando}>
        {cargando ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Guardando paciente...
          </>
        ) : (
          textoBoton
        )}
      </Button>
    </form>
  );
}
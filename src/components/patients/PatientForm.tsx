'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { pacienteSchema, type PacienteFormData } from '@/lib/validations/patient.schema';
import { PET_SPECIES } from '@/types/patient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface PacienteFormProps {
  onSubmit: (datos: PacienteFormData) => Promise<void>;
  loading?: boolean;
  defaultValues?: Partial<PacienteFormData>;
  textoBoton?: string;
}

export function PacienteForm({
  onSubmit,
  loading = false,
  defaultValues,
  textoBoton = 'Registrar Patient',
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
      species: 'dog',
      sex: 'male',
      ...defaultValues,
    },
  });

  const speciesActual = watch('species');
  const sexActual = watch('sex');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">

      {/* Datos de la Mascota */}
      <section className="space-y-6">
        <h3 className="text-lg font-semibold">Datos de la Mascota</h3>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Nombre */}
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nombre <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Ej: Max, Luna, Toby"
              autoFocus
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
          </div>

          {/* PetSpecies */}
          <div className="sm:col-span-2">
            <Label>PetSpecies <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-2">
              {Object.entries(PET_SPECIES).map(([valor, { label, emoji }]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setValue('species', valor as PacienteFormData['species'], { shouldValidate: true })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all hover:border-primary/50",
                    speciesActual === valor
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

          {/* Raza, PetSex, Peso, Fecha */}
          <div>
            <Label htmlFor="breed">Raza</Label>
            <Input id="breed" {...register('breed')} placeholder="Labrador, Persa..." />
          </div>

          <div>
            <Label>PetSex <span className="text-destructive">*</span></Label>
            <div className="flex gap-3 mt-2">
              {(['male', 'female'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue('sex', s, { shouldValidate: true })}
                  className={cn(
                    "flex-1 py-3 rounded-2xl border-2 text-sm font-medium transition-all",
                    sexActual === s
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  {s === 'male' ? '♂ Macho' : '♀ Hembra'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Fecha de Nacimiento</Label>
            <DatePicker
              value={watch('birthDate')}
              onChange={(v) => setValue('birthDate', v, { shouldValidate: true })}
              placeholder="DD/MM/AAAA"
              toDate={new Date()}
              fromDate={new Date(1990, 0, 1)}
              hasError={!!errors.birthDate}
            />
            {errors.birthDate && (
              <p className="text-sm text-destructive mt-1">{errors.birthDate.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="weight">Peso (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              min="0"
              {...register('weight')}
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
            <Label htmlFor="owner.name">Nombre completo <span className="text-destructive">*</span></Label>
            <Input id="owner.name" {...register('owner.name')} placeholder="Nombre del dueño" />
          </div>

          <div>
            <Label htmlFor="owner.phone">Teléfono / WhatsApp <span className="text-destructive">*</span></Label>
            <Input id="owner.phone" type="tel" {...register('owner.phone')} placeholder="8888-1234" />
          </div>

          <div>
            <Label htmlFor="owner.email">Correo electrónico</Label>
            <Input id="owner.email" type="email" {...register('owner.email')} placeholder="ejemplo@email.com" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="owner.address">Dirección</Label>
            <Input id="owner.address" {...register('owner.address')} placeholder="Barrio, casa, referencia..." />
          </div>
        </div>
      </section>

      <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
        {loading ? (
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

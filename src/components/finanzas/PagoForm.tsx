'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pagoSchema, type PagoFormData } from '@/lib/validations/finanzas.schema';
import { crearPago } from '@/hooks/useFinanzas';
import { METODOS_PAGO, TIPOS_INGRESO } from '@/types/finanzas';
import { PacienteSelector } from '@/components/common/PacienteSelector';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PagoFormProps {
  pacienteIdInicial?: string;
  onExito?: (pagoId: string) => void;
  onCancelar?: () => void;
}

export function PagoForm({ pacienteIdInicial, onExito, onCancelar }: PagoFormProps) {
  const [enviando, setEnviando] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PagoFormData>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      pacienteId: pacienteIdInicial ?? '',
      fecha:      hoy,
      tipo:       'consulta',
      metodoPago: 'efectivo',
      estado:     'pagado',
    },
  });

  const pacienteId = watch('pacienteId');
  const fechaVal   = watch('fecha');

  async function onSubmit(datos: PagoFormData) {
    setEnviando(true);
    try {
      const id = await crearPago(datos);
      onExito?.(id);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Paciente */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Paciente *</label>
        <PacienteSelector
          value={pacienteId || undefined}
          onChange={(id) => setValue('pacienteId', id, { shouldValidate: true })}
        />
        {errors.pacienteId && <p className="text-xs text-destructive">{errors.pacienteId.message}</p>}
      </div>

      {/* Fecha */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Fecha *</label>
        <DatePicker
          value={fechaVal}
          onChange={(v) => setValue('fecha', v ?? '', { shouldValidate: true })}
          toDate={new Date()}
        />
        {errors.fecha && <p className="text-xs text-destructive">{errors.fecha.message}</p>}
      </div>

      {/* Concepto */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Concepto *</label>
        <input
          {...register('concepto')}
          placeholder="Ej: Consulta general, Vacuna antirrábica…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.concepto && <p className="text-xs text-destructive">{errors.concepto.message}</p>}
      </div>

      {/* Tipo de ingreso */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tipo de ingreso *</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(TIPOS_INGRESO) as [string, { label: string; emoji: string }][]).map(([key, info]) => {
            const activo = watch('tipo') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValue('tipo', key as PagoFormData['tipo'], { shouldValidate: true })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                  activo
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="text-lg">{info.emoji}</span>
                {info.label}
              </button>
            );
          })}
        </div>
        {errors.tipo && <p className="text-xs text-destructive">{errors.tipo.message}</p>}
      </div>

      {/* Monto */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Monto (C$) *</label>
        <input
          {...register('monto')}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.monto && <p className="text-xs text-destructive">{errors.monto.message}</p>}
      </div>

      {/* Método de pago */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Método de pago *</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.entries(METODOS_PAGO) as [string, { label: string; emoji: string }][]).map(([key, info]) => {
            const activo = watch('metodoPago') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValue('metodoPago', key as PagoFormData['metodoPago'], { shouldValidate: true })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                  activo
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="text-lg">{info.emoji}</span>
                {info.label}
              </button>
            );
          })}
        </div>
        {errors.metodoPago && <p className="text-xs text-destructive">{errors.metodoPago.message}</p>}
      </div>

      {/* Estado */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Estado</label>
        <select
          {...register('estado')}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="cancelado">Cancelado</option>
          <option value="reembolsado">Reembolsado</option>
        </select>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Notas</label>
        <textarea
          {...register('notas')}
          rows={2}
          placeholder="Observaciones opcionales…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        {errors.notas && <p className="text-xs text-destructive">{errors.notas.message}</p>}
      </div>

      {/* Acciones */}
      <div className="flex gap-2 pt-1">
        {onCancelar && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={enviando}>
          {enviando && <Loader2 size={14} className="mr-2 animate-spin" />}
          Registrar pago
        </Button>
      </div>
    </form>
  );
}

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@/lib/zod-resolver';
import { pagoSchema, type PagoFormData } from '@/lib/validations/finances.schema';
import { createPayment } from '@/hooks/useFinances';
import { PAYMENT_METHODS, INCOME_TYPES } from '@/types/finances';
import { PacienteSelector } from '@/components/common/PatientSelector';
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
      patientId:     pacienteIdInicial ?? '',
      date:          hoy,
      type:          'consultation',
      paymentMethod: 'cash',
      status:        'paid',
    },
  });

  const pacienteId = watch('patientId');
  const fechaVal   = watch('date');

  async function onSubmit(datos: PagoFormData) {
    setEnviando(true);
    try {
      const id = await createPayment(datos);
      onExito?.(id);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Patient */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Patient *</label>
        <PacienteSelector
          value={pacienteId || undefined}
          onChange={(id) => setValue('patientId', id, { shouldValidate: true })}
        />
        {errors.patientId && <p className="text-xs text-destructive">{errors.patientId.message}</p>}
      </div>

      {/* Fecha */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Fecha *</label>
        <DatePicker
          value={fechaVal}
          onChange={(v) => setValue('date', v ?? '', { shouldValidate: true })}
          toDate={new Date()}
        />
        {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
      </div>

      {/* Concepto */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Concepto *</label>
        <input
          {...register('concept')}
          placeholder="Ej: Consultation general, Vacuna antirrábica…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.concept && <p className="text-xs text-destructive">{errors.concept.message}</p>}
      </div>

      {/* Tipo de ingreso */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tipo de ingreso *</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(INCOME_TYPES) as [string, { label: string; emoji: string }][]).map(([key, info]) => {
            const activo = watch('type') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValue('type', key as PagoFormData['type'], { shouldValidate: true })}
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
        {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
      </div>

      {/* Monto */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Monto (C$) *</label>
        <input
          {...register('amount')}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
      </div>

      {/* Método de pago */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Método de pago *</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.entries(PAYMENT_METHODS) as [string, { label: string; emoji: string }][]).map(([key, info]) => {
            const activo = watch('paymentMethod') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValue('paymentMethod', key as PagoFormData['paymentMethod'], { shouldValidate: true })}
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
        {errors.paymentMethod && <p className="text-xs text-destructive">{errors.paymentMethod.message}</p>}
      </div>

      {/* Estado */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Estado</label>
        <select
          {...register('status')}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="paid">Pagado</option>
          <option value="pending">Pendiente</option>
          <option value="cancelled">Cancelado</option>
          <option value="refunded">Reembolsado</option>
        </select>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Notas</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Observaciones opcionales…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
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

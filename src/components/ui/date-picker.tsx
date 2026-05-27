'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// DATE PICKER — solo fecha, retorna "YYYY-MM-DD"
// ─────────────────────────────────────────────────────────────────────────────

interface DatePickerProps {
  value?: string;           // "YYYY-MM-DD"
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
  /** Fecha máxima seleccionable (Date) */
  toDate?: Date;
  /** Fecha mínima seleccionable (Date) */
  fromDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecciona una fecha',
  hasError = false,
  disabled = false,
  toDate,
  fromDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const fecha = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const fechaValida = fecha && isValid(fecha) ? fecha : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
            'transition-colors text-left',
            fechaValida ? 'text-foreground' : 'text-muted-foreground',
            hasError ? 'border-destructive' : 'border-input',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <CalendarIcon size={15} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {fechaValida
              ? format(fechaValida, "d 'de' MMMM 'de' yyyy", { locale: es })
              : placeholder}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={fechaValida}
          onSelect={(day) => {
            onChange(day ? format(day, 'yyyy-MM-dd') : undefined);
            setOpen(false);
          }}
          locale={es}
          captionLayout="dropdown"
          disabled={[
            ...(toDate ? [{ after: toDate }] : []),
            ...(fromDate ? [{ before: fromDate }] : []),
          ]}
          startMonth={fromDate ?? new Date(1990, 0, 1)}
          endMonth={toDate ?? new Date()}
          defaultMonth={fechaValida ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE TIME PICKER — fecha + hora, retorna "YYYY-MM-DDTHH:mm"
// ─────────────────────────────────────────────────────────────────────────────

interface DateTimePickerProps {
  value?: string;           // "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Selecciona fecha y hora',
  hasError = false,
  disabled = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parsear la fecha y hora del string ISO parcial
  const dateStr = value?.slice(0, 10) ?? '';
  const timeStr = value?.slice(11, 16) ?? '';

  const fecha = dateStr ? parse(dateStr, 'yyyy-MM-dd', new Date()) : undefined;
  const fechaValida = fecha && isValid(fecha) ? fecha : undefined;

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const nuevaFecha = format(day, 'yyyy-MM-dd');
    const hora = timeStr || format(new Date(), 'HH:mm');
    onChange(`${nuevaFecha}T${hora}`);
    setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fecha = dateStr || format(new Date(), 'yyyy-MM-dd');
    onChange(`${fecha}T${e.target.value}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
            'transition-colors text-left',
            fechaValida ? 'text-foreground' : 'text-muted-foreground',
            hasError ? 'border-destructive' : 'border-input',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <CalendarIcon size={15} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {fechaValida
              ? `${format(fechaValida, "d 'de' MMMM 'de' yyyy", { locale: es })}${timeStr ? ` · ${timeStr}` : ''}`
              : placeholder}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={fechaValida}
          onSelect={handleDaySelect}
          locale={es}
          captionLayout="dropdown"
          startMonth={new Date(2000, 0, 1)}
          endMonth={new Date(new Date().getFullYear() + 1, 11, 31)}
          defaultMonth={fechaValida ?? new Date()}
        />
        {/* Selector de hora */}
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Hora:</span>
          <input
            type="time"
            value={timeStr || format(new Date(), 'HH:mm')}
            onChange={handleTimeChange}
            className={cn(
              'flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
              'transition-colors'
            )}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

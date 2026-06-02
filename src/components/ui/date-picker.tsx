'use client';

import * as React from 'react';
import { format, parse, isValid, isBefore, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "DD/MM/YYYY" para mostrar en el input */
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
}

/**
 * Auto-formatea mientras el usuario tipea.
 * Solo dígitos → inserta "/" en posición 2 y 5.
 * Ej: "2805" → "28/05", "280519" → "28/05/19"
 */
function autoformat(raw: string, prev: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) out += '/';
    out += digits[i];
  }
  // Si el usuario borró un "/" no añadir automáticamente
  if (raw.length < prev.length && (raw.endsWith('/') || raw === '')) {
    return raw.replace(/\D/g, '').slice(0, 8 - 1)
      .replace(/^(\d{2})(\d)/, '$1/$2')
      .replace(/^(\d{2}\/\d{2})(\d)/, '$1/$2');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE PICKER — texto libre DD/MM/YYYY + calendario, retorna "YYYY-MM-DD"
// ─────────────────────────────────────────────────────────────────────────────

interface DatePickerProps {
  value?: string;           // "YYYY-MM-DD"
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
  toDate?: Date;
  fromDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  hasError = false,
  disabled = false,
  toDate,
  fromDate,
}: DatePickerProps) {
  const [open, setOpen]           = React.useState(false);
  const [inputText, setInputText] = React.useState(() => isoToDisplay(value ?? ''));
  const [inputError, setInputError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sincronizar si el valor externo cambia (ej: reset del form)
  React.useEffect(() => {
    setInputText(isoToDisplay(value ?? ''));
    setInputError('');
  }, [value]);

  function validateAndEmit(display: string) {
    if (!display) {
      setInputError('');
      onChange(undefined);
      return;
    }
    if (display.length < 10) {
      setInputError('Fecha incompleta');
      return;
    }
    const d = parse(display, 'dd/MM/yyyy', new Date());
    if (!isValid(d)) {
      setInputError('Fecha inválida');
      return;
    }
    if (fromDate && isBefore(d, fromDate)) {
      setInputError(`Debe ser después del ${format(fromDate, 'dd/MM/yyyy')}`);
      return;
    }
    if (toDate && isAfter(d, toDate)) {
      setInputError(`Debe ser antes del ${format(toDate, 'dd/MM/yyyy')}`);
      return;
    }
    setInputError('');
    onChange(format(d, 'yyyy-MM-dd'));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoformat(e.target.value, inputText);
    setInputText(formatted);
    setInputError('');
    if (formatted.length === 10) validateAndEmit(formatted);
    if (formatted.length === 0)  onChange(undefined);
  }

  function handleBlur() {
    validateAndEmit(inputText);
  }

  function handleCalendarSelect(day: Date | undefined) {
    if (!day) return;
    const iso     = format(day, 'yyyy-MM-dd');
    const display = format(day, 'dd/MM/yyyy');
    setInputText(display);
    setInputError('');
    onChange(iso);
    setOpen(false);
  }

  const fechaSeleccionada = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const fechaValida       = fechaSeleccionada && isValid(fechaSeleccionada) ? fechaSeleccionada : undefined;
  const showError         = hasError || !!inputError;

  return (
    <div className="relative">
      <div className={cn(
        'flex items-center rounded-xl border bg-background transition-colors',
        'focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-primary',
        showError ? 'border-destructive' : 'border-input',
        disabled && 'opacity-50 pointer-events-none'
      )}>
        {/* Input de texto */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={inputText}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          className={cn(
            'flex-1 bg-transparent px-3 py-2.5 text-sm outline-none',
            'placeholder:text-muted-foreground',
          )}
        />

        {/* Botón calendario */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              tabIndex={-1}
              className={cn(
                'px-3 py-2.5 border-l border-input text-muted-foreground',
                'hover:text-foreground hover:bg-muted/40 transition-colors rounded-r-xl',
              )}
            >
              <CalendarIcon size={15} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={fechaValida}
              onSelect={handleCalendarSelect}
              locale={es}
              captionLayout="dropdown"
              disabled={[
                ...(toDate   ? [{ after:  toDate   }] : []),
                ...(fromDate ? [{ before: fromDate }] : []),
              ]}
              startMonth={fromDate ?? new Date(1990, 0, 1)}
              endMonth={toDate ?? new Date()}
              defaultMonth={fechaValida ?? new Date()}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mensaje de error inline */}
      {inputError && (
        <p className="text-xs text-destructive mt-1">{inputError}</p>
      )}
    </div>
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
  toDate?: Date;
  fromDate?: Date;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  hasError = false,
  disabled = false,
  toDate,
  fromDate,
}: DateTimePickerProps) {
  const [open, setOpen]           = React.useState(false);
  const [inputText, setInputText] = React.useState(() => isoToDisplay(value?.slice(0, 10) ?? ''));
  const [inputError, setInputError] = React.useState('');

  const dateStr = value?.slice(0, 10) ?? '';
  const timeStr = value?.slice(11, 16) ?? '';

  React.useEffect(() => {
    setInputText(isoToDisplay(dateStr));
    setInputError('');
  }, [dateStr]);

  function emitDateTime(isoDate: string, time: string) {
    onChange(`${isoDate}T${time || format(new Date(), 'HH:mm')}`);
  }

  function validateAndEmit(display: string) {
    if (!display) { setInputError(''); return; }
    if (display.length < 10) { setInputError('Fecha incompleta'); return; }
    const d = parse(display, 'dd/MM/yyyy', new Date());
    if (!isValid(d)) { setInputError('Fecha inválida'); return; }
    if (fromDate && isBefore(d, fromDate)) {
      setInputError(`Debe ser después del ${format(fromDate, 'dd/MM/yyyy')}`); return;
    }
    if (toDate && isAfter(d, toDate)) {
      setInputError(`Debe ser antes del ${format(toDate, 'dd/MM/yyyy')}`); return;
    }
    setInputError('');
    emitDateTime(format(d, 'yyyy-MM-dd'), timeStr);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoformat(e.target.value, inputText);
    setInputText(formatted);
    setInputError('');
    if (formatted.length === 10) validateAndEmit(formatted);
  }

  function handleCalendarSelect(day: Date | undefined) {
    if (!day) return;
    const iso = format(day, 'yyyy-MM-dd');
    setInputText(format(day, 'dd/MM/yyyy'));
    setInputError('');
    emitDateTime(iso, timeStr);
    setOpen(false);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = dateStr || format(new Date(), 'yyyy-MM-dd');
    onChange(`${iso}T${e.target.value}`);
  }

  const fechaValida = dateStr ? (() => {
    const d = parse(dateStr, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  })() : undefined;

  const showError = hasError || !!inputError;

  return (
    <div className="relative">
      <div className={cn(
        'flex items-center rounded-xl border bg-background transition-colors',
        'focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-primary',
        showError ? 'border-destructive' : 'border-input',
        disabled && 'opacity-50 pointer-events-none'
      )}>
        <input
          type="text"
          inputMode="numeric"
          value={inputText}
          onChange={handleChange}
          onBlur={() => validateAndEmit(inputText)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        {/* Hora */}
        <input
          type="time"
          value={timeStr || format(new Date(), 'HH:mm')}
          onChange={handleTimeChange}
          disabled={disabled}
          className="bg-transparent px-2 py-2.5 text-sm outline-none border-l border-input text-muted-foreground w-24"
        />

        {/* Botón calendario */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              tabIndex={-1}
              className="px-3 py-2.5 border-l border-input text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors rounded-r-xl"
            >
              <CalendarIcon size={15} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={fechaValida}
              onSelect={handleCalendarSelect}
              locale={es}
              captionLayout="dropdown"
              disabled={[
                ...(toDate   ? [{ after:  toDate   }] : []),
                ...(fromDate ? [{ before: fromDate }] : []),
              ]}
              startMonth={fromDate ?? new Date(2000, 0, 1)}
              endMonth={toDate ?? new Date(new Date().getFullYear() + 1, 11, 31)}
              defaultMonth={fechaValida ?? new Date()}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {inputError && (
        <p className="text-xs text-destructive mt-1">{inputError}</p>
      )}
    </div>
  );
}

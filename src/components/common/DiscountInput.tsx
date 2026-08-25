'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type Modo = 'monto' | 'porcentaje';

interface DescuentoInputProps {
  subtotal: number;
  value:    number;
  onChange: (montoC$: number) => void;
  className?: string;
}

export function DescuentoInput({ subtotal, value, onChange, className }: DescuentoInputProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const isEditing = useRef(false);
  const [modo, setModo] = useState<Modo>('monto');
  // rawDisplay drives the equivalencia label only — never calls parent while typing,
  // so the parent never re-renders mid-keystroke and focus is never lost.
  const [rawDisplay, setRawDisplay] = useState('');

  function toDisplay(v: number, m: Modo): string {
    if (v === 0) return '';
    if (m === 'monto') return String(Math.round(v));
    return subtotal > 0 ? String(Math.round((v / subtotal) * 100)) : '';
  }

  // Sync DOM when parent resets the value externally (e.g. cart cleared)
  useEffect(() => {
    if (!isEditing.current) {
      const d = toDisplay(value, modo);
      setRawDisplay(d);
      if (inputRef.current) inputRef.current.value = d;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleModeChange(newModo: Modo) {
    if (newModo === modo) return;
    setModo(newModo);
    const d = toDisplay(value, newModo);
    setRawDisplay(d);
    if (inputRef.current) inputRef.current.value = d;
  }

  function computeMonto(raw: string): number {
    const n = parseInt(raw, 10) || 0;
    if (modo === 'monto') return Math.max(0, Math.min(n, subtotal));
    const pct = Math.max(0, Math.min(n, 100));
    return Math.round((pct / 100) * subtotal);
  }

  const rawNum = parseInt(rawDisplay, 10) || 0;
  const equivalencia =
    modo === 'porcentaje' && subtotal > 0 && rawNum > 0
      ? `C$${Math.round((rawNum / 100) * subtotal).toLocaleString('es-NI')}`
      : modo === 'monto' && subtotal > 0 && rawNum > 0
      ? `${Math.round((rawNum / subtotal) * 100)}%`
      : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* C$ / % toggle */}
      <div className="flex rounded-lg border border-input overflow-hidden shrink-0 text-xs font-semibold">
        <button
          type="button"
          onClick={() => handleModeChange('monto')}
          className={cn(
            'px-2.5 py-1.5 transition-colors',
            modo === 'monto'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          C$
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('porcentaje')}
          className={cn(
            'px-2.5 py-1.5 transition-colors',
            modo === 'porcentaje'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          %
        </button>
      </div>

      {/* Numeric input — uncontrolled so React never resets cursor/selection */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        defaultValue=""
        onFocus={() => {
          isEditing.current = true;
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          // Keep the DOM correct if non-digits were typed (e.g. on desktop)
          if (digits !== e.target.value && inputRef.current) {
            inputRef.current.value = digits;
          }
          setRawDisplay(digits); // local re-render for equivalencia only — parent untouched
        }}
        onBlur={(e) => {
          isEditing.current = false;
          onChange(computeMonto(e.target.value));
        }}
        placeholder="0"
        className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-right"
      />

      {equivalencia && (
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          = {equivalencia}
        </span>
      )}
    </div>
  );
}

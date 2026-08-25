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
  const [modo,    setModo]    = useState<Modo>('monto');
  const [display, setDisplay] = useState('');
  const isEditing             = useRef(false);
  // Tracks the last C$ amount we sent to the parent. When the parent echoes
  // that same value back via props, we skip the DOM sync to avoid overwriting
  // the user's raw display (which prevents the % → C$ round-trip bug).
  const lastCommitted = useRef<number>(value);

  function toDisplay(v: number, m: Modo): string {
    if (v === 0) return '';
    if (m === 'monto') return String(Math.round(v));
    return subtotal > 0 ? String(Math.round((v / subtotal) * 100)) : '';
  }

  function computeMonto(raw: string, m: Modo = modo): number {
    const n = parseInt(raw, 10) || 0;
    if (m === 'monto') return Math.max(0, Math.min(n, subtotal));
    const pct = Math.max(0, Math.min(n, 100));
    return Math.round((pct / 100) * subtotal);
  }

  // Sync from parent only when value changes from outside (not from our own blur).
  useEffect(() => {
    if (!isEditing.current && value !== lastCommitted.current) {
      lastCommitted.current = value;
      setDisplay(toDisplay(value, modo));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleModeChange(newModo: Modo) {
    if (newModo === modo) return;
    // Convert the currently displayed raw value to the new mode
    const currentMonto = computeMonto(display, modo);
    setModo(newModo);
    setDisplay(toDisplay(currentMonto, newModo));
    lastCommitted.current = currentMonto;
  }

  const rawNum = parseInt(display, 10) || 0;
  const equivalencia =
    modo === 'porcentaje' && subtotal > 0 && rawNum > 0
      ? `C$${Math.round((rawNum / 100) * subtotal).toLocaleString('es-NI')}`
      : modo === 'monto' && subtotal > 0 && rawNum > 0
      ? `${Math.round((rawNum / subtotal) * 100)}%`
      : null;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
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

        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            setDisplay(digits);
          }}
          onFocus={(e) => {
            isEditing.current = true;
            e.currentTarget.select();
          }}
          onBlur={() => {
            isEditing.current = false;
            const monto = computeMonto(display);
            lastCommitted.current = monto;
            onChange(monto);
          }}
          placeholder="0"
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-right"
        />
      </div>

      {/* Equivalencia — own line so it never gets clipped */}
      {equivalencia && (
        <p className="text-xs text-muted-foreground tabular-nums text-right pr-1">
          = {equivalencia}
        </p>
      )}
    </div>
  );
}

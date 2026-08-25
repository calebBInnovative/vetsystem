'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type Modo = 'monto' | 'porcentaje';

interface DescuentoInputProps {
  subtotal: number;
  value:    number;
  onChange: (montoC$: number) => void;
  className?: string;
}

export function DescuentoInput({ subtotal, value, onChange, className }: DescuentoInputProps) {
  const [modo,     setModo]     = useState<Modo>('monto');
  const [rawInput, setRawInput] = useState(value === 0 ? '' : String(value));

  // Sync when the parent resets the value externally (e.g. cart cleared)
  useEffect(() => {
    if (modo === 'monto') {
      setRawInput(value === 0 ? '' : String(value));
    } else {
      const pct = subtotal > 0 ? Math.round((value / subtotal) * 100) : 0;
      setRawInput(pct === 0 ? '' : String(pct));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleModoChange(newModo: Modo) {
    if (newModo === modo) return;
    setModo(newModo);
    if (newModo === 'porcentaje') {
      const pct = subtotal > 0 ? Math.round((value / subtotal) * 100) : 0;
      setRawInput(pct === 0 ? '' : String(pct));
    } else {
      setRawInput(value === 0 ? '' : String(value));
    }
  }

  function handleChange(raw: string) {
    setRawInput(raw);
    const n = parseFloat(raw) || 0;
    if (modo === 'monto') {
      onChange(Math.max(0, Math.min(n, subtotal)));
    } else {
      const pct   = Math.max(0, Math.min(n, 100));
      const monto = Math.round((pct / 100) * subtotal);
      onChange(monto);
    }
  }

  const rawNum = parseFloat(rawInput) || 0;
  const equivalencia =
    modo === 'porcentaje' && subtotal > 0 && rawNum > 0
      ? `C$${Math.round((rawNum / 100) * subtotal).toLocaleString('es-NI')}`
      : modo === 'monto' && subtotal > 0 && rawNum > 0
      ? `${Math.round((rawNum / subtotal) * 100)}%`
      : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex rounded-lg border border-input overflow-hidden shrink-0 text-xs font-semibold">
        <button
          type="button"
          onClick={() => handleModoChange('monto')}
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
          onClick={() => handleModoChange('porcentaje')}
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
        inputMode="decimal"
        value={rawInput}
        onChange={(e) => handleChange(e.target.value)}
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

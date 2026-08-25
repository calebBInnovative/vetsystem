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
  // localRaw drives the equivalencia display — state updates here don't reset the
  // uncontrolled input's DOM value, so cursor/selection is never interrupted.
  const [localRaw, setLocalRaw] = useState(() => value === 0 ? '' : String(value));

  function toDisplay(v: number, m: Modo): string {
    if (m === 'monto') return v === 0 ? '' : String(v);
    const pct = subtotal > 0 ? Math.round((v / subtotal) * 100) : 0;
    return pct === 0 ? '' : String(pct);
  }

  // Sync when the parent resets value externally (e.g. cart cleared)
  useEffect(() => {
    if (!isEditing.current) {
      const display = toDisplay(value, modo);
      setLocalRaw(display);
      if (inputRef.current) inputRef.current.value = display;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleModeChange(newModo: Modo) {
    if (newModo === modo) return;
    setModo(newModo);
    const display = toDisplay(value, newModo);
    setLocalRaw(display);
    if (inputRef.current) inputRef.current.value = display;
  }

  function commit(raw: string) {
    const n = parseFloat(raw) || 0;
    if (modo === 'monto') {
      onChange(Math.max(0, Math.min(n, subtotal)));
    } else {
      const pct = Math.max(0, Math.min(n, 100));
      onChange(Math.round((pct / 100) * subtotal));
    }
  }

  const rawNum = parseFloat(localRaw) || 0;
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
        ref={inputRef}
        type="text"
        inputMode="decimal"
        defaultValue={value === 0 ? '' : String(value)}
        onFocus={() => {
          isEditing.current = true;
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        onChange={(e) => {
          setLocalRaw(e.target.value);   // update equivalencia display (no DOM reset — uncontrolled)
          commit(e.target.value);         // live total update in parent
        }}
        onBlur={(e) => {
          isEditing.current = false;
          commit(e.target.value);
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

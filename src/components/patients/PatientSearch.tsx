'use client';

import { useState, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuscadorPacientesProps {
  onBuscar: (termino: string) => void;
  placeholder?: string;
  className?: string;
}

export function BuscadorPacientes({
  onBuscar,
  placeholder = 'Buscar por nombre, dueño, especie o raza...',
  className,
}: BuscadorPacientesProps) {
  const [valor, setValor] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCambio = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValor(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onBuscar(v), 280);
    },
    [onBuscar]
  );

  const limpiar = () => {
    setValor('');
    onBuscar('');
  };

  return (
    <div className={cn('relative', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        size={17}
      />
      <input
        type="text"
        value={valor}
        onChange={handleCambio}
        placeholder={placeholder}
        className={cn(
          'w-full bg-card border border-input rounded-xl',
          'pl-10 pr-10 py-2.5 text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
          'transition-colors'
        )}
      />
      {valor && (
        <button
          type="button"
          onClick={limpiar}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Limpiar búsqueda"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

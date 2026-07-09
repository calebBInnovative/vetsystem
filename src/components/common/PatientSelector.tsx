'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';
import { PET_SPECIES, type PatientLocal, type PetSpecies } from '@/types/patient';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PacienteSelectorProps {
  value?: string;                          // pacienteId seleccionado
  onChange: (pacienteId: string) => void;
  hasError?: boolean;
  placeholder?: string;
}

export function PacienteSelector({
  value,
  onChange,
  hasError = false,
  placeholder = 'Buscar paciente por nombre o dueño...',
}: PacienteSelectorProps) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto]   = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Patient actualmente seleccionado
  const pacienteSeleccionado = useLiveQuery<PatientLocal | undefined>(
    async () => (value ? db.patients.get(value) : undefined),
    [value]
  );

  // Resultados de búsqueda
  const resultados = useLiveQuery(async () => {
    const termino = busqueda.toLowerCase().trim();
    if (!termino) return [];

    const [todosPacientes, todosDuenos] = await Promise.all([
      db.patients.filter((p) => !p.deletedAt && p.activo).toArray(),
      db.owners.toArray(),
    ]);
    const duenosMap = new Map(todosDuenos.map((d) => [d.id, d]));

    return todosPacientes
      .filter((p) => {
        const d = duenosMap.get(p.duenoId);
        return (
          p.nombre.toLowerCase().includes(termino) ||
          (d?.nombre.toLowerCase().includes(termino) ?? false) ||
          (d?.telefono.includes(termino) ?? false)
        );
      })
      .slice(0, 8)
      .map((p) => ({ ...p, dueno: duenosMap.get(p.duenoId) }));
  }, [busqueda]);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const seleccionar = (id: string) => {
    onChange(id);
    setBusqueda('');
    setAbierto(false);
  };

  const limpiar = () => {
    onChange('');
    setBusqueda('');
  };

  // Si hay paciente seleccionado, mostrar su chip
  if (value && pacienteSeleccionado) {
    const especie = PET_SPECIES[pacienteSeleccionado.especie as PetSpecies];
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm',
        hasError ? 'border-destructive' : 'border-input'
      )}>
        <span className="text-lg leading-none">{especie.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{pacienteSeleccionado.nombre}</p>
          <p className="text-xs text-muted-foreground truncate">{especie.label}</p>
        </div>
        <button
          type="button"
          onClick={limpiar}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Cambiar paciente"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={15} />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border bg-background pl-9 pr-4 py-2.5 text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary',
            'transition-colors',
            hasError ? 'border-destructive' : 'border-input'
          )}
        />
      </div>

      {abierto && resultados && resultados.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
          {resultados.map((p) => {
            const especie = PET_SPECIES[p.especie];
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => seleccionar(p.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-left"
              >
                <span className="text-xl leading-none shrink-0">{especie.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {especie.label}{p.raza && ` · ${p.raza}`}
                    {p.dueno && ` · ${p.dueno.nombre}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {abierto && busqueda.length > 0 && resultados?.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground">
          Sin resultados para &ldquo;{busqueda}&rdquo;
        </div>
      )}
    </div>
  );
}

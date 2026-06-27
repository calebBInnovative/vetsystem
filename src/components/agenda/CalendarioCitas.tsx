'use client';

import { useEffect, useState } from 'react';
import { useCitasMes } from '@/hooks/useAgenda';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DIAS_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construye el array de días del mes con offsets de inicio (null = celda vacía) */
function buildGrid(year: number, month: number): (number | null)[] {
  const firstDow  = new Date(year, month, 1).getDay(); // 0=Dom
  const offset    = (firstDow + 6) % 7;                // convertir a lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function badgeCn(count: number) {
  if (count === 0) return '';
  if (count === 1) return 'bg-primary';
  if (count <= 3) return 'bg-amber-500';
  return 'bg-red-500';
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  /** Fecha seleccionada actualmente "YYYY-MM-DD" */
  fecha: string;
  onFechaChange: (fecha: string) => void;
}

export function CalendarioCitas({ fecha, onFechaChange }: Props) {
  const hoy = new Date().toISOString().slice(0, 10);

  // Mes visible — sincronizado con la fecha seleccionada
  const [mesVista, setMesVista] = useState(() => {
    const d = new Date(fecha + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Sincronizar mes cuando cambia la fecha externamente
  useEffect(() => {
    const d = new Date(fecha + 'T00:00:00');
    setMesVista({ year: d.getFullYear(), month: d.getMonth() });
  }, [fecha]);

  const { year, month } = mesVista;
  const conteos = useCitasMes(year, month);
  const grid    = buildGrid(year, month);

  function cambiarMes(delta: number) {
    setMesVista((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 select-none">
      {/* Cabecera del mes */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => cambiarMes(-1)}
          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={15} />
        </button>

        <button
          onClick={() => onFechaChange(hoy)}
          className="text-sm font-semibold hover:text-primary transition-colors"
          title="Ir a hoy"
        >
          {MESES[month]} {year}
        </button>

        <button
          onClick={() => cambiarMes(1)}
          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Cabecera de días */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_CORTOS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Cuadrícula de días */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }

          const iso      = toIso(year, month, day);
          const esHoy    = iso === hoy;
          const seleccion= iso === fecha;
          const count    = conteos.get(iso) ?? 0;
          const esPasado = iso < hoy;

          return (
            <button
              key={iso}
              onClick={() => onFechaChange(iso)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg py-1 text-sm transition-colors group',
                seleccion
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : esHoy
                  ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30'
                  : esPasado
                  ? 'text-muted-foreground/50 hover:bg-muted/40'
                  : 'hover:bg-muted/50'
              )}
            >
              <span className="leading-none">{day}</span>

              {/* Badge de conteo */}
              {count > 0 && (
                <span
                  className={cn(
                    'mt-0.5 h-1 rounded-full transition-all',
                    seleccion ? 'bg-primary-foreground/70' : badgeCn(count),
                    count === 1 ? 'w-1' : count <= 3 ? 'w-3' : 'w-4'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-primary inline-block" /> 1 cita
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-3 rounded-full bg-amber-500 inline-block" /> 2–3 citas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-4 rounded-full bg-red-500 inline-block" /> 4+
        </span>
      </div>
    </div>
  );
}

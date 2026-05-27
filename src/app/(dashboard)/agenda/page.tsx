'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgendaDia } from '@/components/agenda/AgendaDia';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AgendaPage() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);

  const fechaObj = parseISO(fecha);
  const esHoy    = isToday(fechaObj);

  const irADia = (dias: number) => {
    const nueva = dias > 0 ? addDays(fechaObj, dias) : subDays(fechaObj, Math.abs(dias));
    setFecha(nueva.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {esHoy
              ? 'Hoy, ' + format(fechaObj, "EEEE d 'de' MMMM", { locale: es })
              : format(fechaObj, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>

        <Link href={`/agenda/nueva?fecha=${fecha}`}>
          <Button className="gap-2 w-full sm:w-auto">
            <Plus size={17} />
            Nueva Cita
          </Button>
        </Link>
      </div>

      {/* ── Navegación de fecha ────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => irADia(-1)} className="h-9 w-9">
          <ChevronLeft size={16} />
        </Button>

        <div className="flex-1 max-w-xs">
          <DatePicker
            value={fecha}
            onChange={(v) => v && setFecha(v)}
            placeholder="Selecciona un día"
            toDate={new Date(new Date().getFullYear() + 2, 11, 31)}
            fromDate={new Date(2020, 0, 1)}
          />
        </div>

        <Button variant="outline" size="icon" onClick={() => irADia(1)} className="h-9 w-9">
          <ChevronRight size={16} />
        </Button>

        {!esHoy && (
          <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)} className="text-xs">
            Hoy
          </Button>
        )}
      </div>

      {/* ── Citas del día ─────────────────────────────── */}
      <AgendaDia fecha={fecha} />

    </div>
  );
}

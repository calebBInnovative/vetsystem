'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AgendaDia } from '@/components/agenda/AgendaDia';
import { CalendarioCitas } from '@/components/agenda/CalendarioCitas';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

function AgendaContent() {
  const searchParams = useSearchParams();
  const hoy          = new Date().toISOString().slice(0, 10);
  const fechaInicial = searchParams.get('fecha') ?? hoy;

  const [fecha, setFecha] = useState(fechaInicial);

  const fechaObj = parseISO(fecha);
  const esHoy    = isToday(fechaObj);

  const irADia = (dias: number) => {
    const nueva = dias > 0 ? addDays(fechaObj, dias) : subDays(fechaObj, Math.abs(dias));
    setFecha(nueva.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {esHoy
              ? 'Hoy, ' + format(fechaObj, "EEEE d 'de' MMMM", { locale: es })
              : format(fechaObj, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
        <Link href={`/agenda/nueva?fecha=${fecha}`}>
          <Button className="gap-2">
            <Plus size={16} /> Nueva cita
          </Button>
        </Link>
      </div>

      {/* Layout: calendario + vista del día */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Calendario mensual ─────────────────────────── */}
        <div className="w-full lg:w-64 shrink-0">
          <CalendarioCitas fecha={fecha} onFechaChange={setFecha} />
        </div>

        {/* ── Vista del día seleccionado ─────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Navegación de día */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => irADia(-1)}
              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="flex-1 text-center">
              <p className="font-semibold text-sm capitalize">
                {format(fechaObj, "EEEE d 'de' MMMM", { locale: es })}
              </p>
              {esHoy && (
                <p className="text-xs text-primary font-medium">Hoy</p>
              )}
            </div>

            <button
              onClick={() => irADia(1)}
              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ChevronRight size={15} />
            </button>

            {!esHoy && (
              <button
                onClick={() => setFecha(hoy)}
                className="text-xs px-3 py-1.5 rounded-xl border border-border hover:bg-muted/40 transition-colors text-muted-foreground"
              >
                Hoy
              </button>
            )}
          </div>

          {/* Citas del día */}
          <AgendaDia fecha={fecha} />
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  return (
    <Suspense>
      <AgendaContent />
    </Suspense>
  );
}

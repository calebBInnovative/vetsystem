'use client';

import Link from 'next/link';
import { useCitasDelDia } from '@/hooks/useAgenda';
import { CitaCard } from './CitaCard';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, CalendarDays } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface AgendaDiaProps {
  fecha: string; // "YYYY-MM-DD"
}

export function AgendaDia({ fecha }: AgendaDiaProps) {
  const { citas, cargando } = useCitasDelDia(fecha);
  const fechaObj  = parseISO(fecha);
  const esHoy     = isToday(fechaObj);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (citas.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
          <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="font-semibold text-lg">
          {esHoy ? 'Sin citas para hoy' : 'Sin citas para este día'}
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {format(fechaObj, "EEEE d 'de' MMMM", { locale: es })} está libre
        </p>
        <div className="pt-2">
          <Link href={`/agenda/nueva?fecha=${fecha}`}>
            <Button size="lg" className="gap-2">
              <Plus size={17} />
              Agendar cita
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Separar en activas y finalizadas/canceladas
  const activas    = citas.filter((c) => !['completada', 'cancelada', 'no_asistio'].includes(c.estado));
  const finalizadas = citas.filter((c) => ['completada', 'cancelada', 'no_asistio'].includes(c.estado));

  return (
    <div className="space-y-6">

      {/* Resumen del día */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {citas.length} cita{citas.length !== 1 ? 's' : ''}
        </span>
        <span>·</span>
        <span>{activas.length} pendiente{activas.length !== 1 ? 's' : ''}</span>
        {finalizadas.length > 0 && (
          <><span>·</span><span>{finalizadas.length} finalizada{finalizadas.length !== 1 ? 's' : ''}</span></>
        )}
      </div>

      {/* Citas activas */}
      {activas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activas.map((c) => (
            <CitaCard key={c.id} cita={c} />
          ))}
        </div>
      )}

      {/* Citas finalizadas */}
      {finalizadas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Finalizadas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {finalizadas.map((c) => (
              <CitaCard key={c.id} cita={c} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

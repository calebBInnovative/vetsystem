'use client';

import Link from 'next/link';
import { useProximasCitasDia } from '@/hooks/useDashboard';
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from '@/types/appointment';
import { PET_SPECIES } from '@/types/patient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CalendarDays, ArrowRight } from 'lucide-react';

export function ProximasCitasDia() {
  const { appointments, loading } = useProximasCitasDia();

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Citas de hoy</h2>
        <Link href="/agenda">
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
            Ver agenda <ArrowRight size={13} />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <CalendarDays className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No quedan appointments pendientes hoy</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((cita) => {
            const estado  = APPOINTMENT_STATUSES[cita.estado];
            const tipo    = APPOINTMENT_TYPES[cita.tipo];
            const especie = cita.especiePaciente
              ? PET_SPECIES[cita.especiePaciente as keyof typeof PET_SPECIES]
              : null;

            return (
              <Link
                key={cita.id}
                href="/agenda"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
              >
                {/* Hora */}
                <div className="text-center shrink-0 w-12">
                  <p className="text-sm font-bold leading-none">{cita.horaInicio}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tipo.emoji}</p>
                </div>

                {/* Patient */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {especie && <span className="text-base leading-none">{especie.emoji}</span>}
                    <p className="font-medium truncate text-sm group-hover:text-primary transition-colors">
                      {cita.nombrePaciente}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{cita.motivo}</p>
                </div>

                {/* Estado */}
                <Badge variant="outline" className={cn('text-xs shrink-0', estado.color)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full mr-1 inline-block', estado.punto)} />
                  {estado.label}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

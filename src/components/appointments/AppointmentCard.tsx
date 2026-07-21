'use client';

import Link from 'next/link';
import { type AppointmentWithPatient, APPOINTMENT_STATUSES, APPOINTMENT_TYPES, type AppointmentStatus } from '@/types/appointment';
import { PET_SPECIES } from '@/types/patient';
import { cambiarEstadoCita, eliminarCita } from '@/hooks/useAppointments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Phone, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface CitaCardProps {
  cita: AppointmentWithPatient;
}

// Transiciones de estado permitidas desde cada estado
const TRANSICIONES: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

export function CitaCard({ cita }: CitaCardProps) {
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const estado     = APPOINTMENT_STATUSES[cita.status];
  const tipo       = APPOINTMENT_TYPES[cita.type];
  const especie    = cita.patientSpecies ? PET_SPECIES[cita.patientSpecies as keyof typeof PET_SPECIES] : null;
  const siguientes = TRANSICIONES[cita.status];

  const horaFin = calcularHoraFin(cita.startTime, cita.durationMinutes);

  const handleCambioEstado = async (nuevoEstado: AppointmentStatus) => {
    setCambiandoEstado(true);
    try {
      await cambiarEstadoCita(cita.id, nuevoEstado);
      toast.success(`Appointment ${APPOINTMENT_STATUSES[nuevoEstado].label.toLowerCase()}`);
    } catch {
      toast.error('No se pudo actualizar el estado');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleEliminar = async () => {
    try {
      await eliminarCita(cita.id);
      toast.success('Appointment eliminada');
    } catch {
      toast.error('No se pudo eliminar la cita');
    }
  };

  return (
    <div className={cn(
      'bg-card rounded-2xl border overflow-hidden transition-shadow hover:shadow-md',
      cita.status === 'cancelled' || cita.status === 'no_show'
        ? 'opacity-60 border-border'
        : 'border-border'
    )}>
      {/* Barra de color según estado */}
      <div className={cn('h-1', {
        'bg-amber-400':  cita.status === 'pending',
        'bg-blue-500':   cita.status === 'confirmed',
        'bg-purple-500': cita.status === 'in_progress',
        'bg-green-500':  cita.status === 'completed',
        'bg-red-400':    cita.status === 'cancelled',
        'bg-muted':      cita.status === 'no_show',
      })} />

      <div className="p-4 space-y-3">

        {/* Header: hora + estado */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock size={14} className="text-muted-foreground" />
            <span>{cita.startTime}</span>
            <span className="text-muted-foreground font-normal">→ {horaFin}</span>
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ({cita.durationMinutes} min)
            </span>
          </div>
          <Badge variant="outline" className={cn('text-xs shrink-0', estado.color)}>
            <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5 inline-block', estado.punto)} />
            {estado.label}
          </Badge>
        </div>

        {/* Patient + tipo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
            {especie?.emoji ?? '🐾'}
          </div>
          <div className="flex-1 min-w-0">
            <Link
              href={`/patients/${cita.patientId}`}
              className="font-semibold hover:text-primary transition-colors truncate block"
            >
              {cita.patientName ?? 'Patient'}
            </Link>
            <p className="text-xs text-muted-foreground truncate">
              {tipo.emoji} {tipo.label}
              {especie && ` · ${especie.label}`}
            </p>
          </div>
        </div>

        {/* Motivo */}
        <p className="text-sm text-muted-foreground line-clamp-2">{cita.reason}</p>

        {/* Dueño */}
        {cita.ownerName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone size={11} className="shrink-0" />
            <span className="font-medium">{cita.ownerName}</span>
            {cita.ownerPhone && (
              <><span className="text-border">·</span><span>{cita.ownerPhone}</span></>
            )}
          </div>
        )}

        {/* Acciones de estado */}
        {siguientes.length > 0 && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            {siguientes.map((sig) => (
              <button
                key={sig}
                type="button"
                disabled={cambiandoEstado}
                onClick={() => handleCambioEstado(sig)}
                className={cn(
                  'flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  APPOINTMENT_STATUSES[sig].color
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full inline-block mr-1', APPOINTMENT_STATUSES[sig].punto)} />
                {APPOINTMENT_STATUSES[sig].label}
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleEliminar}
              title="Eliminar cita"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function calcularHoraFin(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutos = h * 60 + m + durationMinutes;
  const hFin = Math.floor(totalMinutos / 60) % 24;
  const mFin = totalMinutos % 60;
  return `${String(hFin).padStart(2, '0')}:${String(mFin).padStart(2, '0')}`;
}

'use client';

import Link from 'next/link';
import { usePatientHistory } from '@/hooks/useHistory';
import { ConsultaCard } from './ConsultationCard';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';

interface HistorialTimelineProps {
  pacienteId: string;
  nombrePaciente?: string;
}

export function HistorialTimeline({ pacienteId, nombrePaciente }: HistorialTimelineProps) {
  const { consultations, loading } = usePatientHistory(pacienteId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (consultations.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="font-semibold text-lg">Sin historial clínico</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {nombrePaciente
            ? `${nombrePaciente} no tiene consultations registradas aún.`
            : 'No hay consultations registradas para este paciente.'}
        </p>
        <div className="pt-2">
          <Link href={`/patients/${pacienteId}/history/new`}>
            <Button size="lg" className="gap-2">
              <Plus size={17} />
              Registrar primera consulta
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Agrupar consultations por año
  const porAño = consultations.reduce<Record<string, typeof consultations>>((acc, c) => {
    const año = format(new Date(c.fecha), 'yyyy');
    if (!acc[año]) acc[año] = [];
    acc[año].push(c);
    return acc;
  }, {});

  const años = Object.keys(porAño).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-8">
      {años.map((año) => (
        <div key={año}>
          {/* Separador de año */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-bold text-muted-foreground">{año}</span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              {porAño[año].length} consulta{porAño[año].length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Timeline visual */}
          <div className="relative pl-5">
            {/* Línea vertical */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-4">
              {porAño[año].map((consulta) => (
                <div key={consulta.id} className="relative">
                  {/* Punto de la línea de tiempo */}
                  <div className="absolute -left-5 top-5 w-3 h-3 rounded-full border-2 border-primary bg-background" />
                  <ConsultaCard consulta={consulta} pacienteId={pacienteId} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

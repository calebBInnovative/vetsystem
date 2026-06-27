'use client';

import Link from 'next/link';
import { use } from 'react';
import { usePaciente } from '@/hooks/usePacientes';
import { HistorialTimeline } from '@/components/historial/HistorialTimeline';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';

export function HistorialView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { paciente } = usePaciente(id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/pacientes/${id}`}>
            <Button variant="ghost" size="icon" className="-ml-2">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Historial Clínico</h1>
            {paciente && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {paciente.nombre}
              </p>
            )}
          </div>
        </div>

        <Link href={`/pacientes/${id}/historial/nueva`}>
          <Button className="gap-2">
            <Plus size={17} />
            <span className="hidden sm:inline">Nueva Consulta</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </Link>
      </div>

      <HistorialTimeline
        pacienteId={id}
        nombrePaciente={paciente?.nombre}
      />

    </div>
  );
}

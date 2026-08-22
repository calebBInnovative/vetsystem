'use client';

import Link from 'next/link';
import { useRouteId } from '@/hooks/useRouteId';
import { usePatient } from '@/hooks/usePatients';
import { HistorialTimeline } from '@/components/history/HistoryTimeline';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, ClipboardList } from 'lucide-react';
import { PET_SPECIES } from '@/types/patient';

export function HistoryView() {
  const id     = useRouteId(2); // /patients/[id]/history → patient ID is at -2
  const { paciente } = usePatient(id ?? '');

  const especie = paciente ? PET_SPECIES[paciente.species] : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Navigation bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <Link href={`/patients/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5">
            <ArrowLeft size={15} /> Ficha del paciente
          </Button>
        </Link>

        <Link href={`/patients/${id}/history/new`}>
          <Button size="sm" className="gap-1.5">
            <Plus size={15} />
            <span className="hidden sm:inline">Nueva consulta</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </Link>
      </div>

      {/* ── Patient banner ───────────────────────────────────────── */}
      {paciente && especie ? (
        <div className="flex items-center gap-4 bg-card rounded-2xl border border-border px-5 py-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl shrink-0">
            {especie.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">{paciente.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {especie.label}
              {paciente.breed && <> · {paciente.breed}</>}
              {paciente.sex && <> · {paciente.sex === 'male' ? '♂ Macho' : '♀ Hembra'}</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1.5 rounded-xl">
            <ClipboardList size={13} />
            Historial clínico
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-muted animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-muted animate-pulse rounded-lg w-40" />
            <div className="h-3.5 bg-muted animate-pulse rounded-lg w-24" />
          </div>
        </div>
      )}

      <HistorialTimeline
        pacienteId={id ?? ''}
        nombrePaciente={paciente?.name}
      />

    </div>
  );
}

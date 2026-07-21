'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startConsultation } from '@/hooks/useConsultations';
import { PacienteSelector } from '@/components/common/PatientSelector';
import { CONSULTATION_TYPES } from '@/types/consultation';
import type { ConsultationType } from '@/types/consultation';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────

function NewConsultationContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const appointmentIdParam = searchParams.get('appointmentId') ?? searchParams.get('citaId') ?? undefined;
  const patientIdParam     = searchParams.get('patientId') ?? searchParams.get('pacienteId') ?? undefined;

  const [patientId, setPatientId] = useState(patientIdParam ?? '');
  const [type, setType]           = useState<ConsultationType>('general_consultation');
  const [reason, setReason]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleIniciar() {
    if (!patientId) { setError('Selecciona un paciente'); return; }
    setLoading(true);
    setError('');
    try {
      const id = await startConsultation({ patientId, appointmentId: appointmentIdParam, type, reason: reason || undefined });
      router.push(`/consultations/${id}`);
    } catch (e) {
      setError((e as Error).message ?? 'Error al iniciar la consulta');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Nueva consulta</h1>
          <p className="text-sm text-muted-foreground">
            {appointmentIdParam ? 'Desde cita agendada' : 'Walk-in / Sin cita previa'}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">

        {/* Patient */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Patient *</label>
          <PacienteSelector
            value={patientId || undefined}
            onChange={setPatientId}
          />
          {error && !patientId && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Tipo */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tipo de atención</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(CONSULTATION_TYPES) as [string, { label: string; emoji: string }][]).map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key as ConsultationType)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                  type === key
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="text-lg">{info.emoji}</span>
                <span className="line-clamp-1 text-center leading-tight">{info.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Motivo rápido */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Motivo inicial <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ej: Revisión de rutina, vómitos desde ayer..."
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {error && patientId && <p className="text-xs text-destructive">{error}</p>}

        <Button
          onClick={handleIniciar}
          disabled={loading || !patientId}
          className="w-full h-11 text-base gap-2"
        >
          {loading
            ? <Loader2 size={16} className="animate-spin" />
            : <Zap size={16} />
          }
          Iniciar atención
        </Button>
      </div>
    </div>
  );
}

export default function NewConsultationPage() {
  return (
    <Suspense>
      <NewConsultationContent />
    </Suspense>
  );
}

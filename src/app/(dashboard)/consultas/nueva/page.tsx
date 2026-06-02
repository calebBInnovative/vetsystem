'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { iniciarConsulta } from '@/hooks/useConsultas';
import { PacienteSelector } from '@/components/common/PacienteSelector';
import { TIPOS_CONSULTA } from '@/types/consulta';
import type { TipoConsulta } from '@/types/consulta';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────

function NuevaConsultaContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const citaIdParam      = searchParams.get('citaId') ?? undefined;
  const pacienteIdParam  = searchParams.get('pacienteId') ?? undefined;

  const [pacienteId, setPacienteId] = useState(pacienteIdParam ?? '');
  const [tipo, setTipo]             = useState<TipoConsulta>('consulta_general');
  const [motivo, setMotivo]         = useState('');
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState('');

  async function handleIniciar() {
    if (!pacienteId) { setError('Selecciona un paciente'); return; }
    setCargando(true);
    setError('');
    try {
      const id = await iniciarConsulta({ pacienteId, citaId: citaIdParam, tipo, motivo: motivo || undefined });
      router.push(`/consultas/${id}`);
    } catch (e) {
      setError((e as Error).message ?? 'Error al iniciar la consulta');
      setCargando(false);
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
            {citaIdParam ? 'Desde cita agendada' : 'Walk-in / Sin cita previa'}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-5">

        {/* Paciente */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Paciente *</label>
          <PacienteSelector
            value={pacienteId || undefined}
            onChange={setPacienteId}
          />
          {error && !pacienteId && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Tipo */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tipo de atención</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(TIPOS_CONSULTA) as [string, { label: string; emoji: string }][]).map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTipo(key as TipoConsulta)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                  tipo === key
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
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ej: Revisión de rutina, vómitos desde ayer..."
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {error && pacienteId && <p className="text-xs text-destructive">{error}</p>}

        <Button
          onClick={handleIniciar}
          disabled={cargando || !pacienteId}
          className="w-full h-11 text-base gap-2"
        >
          {cargando
            ? <Loader2 size={16} className="animate-spin" />
            : <Zap size={16} />
          }
          Iniciar atención
        </Button>
      </div>
    </div>
  );
}

export default function NuevaConsultaPage() {
  return (
    <Suspense>
      <NuevaConsultaContent />
    </Suspense>
  );
}

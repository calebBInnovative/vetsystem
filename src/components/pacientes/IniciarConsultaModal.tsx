'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { iniciarConsulta } from '@/hooks/useConsultas';
import { TIPOS_CONSULTA, type TipoConsulta } from '@/types/consulta';
import { ESPECIES } from '@/types/paciente';
import type { PacienteConDueno } from '@/types/paciente';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  paciente: PacienteConDueno;
}

export function IniciarConsultaModal({ open, onClose, paciente }: Props) {
  const router    = useRouter();
  const [tipo,    setTipo]    = useState<TipoConsulta>('consulta_general');
  const [motivo,  setMotivo]  = useState('');
  const [cargando,setCargando]= useState(false);
  const [error,   setError]   = useState('');
  const especie = ESPECIES[paciente.especie];

  async function handleIniciar() {
    setCargando(true);
    setError('');
    try {
      const id = await iniciarConsulta({
        pacienteId: paciente.id,
        tipo,
        motivo: motivo.trim() || undefined,
      });
      router.push(`/consultas/${id}`);
    } catch (e) {
      setError((e as Error).message ?? 'Error al iniciar la consulta');
      setCargando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Iniciar consulta</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Paciente — solo lectura */}
          <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-3">
            <span className="text-2xl">{especie.emoji}</span>
            <div>
              <p className="font-semibold text-sm">{paciente.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {especie.label}{paciente.raza && ` · ${paciente.raza}`}
                {paciente.dueno && ` · ${paciente.dueno.nombre}`}
              </p>
            </div>
          </div>

          {/* Tipo de atención */}
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
                  <span className="line-clamp-1 text-center leading-tight">
                    {info.label.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Motivo{' '}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: Revisión de rutina, vómitos desde ayer…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={cargando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleIniciar} disabled={cargando}>
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <span>⚡</span>}
            Iniciar atención
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

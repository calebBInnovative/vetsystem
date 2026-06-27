'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, CheckCircle2, CalendarDays } from 'lucide-react';
import { crearCita } from '@/hooks/useAgenda';
import { TIPOS_CITA, DURACIONES, type TipoCita } from '@/types/agenda';
import { ESPECIES } from '@/types/paciente';
import type { PacienteConDueno } from '@/types/paciente';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  paciente: PacienteConDueno;
}

const HORAS_RAPIDAS = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'] as const;

export function AgendarCitaModal({ open, onClose, paciente }: Props) {
  const router  = useRouter();
  const hoyStr  = new Date().toISOString().slice(0, 10);

  const [fecha,      setFecha]      = useState(hoyStr);
  const [hora,       setHora]       = useState('09:00');
  const [tipo,       setTipo]       = useState<TipoCita>('consulta');
  const [duracion,   setDuracion]   = useState(30);
  const [motivo,     setMotivo]     = useState('');
  const [cargando,   setCargando]   = useState(false);
  const [guardada,   setGuardada]   = useState(false);
  const [error,      setError]      = useState('');
  const especie = ESPECIES[paciente.especie];

  async function handleAgendar() {
    if (!fecha) { setError('Selecciona la fecha'); return; }
    setCargando(true);
    setError('');
    try {
      await crearCita({
        pacienteId:      paciente.id,
        fecha,
        horaInicio:      hora,
        duracionMinutos: duracion,
        tipo,
        motivo:          motivo.trim() || 'Cita agendada',
      });
      setGuardada(true);
    } catch (e) {
      setError((e as Error).message ?? 'Error al agendar la cita');
    } finally {
      setCargando(false);
    }
  }

  function handleCerrar() {
    setGuardada(false);
    setFecha(hoyStr);
    setHora('09:00');
    setTipo('consulta');
    setDuracion(30);
    setMotivo('');
    setError('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCerrar()}>
      <DialogContent className="max-w-md gap-0 p-0 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Agendar cita</DialogTitle>
        </DialogHeader>

        {guardada ? (
          /* ── Confirmación ── */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="font-semibold text-lg">¡Cita agendada!</p>
            <p className="text-sm text-muted-foreground">
              {paciente.nombre} · {fecha.split('-').reverse().join('/')} a las {hora}
            </p>
            <div className="flex gap-2 mt-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleCerrar}>
                Cerrar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => { handleCerrar(); router.push(`/agenda?fecha=${fecha}`); }}
              >
                <CalendarDays size={14} />
                Ver en agenda
              </Button>
            </div>
          </div>
        ) : (
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

            {/* Fecha + Hora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fecha *</label>
                <DatePicker
                  value={fecha}
                  onChange={(v) => setFecha(v ?? hoyStr)}
                  fromDate={new Date()}
                  placeholder="DD/MM/AAAA"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora *</label>
                <input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Accesos rápidos de hora */}
            <div className="flex flex-wrap gap-1.5">
              {HORAS_RAPIDAS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(h)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                    hora === h
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de cita</label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(TIPOS_CITA) as [TipoCita, { label: string; emoji: string }][]).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTipo(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-2 text-xs transition-colors',
                      tipo === key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    )}
                  >
                    <span className="text-base">{info.emoji}</span>
                    <span className="line-clamp-1 text-center leading-tight text-[10px]">
                      {info.label.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duración */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Duración</label>
              <div className="flex flex-wrap gap-2">
                {DURACIONES.slice(0, 5).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuracion(value)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      duracion === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    {label}
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
                placeholder="Ej: Control post-operatorio, vacuna anual…"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pb-1">
              <Button variant="outline" className="flex-1" onClick={handleCerrar} disabled={cargando}>
                Cancelar
              </Button>
              <Button className="flex-1 gap-2" onClick={handleAgendar} disabled={cargando || !fecha}>
                {cargando && <Loader2 size={14} className="animate-spin" />}
                Agendar cita
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

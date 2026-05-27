'use client';

import { useState } from 'react';
import Link from 'next/link';
import { type ConsultaLocal, TIPOS_CONSULTA } from '@/types/historial';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Thermometer, Weight, Pill, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConsultaCardProps {
  consulta: ConsultaLocal;
  /** Si se muestra dentro de la ficha del paciente, el link editar apunta aquí */
  pacienteId: string;
}

export function ConsultaCard({ consulta, pacienteId }: ConsultaCardProps) {
  const [expandida, setExpandida] = useState(false);
  const tipo = TIPOS_CONSULTA[consulta.tipo];
  const tieneMedicamentos = (consulta.medicamentos?.length ?? 0) > 0;
  const tieneDetalle =
    consulta.diagnostico ||
    consulta.tratamiento ||
    consulta.observaciones ||
    tieneMedicamentos;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden transition-shadow hover:shadow-md">

      {/* ── Cabecera ─────────────────────────────────────── */}
      <div className="p-4">
        <div className="flex items-start gap-3">

          {/* Emoji del tipo */}
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0',
            tipo.color.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('dark:')).join(' ') || 'bg-muted'
          )}>
            {tipo.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate leading-tight">{consulta.motivo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(consulta.fecha), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                </p>
              </div>
              <Badge variant="secondary" className={cn('text-xs shrink-0', tipo.color)}>
                {tipo.label}
              </Badge>
            </div>

            {/* Signos vitales */}
            {(consulta.temperatura || consulta.pesoConsulta) && (
              <div className="flex items-center gap-3 mt-2">
                {consulta.temperatura && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Thermometer size={12} />
                    {consulta.temperatura} °C
                  </span>
                )}
                {consulta.pesoConsulta && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Weight size={12} />
                    {consulta.pesoConsulta} kg
                  </span>
                )}
                {tieneMedicamentos && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Pill size={12} />
                    {consulta.medicamentos!.length} medicamento{consulta.medicamentos!.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Diagnóstico resumido (primera línea siempre visible) */}
        {consulta.diagnostico && !expandida && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-1 pl-[52px]">
            <span className="font-medium text-foreground">Dx:</span> {consulta.diagnostico}
          </p>
        )}
      </div>

      {/* ── Detalle expandible ───────────────────────────── */}
      {tieneDetalle && (
        <>
          {expandida && (
            <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">

              {consulta.sintomas && (
                <Campo label="Síntomas">{consulta.sintomas}</Campo>
              )}
              {consulta.diagnostico && (
                <Campo label="Diagnóstico">{consulta.diagnostico}</Campo>
              )}
              {consulta.tratamiento && (
                <Campo label="Tratamiento">{consulta.tratamiento}</Campo>
              )}
              {consulta.observaciones && (
                <Campo label="Observaciones">{consulta.observaciones}</Campo>
              )}

              {tieneMedicamentos && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Medicamentos
                  </p>
                  <div className="space-y-2">
                    {consulta.medicamentos!.map((med, i) => (
                      <div key={i} className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium">{med.nombre}</span>
                        <span className="text-muted-foreground">
                          {' '}— {med.dosis}, {med.frecuencia}, {med.duracion}
                        </span>
                        {med.notas && (
                          <p className="text-xs text-muted-foreground mt-0.5">{med.notas}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {consulta.proximaCita && (
                <div className="flex items-center gap-2 text-sm text-primary font-medium pt-1">
                  <Calendar size={14} />
                  Próxima cita:{' '}
                  {format(new Date(consulta.proximaCita), "d 'de' MMMM 'de' yyyy", { locale: es })}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <Link
                  href={`/pacientes/${pacienteId}/historial/${consulta.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  Ver consulta completa →
                </Link>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpandida((v) => !v)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t border-border/50"
          >
            {expandida ? (
              <><ChevronUp size={14} /> Ocultar detalle</>
            ) : (
              <><ChevronDown size={14} /> Ver detalle</>
            )}
          </button>
        </>
      )}

    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

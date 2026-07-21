'use client';

import Link from 'next/link';
import { CONSULTATION_TYPES, CONSULTATION_STATUSES } from '@/types/consultation';
import type { ConsultationWithPatient } from '@/types/consultation';
import { cn } from '@/lib/utils';
import { ChevronRight, Clock } from 'lucide-react';

interface ConsultaCardProps {
  consulta: ConsultationWithPatient;
  compact?: boolean;
}

function formatFecha(ts: number): string {
  return new Date(ts).toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonto(monto: number): string {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(monto);
}

export function ConsultaCard({ consulta, compact = false }: ConsultaCardProps) {
  const tipoInfo   = CONSULTATION_TYPES[consulta.type];
  const estadoInfo = CONSULTATION_STATUSES[consulta.status];
  const href       = `/consultations/${consulta.id}`;

  if (compact) {
    return (
      <Link href={href} className="flex items-center gap-3 py-2.5 px-1 border-b border-border last:border-0 hover:bg-muted/30 transition-colors -mx-1 px-1 rounded-lg">
        <span className="text-xl w-7 text-center shrink-0">{tipoInfo?.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{consulta.patientName ?? 'Patient'}</p>
          <p className="text-xs text-muted-foreground">{tipoInfo?.label} · {formatFecha(consulta.date)}</p>
        </div>
        <div className="text-right shrink-0">
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', estadoInfo?.color)}>
            {estadoInfo?.label}
          </span>
          {consulta.total > 0 && (
            <p className="text-xs font-medium mt-0.5">{formatMonto(consulta.total)}</p>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="group block bg-card rounded-2xl border border-border overflow-hidden hover:shadow-md hover:border-primary/30 transition-all">
      {/* Barra de estado */}
      <div className={cn('h-1', estadoInfo?.punto)} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Emoji tipo */}
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0', tipoInfo?.color.split(' ').slice(1).join(' '))}>
            {tipoInfo?.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{consulta.patientName ?? 'Patient'}</p>
                <p className="text-xs text-muted-foreground">{tipoInfo?.label} · {formatFecha(consulta.date)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', estadoInfo?.color)}>
                  {estadoInfo?.label}
                </span>
                <ChevronRight size={14} className="text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
              </div>
            </div>

            {/* Motivo */}
            {consulta.reason && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{consulta.reason}</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
              <div className="flex items-center gap-3">
                {consulta.ownerName && (
                  <span className="text-xs text-muted-foreground">{consulta.ownerName}</span>
                )}
                {consulta.veterinarian && (
                  <span className="text-xs text-muted-foreground">{consulta.veterinarian}</span>
                )}
              </div>
              {consulta.status === 'in_progress' ? (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Clock size={11} />En atención
                </span>
              ) : consulta.total > 0 ? (
                <span className="text-xs font-semibold">{formatMonto(consulta.total)}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

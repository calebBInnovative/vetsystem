'use client';

import Link from 'next/link';
import { useUltimasConsultasDashboard } from '@/hooks/useDashboard';
import { CONSULTATION_TYPES } from '@/types/consultation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function UltimasConsultas() {
  const { consultations, loading } = useUltimasConsultasDashboard();

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Últimas consultations</h2>
        <Link href="/patients">
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
            Ver patients <ArrowRight size={13} />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : consultations.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Sin consultations registradas aún</p>
        </div>
      ) : (
        <div className="space-y-2">
          {consultations.map((c) => {
            const tipo = CONSULTATION_TYPES[c.tipo];
            return (
              <Link
                key={c.id}
                href={`/patients/${c.pacienteId}/historial`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
              >
                <span className="text-xl leading-none shrink-0">{tipo.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                    {c.nombrePaciente}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{c.motivo}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="secondary" className={cn('text-xs mb-1', tipo.color)}>
                    {tipo.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.fecha), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

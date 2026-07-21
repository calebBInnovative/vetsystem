'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConsultations, useConsultasEnProceso } from '@/hooks/useConsultations';
import { ConsultaCard } from '@/components/consultations/ConsultationCard';
import { Button } from '@/components/ui/button';
import { Plus, Search, Activity } from 'lucide-react';
import type { ConsultationStatus } from '@/types/consultation';
import { cn } from '@/lib/utils';

const FILTROS: { label: string; valor: ConsultationStatus | 'todas' }[] = [
  { label: 'Todas',       valor: 'todas'       },
  { label: 'En proceso',  valor: 'in_progress' },
  { label: 'Completadas', valor: 'completed'   },
  { label: 'Canceladas',  valor: 'cancelled'   },
];

export default function ConsultationsPage() {
  const [filtro, setFiltro]           = useState<ConsultationStatus | 'todas'>('todas');
  const [searchQuery, setSearchQuery] = useState('');

  const enProceso = useConsultasEnProceso();
  const { consultations, loading } = useConsultations(
    filtro !== 'todas' ? { status: filtro } : undefined
  );

  const consultasFiltradas = consultations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.patientName?.toLowerCase().includes(q) ||
      c.reason?.toLowerCase().includes(q) ||
      c.ownerName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Consultas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Historial de atenciones</p>
        </div>
        <Link href="/consultations/new">
          <Button size="sm" className="gap-1.5">
            <Plus size={14} /> Nueva consulta
          </Button>
        </Link>
      </div>

      {/* Consultas en proceso */}
      {enProceso.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Activity size={15} className="animate-pulse" />
            <p className="text-sm font-semibold">{enProceso.length} consulta{enProceso.length !== 1 ? 's' : ''} en proceso</p>
          </div>
          {enProceso.map((c) => (
            <Link key={c.id} href={`/consultations/${c.id}`}
              className="flex items-center gap-3 bg-white/60 dark:bg-white/5 rounded-xl p-3 hover:bg-white/80 transition-colors"
            >
              <span className="text-lg">
                {c.patientSpecies === 'dog' ? '🐕' : c.patientSpecies === 'cat' ? '🐈' : '🐾'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.patientName}</p>
                <p className="text-xs text-muted-foreground truncate">{c.reason || 'Sin motivo registrado'}</p>
              </div>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">Ver →</span>
            </Link>
          ))}
        </div>
      )}

      {/* Búsqueda + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por paciente, motivo..."
            className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FILTROS.map(({ label, valor }) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                filtro === valor
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border h-24 animate-pulse" />
          ))}
        </div>
      ) : consultasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Sin consultations</p>
          <p className="text-sm mt-1">
            {searchQuery || filtro !== 'todas' ? 'No hay resultados para los filtros aplicados' : 'Registra la primera consulta'}
          </p>
          {!searchQuery && filtro === 'todas' && (
            <Link href="/consultations/new">
              <Button size="sm" className="mt-4 gap-1.5"><Plus size={14} /> Nueva consulta</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {consultasFiltradas.map((c) => (
            <ConsultaCard key={c.id} consulta={c} />
          ))}
        </div>
      )}
    </div>
  );
}

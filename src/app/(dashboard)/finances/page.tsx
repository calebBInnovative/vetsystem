'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePayments } from '@/hooks/useFinances';
import { ResumenIngresos } from '@/components/finances/FinancialSummary';
import { PagoCard } from '@/components/finances/PaymentCard';
import { FinancesAnalytics } from '@/components/finances/FinancesAnalytics';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter, BarChart3, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@/types/finances';

const FILTROS_ESTADO: { label: string; valor: PaymentStatus | 'todos' }[] = [
  { label: 'Todos',        valor: 'todos'      },
  { label: 'Pagados',      valor: 'paid'       },
  { label: 'Pendientes',   valor: 'pending'    },
  { label: 'Cancelados',   valor: 'cancelled'  },
  { label: 'Reembolsados', valor: 'refunded'   },
];

type PageTab = 'movimientos' | 'analitica';

export default function FinancesPage() {
  const [tab,          setTab]          = useState<PageTab>('movimientos');
  const [filtroEstado, setFiltroEstado] = useState<PaymentStatus | 'todos'>('todos');
  const [searchQuery,  setSearchQuery]  = useState('');

  const { payments, loading } = usePayments();

  const pagosFiltrados = payments.filter((p) => {
    if (filtroEstado !== 'todos' && p.status !== filtroEstado) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.concept.toLowerCase().includes(q) ||
        p.patientName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ingresos, egresos y análisis de rendimiento</p>
        </div>
        <Link href="/finances/new">
          <Button size="sm" className="gap-1.5">
            <Plus size={14} /> Registrar pago
          </Button>
        </Link>
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────── */}
      <div className="flex rounded-xl border border-border overflow-hidden text-sm font-medium w-fit">
        <button
          type="button"
          onClick={() => setTab('movimientos')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 transition-colors',
            tab === 'movimientos'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50'
          )}
        >
          <ListOrdered size={14} />
          Movimientos
        </button>
        <button
          type="button"
          onClick={() => setTab('analitica')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 transition-colors',
            tab === 'analitica'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50'
          )}
        >
          <BarChart3 size={14} />
          Analítica
        </button>
      </div>

      {/* ── Movimientos tab ───────────────────────────────────────────── */}
      {tab === 'movimientos' && (
        <>
          <ResumenIngresos />

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por concepto o paciente…"
                className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-0.5">
              <Filter size={14} className="text-muted-foreground self-center mr-1 shrink-0" />
              {FILTROS_ESTADO.map(({ label, valor }) => (
                <button
                  key={valor}
                  onClick={() => setFiltroEstado(valor)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                    filtroEstado === valor
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de pagos */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-2xl border border-border h-24 animate-pulse" />
              ))}
            </div>
          ) : pagosFiltrados.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">Sin pagos</p>
              <p className="text-sm mt-1">
                {searchQuery || filtroEstado !== 'todos'
                  ? 'No hay resultados para los filtros actuales'
                  : 'Registra el primer pago del mes'}
              </p>
              {!searchQuery && filtroEstado === 'todos' && (
                <Link href="/finances/new">
                  <Button size="sm" className="mt-4 gap-1.5">
                    <Plus size={14} /> Registrar pago
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {pagosFiltrados.map((pago) => (
                <PagoCard key={pago.id} pago={pago} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Analítica tab ─────────────────────────────────────────────── */}
      {tab === 'analitica' && <FinancesAnalytics />}

    </div>
  );
}

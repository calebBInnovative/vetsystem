'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePayments } from '@/hooks/useFinances';
import { ResumenIngresos } from '@/components/finances/FinancialSummary';
import { PagoCard } from '@/components/finances/PaymentCard';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter } from 'lucide-react';
import type { PaymentStatus } from '@/types/finances';

const FILTROS_ESTADO: { label: string; valor: PaymentStatus | 'todos' }[] = [
  { label: 'Todos',        valor: 'todos'       },
  { label: 'Pagados',      valor: 'pagado'      },
  { label: 'Pendientes',   valor: 'pendiente'   },
  { label: 'Cancelados',   valor: 'cancelado'   },
  { label: 'Reembolsados', valor: 'reembolsado' },
];

export default function FinancesPage() {
  const [filtroEstado, setFiltroEstado] = useState<PaymentStatus | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');

  const { payments, loading } = usePayments();

  const pagosFiltrados = payments.filter((p) => {
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (
        p.concepto.toLowerCase().includes(q) ||
        p.nombrePaciente?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ingresos, egresos y balance del mes</p>
        </div>
        <Link href="/finances/new">
          <Button size="sm" className="gap-1.5">
            <Plus size={14} /> Registrar pago
          </Button>
        </Link>
      </div>

      {/* KPIs + desglose */}
      <ResumenIngresos />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
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
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                filtroEstado === valor
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              }`}
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
      ) : pagosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Sin payments</p>
          <p className="text-sm mt-1">
            {busqueda || filtroEstado !== 'todos'
              ? 'No hay resultados para los filtros actuales'
              : 'Registra el primer pago del mes'}
          </p>
          {!busqueda && filtroEstado === 'todos' && (
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
    </div>
  );
}

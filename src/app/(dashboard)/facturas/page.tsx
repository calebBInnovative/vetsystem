'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFacturas } from '@/hooks/useFacturas';
import { ESTADOS_FACTURA, METODOS_PAGO_FACTURA, type EstadoFactura, type FacturaCompleta } from '@/types/factura';
import { cn } from '@/lib/utils';
import { Receipt, Search } from 'lucide-react';

const FILTROS_ESTADO: { key: EstadoFactura | 'todas'; label: string }[] = [
  { key: 'todas',              label: 'Todas'    },
  { key: 'pagada',             label: 'Pagadas'  },
  { key: 'pendiente',          label: 'Pendiente'},
  { key: 'parcialmente_pagada',label: 'Parcial'  },
  { key: 'cancelada',          label: 'Cancelada'},
];

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: 'NIO', maximumFractionDigits: 0,
  }).format(n);
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function FacturaRow({ factura }: { factura: FacturaCompleta }) {
  const estadoInfo = ESTADOS_FACTURA[factura.estado];
  const metodo     = METODOS_PAGO_FACTURA[factura.metodoPago];

  return (
    <Link
      href={`/facturas/${factura.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group"
    >
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Receipt size={14} className="text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{factura.numero}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', estadoInfo.color)}>
            {estadoInfo.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {factura.nombrePaciente ?? '—'} · {factura.nombreDueno ?? '—'}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="font-semibold text-sm">{fmt(factura.total)}</p>
        <p className="text-xs text-muted-foreground">{fmtFecha(factura.fecha)} · {metodo.emoji} {metodo.label}</p>
      </div>
    </Link>
  );
}

export default function FacturasPage() {
  const [filtroEstado, setFiltroEstado] = useState<EstadoFactura | 'todas'>('todas');
  const [busqueda, setBusqueda]         = useState('');

  const { facturas, cargando } = useFacturas(
    filtroEstado !== 'todas' ? { estado: filtroEstado } : undefined
  );

  const filtradas = busqueda.trim()
    ? facturas.filter((f) => {
        const q = busqueda.toLowerCase();
        return (
          f.numero.toLowerCase().includes(q) ||
          f.nombrePaciente?.toLowerCase().includes(q) ||
          f.nombreDueno?.toLowerCase().includes(q)
        );
      })
    : facturas;

  // Resumen financiero
  const totalCobrado  = facturas.filter((f) => f.estado === 'pagada').reduce((s, f) => s + f.total, 0);
  const totalPendiente= facturas.filter((f) => f.estado === 'pendiente' || f.estado === 'parcialmente_pagada').reduce((s, f) => s + (f.total - f.montoPagado), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-sm text-muted-foreground">Historial de cobros y cuentas por cobrar</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cobrado</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{fmt(totalCobrado)}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Por cobrar</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{fmt(totalPendiente)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar por número, paciente o dueño…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTROS_ESTADO.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltroEstado(key)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border',
                filtroEstado === key
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
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt size={32} className="text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {busqueda ? 'Sin resultados para tu búsqueda' : 'No hay facturas aún'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Las facturas se generan al finalizar una consulta
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtradas.map((f) => <FacturaRow key={f.id} factura={f} />)}
          </div>
        )}
      </div>
    </div>
  );
}

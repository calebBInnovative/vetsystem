'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInvoices } from '@/hooks/useInvoices';
import { INVOICE_STATUSES, INVOICE_PAYMENT_METHODS, type InvoiceStatus, type InvoiceWithDetails } from '@/types/invoice';
import { cn } from '@/lib/utils';
import { Receipt, Search } from 'lucide-react';

const FILTROS_ESTADO: { key: InvoiceStatus | 'todas'; label: string }[] = [
  { key: 'todas',           label: 'Todas'    },
  { key: 'paid',            label: 'Pagadas'  },
  { key: 'pending',         label: 'Pendiente'},
  { key: 'partially_paid',  label: 'Parcial'  },
  { key: 'cancelled',       label: 'Cancelada'},
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

function FacturaRow({ factura }: { factura: InvoiceWithDetails }) {
  const estadoInfo = INVOICE_STATUSES[factura.status];
  const metodo     = INVOICE_PAYMENT_METHODS[factura.paymentMethod];

  return (
    <Link
      href={`/invoices/${factura.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group"
    >
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Receipt size={14} className="text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{factura.number}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', estadoInfo.color)}>
            {estadoInfo.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {factura.saleId
            ? (() => {
                const items = factura.items ?? [];
                const summary = items.slice(0, 2).map((i) => `${i.description} ×${i.quantity}`).join(', ');
                const extra   = items.length > 2 ? ` +${items.length - 2} más` : '';
                return `🛒 ${summary}${extra}` || 'Sale de products';
              })()
            : `${factura.patientName ?? '—'} · ${factura.ownerName ?? '—'}`
          }
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="font-semibold text-sm">{fmt(factura.total)}</p>
        <p className="text-xs text-muted-foreground">{fmtFecha(factura.date)} · {metodo.emoji} {metodo.label}</p>
      </div>
    </Link>
  );
}

export default function InvoicesPage() {
  const [filtroEstado, setFiltroEstado] = useState<InvoiceStatus | 'todas'>('todas');
  const [searchQuery, setSearchQuery]   = useState('');

  const { invoices, loading } = useInvoices(
    filtroEstado !== 'todas' ? { status: filtroEstado } : undefined
  );

  const filtradas = searchQuery.trim()
    ? invoices.filter((f) => {
        const q = searchQuery.toLowerCase();
        return (
          f.number.toLowerCase().includes(q) ||
          f.patientName?.toLowerCase().includes(q) ||
          f.ownerName?.toLowerCase().includes(q) ||
          f.items?.some((i) => i.description.toLowerCase().includes(q))
        );
      })
    : invoices;

  // Resumen financiero
  const totalCobrado   = invoices.filter((f) => f.status === 'paid').reduce((s, f) => s + f.total, 0);
  const totalPendiente = invoices
    .filter((f) => f.status === 'pending' || f.status === 'partially_paid')
    .reduce((s, f) => s + (f.total - (f.amountPaid ?? 0)), 0);

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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt size={32} className="text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? 'Sin resultados para tu búsqueda' : 'No hay invoices aún'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Las invoices se generan al finalizar una consulta
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

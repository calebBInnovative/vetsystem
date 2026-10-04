'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FileText, Printer, ShoppingCart, Ban, Trash2, Plus, Loader2, Clock, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  useQuotes, useQuoteStats, convertQuoteToSale, cancelQuote, deleteQuote,
  QuoteConversionError,
} from '@/hooks/useQuotes';
import { printQuote } from '@/lib/quotes/print-quote';
import { QUOTE_STATUSES, isQuoteExpired, type QuoteStatus, type QuoteWithDetails } from '@/types/quote';
import { SALE_PAYMENT_METHODS, type SalePaymentMethod } from '@/types/sale';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: 'NIO', maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const FILTERS: { value: QuoteStatus | 'all'; label: string }[] = [
  { value: 'open',      label: 'Vigentes'  },
  { value: 'converted', label: 'Vendidas'  },
  { value: 'cancelled', label: 'Anuladas'  },
  { value: 'all',       label: 'Todas'     },
];

export default function QuotesPage() {
  const router = useRouter();
  const { session } = useAuth();

  const [status, setStatus] = useState<QuoteStatus | 'all'>('open');
  const { quotes, loading } = useQuotes({ status });
  const { stats } = useQuoteStats();

  const [converting,    setConverting]    = useState<QuoteWithDetails | null>(null);
  const [method,        setMethod]        = useState<SalePaymentMethod>('cash');
  const [processing,    setProcessing]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<QuoteWithDetails | null>(null);

  async function handleConvert() {
    if (!converting || processing) return;
    setProcessing(true);
    try {
      const saleId = await convertQuoteToSale(converting.id, method);
      toast.success(`Cotización ${converting.number} convertida en venta`, {
        action: { label: 'Ver venta', onClick: () => router.push('/sales') },
      });
      setConverting(null);
      void saleId;
    } catch (err) {
      const message = err instanceof QuoteConversionError
        ? err.message
        : 'No se pudo convertir la cotización. Intenta de nuevo.';
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCancel(quote: QuoteWithDetails) {
    await cancelQuote(quote.id);
    toast.success(`Cotización ${quote.number} anulada`);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await deleteQuote(confirmDelete.id);
    toast.success(`Cotización ${confirmDelete.number} eliminada`);
    setConfirmDelete(null);
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Presupuestos para el cliente. No afectan ventas, inventario ni finanzas hasta convertirlas.
          </p>
        </div>
        <Button className="gap-2" onClick={() => router.push('/sales')}>
          <Plus size={16} /> Nueva cotización
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
              <Clock size={16} className="text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.openCount}</p>
            <p className="text-xs text-muted-foreground">Vigentes</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <FileText size={16} className="text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{fmt(stats.openAmount)}</p>
            <p className="text-xs text-muted-foreground">Monto cotizado vigente</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.convertedCount}</p>
            <p className="text-xs text-muted-foreground">Convertidas en venta</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              status === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
            <FileText size={24} className="text-muted-foreground" />
          </div>
          <p className="font-semibold">No hay cotizaciones {status !== 'all' && 'en este estado'}</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Arma el carrito en Ventas y elige <strong>Guardar cotización</strong> en vez de cobrar.
          </p>
          <Button variant="outline" className="gap-2" onClick={() => router.push('/sales')}>
            <Plus size={15} /> Crear la primera
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => {
            const expired = isQuoteExpired(q);
            const badge   = QUOTE_STATUSES[q.status];
            return (
              <div key={q.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">

                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{q.number}</p>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border', badge.color)}>
                        {badge.label}
                      </span>
                      {expired && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800">
                          Vencida
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(q.date)}
                      {q.validUntil && ` · válida hasta ${fmtDate(q.validUntil)}`}
                      {q.patientName && ` · ${q.patientName}`}
                      {q.ownerName   && ` (${q.ownerName})`}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-primary shrink-0">{fmt(q.total)}</p>
                </div>

                <div className="text-xs text-muted-foreground">
                  {q.items.slice(0, 3).map((i) => `${i.description} ×${i.quantity}`).join(' · ')}
                  {q.items.length > 3 && ` +${q.items.length - 3} más`}
                </div>

                <div className="flex gap-2 flex-wrap pt-1">
                  <Button size="sm" variant="outline" className="gap-1.5"
                    onClick={() => printQuote(q, session)}>
                    <Printer size={14} /> Imprimir
                  </Button>

                  {q.status === 'open' && (
                    <>
                      <Button size="sm" className="gap-1.5" onClick={() => { setConverting(q); setMethod('cash'); }}>
                        <ShoppingCart size={14} /> Convertir en venta
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"
                        onClick={() => handleCancel(q)}>
                        <Ban size={14} /> Anular
                      </Button>
                    </>
                  )}

                  {q.status !== 'converted' && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(q)}>
                      <Trash2 size={14} /> Eliminar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Convert dialog */}
      <Dialog open={!!converting} onOpenChange={(open) => !open && setConverting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir en venta</DialogTitle>
            <DialogDescription>
              Se registrará la venta por {converting && fmt(converting.total)}, se descontará el inventario
              y se generará la factura con su pago. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Método de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SALE_PAYMENT_METHODS) as SalePaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'rounded-xl border p-3 text-sm font-medium transition-colors text-left',
                    method === m
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  {SALE_PAYMENT_METHODS[m].emoji} {SALE_PAYMENT_METHODS[m].label}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConverting(null)} disabled={processing}>
              Cancelar
            </Button>
            <Button onClick={handleConvert} disabled={processing} className="gap-2">
              {processing && <Loader2 size={14} className="animate-spin" />}
              Confirmar venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cotización</DialogTitle>
            <DialogDescription>
              {confirmDelete?.number} se quitará del listado. No afecta ventas ni inventario.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

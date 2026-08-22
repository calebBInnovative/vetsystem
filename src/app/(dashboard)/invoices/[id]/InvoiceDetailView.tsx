'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRouteId } from '@/hooks/useRouteId';
import { useInvoice, markInvoicePaid } from '@/hooks/useInvoices';
import { FacturaViewer } from '@/components/invoices/InvoiceViewer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { INVOICE_PAYMENT_METHODS, type InvoicePaymentMethod } from '@/types/invoice';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function InvoiceDetailView() {
  const id      = useRouteId();
  const router  = useRouter();
  const { factura, loading } = useInvoice(id ?? '');

  // Payment flow
  const [accion,     setAccion]     = useState<'cobrar' | null>(null);
  const [method,     setMethod]     = useState<InvoicePaymentMethod>('cash');
  const [procesando, setProcesando] = useState(false);

  if (!id || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Factura no encontrada</p>
        <Button variant="ghost" onClick={() => router.push('/invoices')} className="mt-3">
          <ArrowLeft size={14} className="mr-2" /> Volver
        </Button>
      </div>
    );
  }

  async function handleMarcarPagada() {
    setProcesando(true);
    try {
      await markInvoicePaid(id ?? '', method);
      setAccion(null);
    } finally {
      setProcesando(false);
    }
  }

  const puedeMarcarPagada =
    factura.status === 'pending' || factura.status === 'partially_paid';

  return (
    <div className="max-w-2xl mx-auto space-y-5 print:max-w-none print:space-y-0">

      {/* ── Nav bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
          <ArrowLeft size={14} className="mr-1.5" /> Facturas
        </Button>

        <div className="flex gap-2 flex-wrap justify-end">
          {factura.consultationId && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/consultations/${factura.consultationId}`)}>
              Ver consulta
            </Button>
          )}
          {factura.saleId && (
            <Button variant="outline" size="sm" onClick={() => router.push('/sales')}>
              Ver ventas
            </Button>
          )}
          {puedeMarcarPagada && (
            <Button size="sm" onClick={() => setAccion('cobrar')}>
              Registrar cobro
            </Button>
          )}
        </div>
      </div>

      {/* ── Rectification banners ─────────────────────────────────────────────── */}
      {factura.rectifiesId && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm print:hidden">
          <LinkIcon size={15} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Factura rectificativa</p>
            <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
              Esta factura fue creada para reemplazar una anulada.{' '}
              <Link href={`/invoices/${factura.rectifiesId}`} className="underline underline-offset-2 hover:opacity-80">
                Ver factura original
              </Link>
            </p>
          </div>
        </div>
      )}

      {factura.rectifiedById && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm print:hidden">
          <AlertTriangle size={15} className="shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Factura anulada</p>
            <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
              {factura.cancelReason && <><strong>Motivo:</strong> {factura.cancelReason} · </>}
              Anulada por {factura.cancelledBy ?? 'administrador'}.{' '}
              <Link href={`/invoices/${factura.rectifiedById}`} className="underline underline-offset-2 hover:opacity-80">
                Ver factura rectificativa
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Cancelled without rectification */}
      {factura.status === 'cancelled' && !factura.rectifiedById && factura.cancelReason && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm print:hidden">
          <AlertTriangle size={15} className="shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
          <p className="text-red-700 dark:text-red-300">
            <strong>Anulada:</strong> {factura.cancelReason}
          </p>
        </div>
      )}

      {/* ── Invoice document ─────────────────────────────────────────────────── */}
      <FacturaViewer factura={factura} acciones />

      {/* ── Cobro panel ──────────────────────────────────────────────────────── */}
      {accion === 'cobrar' && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4 print:hidden">
          <p className="font-semibold">Registrar cobro</p>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Método de pago</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, { label: string; emoji: string }][]).map(
                ([key, info]) => (
                  <button key={key} type="button" onClick={() => setMethod(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                      method === key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                    )}
                  >
                    <span className="text-lg">{info.emoji}</span>
                    {info.label}
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setAccion(null)} disabled={procesando}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleMarcarPagada} disabled={procesando}>
              {procesando && <Loader2 size={14} className="mr-2 animate-spin" />}
              Confirmar cobro
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}

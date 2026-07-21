'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoice, markInvoicePaid, cancelInvoice } from '@/hooks/useInvoices';
import { FacturaViewer } from '@/components/invoices/InvoiceViewer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { INVOICE_PAYMENT_METHODS, type InvoicePaymentMethod } from '@/types/invoice';
import { cn } from '@/lib/utils';

export function InvoiceDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id }    = use(params);
  const router    = useRouter();
  const { factura, loading } = useInvoice(id);
  const [accion, setAccion]       = useState<'cobrar' | null>(null);
  const [method, setMethod]       = useState<InvoicePaymentMethod>('cash');
  const [procesando, setProcesando] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Invoice no encontrada</p>
        <Button variant="ghost" onClick={() => router.push('/invoices')} className="mt-3">
          <ArrowLeft size={14} className="mr-2" /> Volver
        </Button>
      </div>
    );
  }

  async function handleMarcarPagada() {
    setProcesando(true);
    try {
      await markInvoicePaid(id, method);
      setAccion(null);
    } finally {
      setProcesando(false);
    }
  }

  async function handleCancelar() {
    if (!confirm('¿Cancelar esta factura?')) return;
    await cancelInvoice(id);
    router.push('/invoices');
  }

  const puedeMarcarPagada =
    factura.status === 'pending' || factura.status === 'partially_paid';

  return (
    <div className="max-w-2xl mx-auto space-y-5 print:max-w-none print:space-y-0">

      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
          <ArrowLeft size={14} className="mr-1.5" /> Facturas
        </Button>

        <div className="flex gap-2">
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
          {factura.status !== 'cancelled' && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleCancelar}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <FacturaViewer factura={factura} acciones />

      {accion === 'cobrar' && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4 print:hidden">
          <p className="font-semibold">Registrar cobro</p>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Método de pago</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, { label: string; emoji: string }][]).map(
                ([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
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

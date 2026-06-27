'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFactura, marcarFacturaPagada, cancelarFactura } from '@/hooks/useFacturas';
import { FacturaViewer } from '@/components/facturas/FacturaViewer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { METODOS_PAGO_FACTURA, type MetodoPagoFactura } from '@/types/factura';
import { cn } from '@/lib/utils';

export default function FacturaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }    = use(params);
  const router    = useRouter();
  const { factura, cargando } = useFactura(id);
  const [accion, setAccion]   = useState<'cobrar' | null>(null);
  const [metodo, setMetodo]   = useState<MetodoPagoFactura>('efectivo');
  const [procesando, setProcesando] = useState(false);

  if (cargando) {
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
        <Button variant="ghost" onClick={() => router.push('/facturas')} className="mt-3">
          <ArrowLeft size={14} className="mr-2" /> Volver
        </Button>
      </div>
    );
  }

  async function handleMarcarPagada() {
    setProcesando(true);
    try {
      await marcarFacturaPagada(id, metodo);
      setAccion(null);
    } finally {
      setProcesando(false);
    }
  }

  async function handleCancelar() {
    if (!confirm('¿Cancelar esta factura?')) return;
    await cancelarFactura(id);
    router.push('/facturas');
  }

  const puedeMarcarPagada =
    factura.estado === 'pendiente' || factura.estado === 'parcialmente_pagada';

  return (
    <div className="max-w-2xl mx-auto space-y-5 print:max-w-none print:space-y-0">

      {/* Nav — oculto al imprimir */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.push('/facturas')}>
          <ArrowLeft size={14} className="mr-1.5" /> Facturas
        </Button>

        <div className="flex gap-2">
          {factura.consultaId && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/consultas/${factura.consultaId}`)}>
              Ver consulta
            </Button>
          )}
          {factura.ventaId && (
            <Button variant="outline" size="sm" onClick={() => router.push('/ventas')}>
              Ver ventas
            </Button>
          )}
          {puedeMarcarPagada && (
            <Button size="sm" onClick={() => setAccion('cobrar')}>
              Registrar cobro
            </Button>
          )}
          {factura.estado !== 'cancelada' && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleCancelar}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Visor de factura */}
      <FacturaViewer factura={factura} acciones />

      {/* Panel: registrar cobro */}
      {accion === 'cobrar' && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4 print:hidden">
          <p className="font-semibold">Registrar cobro</p>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Método de pago</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(METODOS_PAGO_FACTURA) as [MetodoPagoFactura, { label: string; emoji: string }][]).map(
                ([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMetodo(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                      metodo === key
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

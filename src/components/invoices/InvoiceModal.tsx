'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { createInvoice } from '@/hooks/useInvoices';
import { INVOICE_PAYMENT_METHODS, type InvoicePaymentMethod, type InvoiceStatus } from '@/types/invoice';
import type { ConsultationWithPatient } from '@/types/consultation';
import { DescuentoInput } from '@/components/common/DiscountInput';
import { cn } from '@/lib/utils';

interface FacturaModalProps {
  consulta: ConsultationWithPatient;
  open: boolean;
  onGuardada: (facturaId: string) => void;
}

const ESTADOS: { key: InvoiceStatus; label: string; desc: string; emoji: string }[] = [
  { key: 'pagada',              label: 'Pagada',    desc: 'El cobro fue recibido',     emoji: '✅' },
  { key: 'parcialmente_pagada', label: 'Parcial',   desc: 'Cobro incompleto',          emoji: '💰' },
  { key: 'pendiente',           label: 'Pendiente', desc: 'Cuenta por cobrar',         emoji: '⏳' },
];

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: 'NIO', maximumFractionDigits: 0,
  }).format(n);
}

export function FacturaModal({ consulta, open, onGuardada }: FacturaModalProps) {
  const [guardando, setGuardando]     = useState(false);
  const [estado, setEstado]           = useState<InvoiceStatus>('pagada');
  const [metodoPago, setMetodoPago]   = useState<InvoicePaymentMethod>('efectivo');
  const [montoPagado, setMontoPagado] = useState('');
  const [descuento, setDescuento]     = useState(String(consulta.descuento ?? 0));
  const [notas, setNotas]             = useState('');

  const descuentoNum  = Math.max(0, Number(descuento) || 0);
  const subtotal      = consulta.subtotal;
  const total         = Math.max(0, subtotal - descuentoNum);
  const items         = consulta.items ?? [];

  async function guardar() {
    if (guardando) return;

    if (estado === 'parcialmente_pagada') {
      const mp = Number(montoPagado);
      if (!mp || mp <= 0 || mp >= total) return;
    }

    setGuardando(true);
    try {
      const id = await createInvoice({
        consulta,
        metodoPago,
        estado,
        montoPagado: estado === 'parcialmente_pagada' ? Number(montoPagado) : undefined,
        descuento:   descuentoNum,
        notas:       notas.trim() || undefined,
      });
      onGuardada(id);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-bold">Invoice / Recibo</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            {consulta.nombrePaciente} · {consulta.nombreDueno}
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">

          {/* Desglose de items */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Descripción</span>
              <span>Subtotal</span>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin products ni services registrados
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.esServicio ? 'Service' : 'Producto'} · {item.cantidad} × {fmt(item.precioUnitario)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{fmt(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Totales */}
            <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Descuento</span>
                <DescuentoInput
                  subtotal={subtotal}
                  value={descuentoNum}
                  onChange={(monto) => setDescuento(String(monto))}
                />
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Estado de la factura */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Estado del cobro</p>
            <div className="grid grid-cols-3 gap-2">
              {ESTADOS.map(({ key, label, desc, emoji }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEstado(key)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-3 text-xs transition-colors',
                    estado === key
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="font-semibold">{label}</span>
                  <span className="text-[10px] opacity-70 text-center leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Monto parcial */}
          {estado === 'parcialmente_pagada' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Monto cobrado (C$) *</label>
              <input
                type="number"
                min="1"
                max={total - 1}
                step="1"
                placeholder="0"
                value={montoPagado}
                onChange={(e) => setMontoPagado(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {Number(montoPagado) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo pendiente: {fmt(Math.max(0, total - Number(montoPagado)))}
                </p>
              )}
            </div>
          )}

          {/* Método de pago (solo si hay cobro) */}
          {estado !== 'pendiente' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Método de pago</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(INVOICE_PAYMENT_METHODS) as [InvoicePaymentMethod, { label: string; emoji: string }][]).map(
                  ([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMetodoPago(key)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-colors',
                        metodoPago === key
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
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notas <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones, acuerdos de pago…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Acciones */}
        <div className="px-6 pb-6 pt-0">
          <Button
            className="w-full h-11 text-base"
            onClick={guardar}
            disabled={guardando || (estado === 'parcialmente_pagada' && (!Number(montoPagado) || Number(montoPagado) >= total))}
          >
            {guardando && <Loader2 size={14} className="mr-2 animate-spin" />}
            {estado === 'pendiente'
              ? 'Guardar como Pendiente'
              : estado === 'parcialmente_pagada'
              ? 'Registrar Cobro Parcial'
              : 'Registrar Cobro'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { ESTADOS_FACTURA, METODOS_PAGO_FACTURA, type FacturaCompleta } from '@/types/factura';
import { cn } from '@/lib/utils';

interface FacturaViewerProps {
  factura: FacturaCompleta;
  /** Muestra botones de acción (imprimir, etc.) — false en modales */
  acciones?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: 'NIO', maximumFractionDigits: 0,
  }).format(n);
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function FacturaViewer({ factura, acciones = false }: FacturaViewerProps) {
  const estadoInfo  = ESTADOS_FACTURA[factura.estado];
  const metodoInfo  = METODOS_PAGO_FACTURA[factura.metodoPago];
  const saldoPend   = factura.estado === 'parcialmente_pagada'
    ? factura.total - factura.montoPagado
    : 0;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden print:border-0 print:rounded-none print:shadow-none">

      {/* Cabecera de la clínica */}
      <div className="bg-primary/5 border-b border-border px-6 py-5 print:bg-white print:py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-base text-primary">House of Pets</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clínica Veterinaria · Nicaragua</p>
          </div>
          <div className="text-right">
            <p className="font-mono font-bold text-lg tracking-wide">{factura.numero}</p>
            <p className="text-xs text-muted-foreground">{fmtFecha(factura.fecha)}</p>
          </div>
        </div>

        {/* Estado badge */}
        <div className="mt-4 flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium', estadoInfo.color)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', estadoInfo.punto)} />
            {estadoInfo.label}
          </span>
          {factura.estado !== 'pendiente' && (
            <span className="text-xs text-muted-foreground">
              {metodoInfo.emoji} {metodoInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* Datos del paciente / dueño */}
      <div className="px-6 py-4 border-b border-border grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Paciente</p>
          <p className="font-semibold">{factura.nombrePaciente ?? '—'}</p>
          {factura.razaPaciente && <p className="text-xs text-muted-foreground capitalize">{factura.especiePaciente} · {factura.razaPaciente}</p>}
          {!factura.razaPaciente && factura.especiePaciente && <p className="text-xs text-muted-foreground capitalize">{factura.especiePaciente}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Dueño</p>
          <p className="font-semibold">{factura.nombreDueno ?? '—'}</p>
          {factura.telefonoDueno && <p className="text-xs text-muted-foreground">{factura.telefonoDueno}</p>}
        </div>
      </div>

      {/* Items */}
      <div className="px-6 py-4 border-b border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
              <th className="text-left pb-2 font-medium">Descripción</th>
              <th className="text-center pb-2 font-medium w-16">Cant.</th>
              <th className="text-right pb-2 font-medium w-24">P. Unit.</th>
              <th className="text-right pb-2 font-medium w-24">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {factura.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">
                  Sin items registrados
                </td>
              </tr>
            ) : (
              factura.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5">
                    <p className="font-medium">{item.descripcion}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.tipo}</p>
                  </td>
                  <td className="py-2.5 text-center text-muted-foreground">{item.cantidad}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{fmt(item.precioUnitario)}</td>
                  <td className="py-2.5 text-right font-medium">{fmt(item.subtotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="px-6 py-4 border-b border-border space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{fmt(factura.subtotal)}</span>
        </div>
        {factura.descuento > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Descuento</span>
            <span className="text-green-600">− {fmt(factura.descuento)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
          <span>Total</span>
          <span>{fmt(factura.total)}</span>
        </div>
        {factura.estado === 'parcialmente_pagada' && (
          <>
            <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
              <span>Pagado</span>
              <span>{fmt(factura.montoPagado)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-amber-600 dark:text-amber-400">
              <span>Saldo pendiente</span>
              <span>{fmt(saldoPend)}</span>
            </div>
          </>
        )}
      </div>

      {/* Notas + acciones */}
      {(factura.notas || acciones) && (
        <div className="px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            {factura.notas && (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{factura.notas}</p>
              </>
            )}
          </div>
          {acciones && (
            <button
              onClick={() => window.print()}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40 transition-colors print:hidden"
            >
              🖨️ Imprimir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

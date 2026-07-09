'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePaymentStatus, deletePayment } from '@/hooks/useFinances';
import { PAYMENT_METHODS, PAYMENT_STATUSES, INCOME_TYPES, type PaymentStatus } from '@/types/finances';
import type { PaymentLocal } from '@/types/finances';
import { MoreVertical, Trash2, CheckCircle, XCircle, RefreshCw, Receipt, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PagoConNombre extends PaymentLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
}

interface PagoCardProps {
  pago: PagoConNombre;
  compact?: boolean;
}

const ACCIONES: Partial<Record<PaymentStatus, { label: string; estado: PaymentStatus; icon: React.ElementType }[]>> = {
  pendiente:  [{ label: 'Marcar pagado',     estado: 'pagado',      icon: CheckCircle },
               { label: 'Cancelar',          estado: 'cancelado',   icon: XCircle     }],
  pagado:     [{ label: 'Marcar pendiente',  estado: 'pendiente',   icon: RefreshCw   },
               { label: 'Reembolsar',        estado: 'reembolsado', icon: RefreshCw   }],
  cancelado:  [{ label: 'Reactivar',         estado: 'pendiente',   icon: RefreshCw   }],
  reembolsado:[{ label: 'Reactivar',         estado: 'pagado',      icon: RefreshCw   }],
};

function formatMonto(monto: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(monto);
}

function formatFecha(fecha: string) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export function PagoCard({ pago, compact = false }: PagoCardProps) {
  const [loading, setCargando] = useState(false);
  const router = useRouter();

  const estadoInfo = PAYMENT_STATUSES[pago.estado];
  const metodoInfo = PAYMENT_METHODS[pago.metodoPago];
  const tipoInfo   = INCOME_TYPES[pago.tipo];
  const acciones   = ACCIONES[pago.estado] ?? [];

  // Pendiente de mes anterior
  const hoy        = new Date();
  const mesActual  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const esPendienteHistorico = pago.estado === 'pendiente' && pago.fecha.slice(0, 7) < mesActual;

  // Nombre a mostrar — para ventas anónimas mostrar "Sale directa"
  const clienteLabel = pago.nombrePaciente && pago.nombrePaciente !== 'Patient'
    ? pago.nombrePaciente
    : pago.tipo === 'producto'
    ? 'Sale directa'
    : 'Sin paciente';

  // Extraer número de factura del concepto (FAC-YYYY-NNNN al inicio)
  const matchFac = pago.concepto?.match(/^(FAC-\d{4}-\d{4})/);
  const numFactura = matchFac?.[1];

  async function handleCambiarEstado(estado: PaymentStatus) {
    setCargando(true);
    try { await updatePaymentStatus(pago.id, estado); }
    finally { setCargando(false); }
  }

  async function handleEliminar() {
    if (!confirm('¿Eliminar este pago?')) return;
    await deletePayment(pago.id);
  }

  // Descripción del concepto sin el número de factura al inicio
  const conceptoLimpio = numFactura
    ? pago.concepto.replace(`${numFactura} — `, '')
    : pago.concepto;

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2.5 px-1 border-b border-border last:border-0">
        <span className="text-lg w-6 text-center shrink-0">{tipoInfo?.emoji ?? '💰'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{conceptoLimpio}</p>
          <p className="text-xs text-muted-foreground">
            {clienteLabel} · {formatFecha(pago.fecha)}
            {numFactura && <span className="ml-1 font-mono opacity-60">{numFactura}</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatMonto(pago.monto)}</p>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', estadoInfo?.color)}>
            {estadoInfo?.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Estado bar */}
      <div className={cn('h-1', estadoInfo?.punto)} />

      <div className="p-4 space-y-3">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl mt-0.5 shrink-0">{tipoInfo?.emoji ?? '💰'}</span>
            <div className="flex-1 min-w-0">
              {/* Concepto principal (sin número de factura) */}
              <p className="font-semibold text-sm leading-snug">{conceptoLimpio}</p>

              {/* Cliente + fecha */}
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs text-muted-foreground">{clienteLabel}</span>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-xs text-muted-foreground">{formatFecha(pago.fecha)}</span>
                {/* Tipo badge */}
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                  {tipoInfo?.label ?? pago.tipo}
                </span>
                {esPendienteHistorico && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-medium border border-amber-500/20">
                    Mes anterior
                  </span>
                )}
              </div>

              {/* Número de factura vinculado */}
              {numFactura && (
                <button
                  type="button"
                  onClick={() => {
                    // Buscar la factura por número — navegar a invoices
                    router.push('/invoices');
                  }}
                  className="mt-1 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors font-mono"
                >
                  <Receipt size={10} />
                  {numFactura}
                </button>
              )}

              {/* Referencia a consulta */}
              {pago.consultaId && (
                <button
                  type="button"
                  onClick={() => router.push(`/consultations/${pago.consultaId}`)}
                  className="mt-1 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                >
                  <Stethoscope size={10} />
                  Ver consulta
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-xl font-bold">{formatMonto(pago.monto)}</p>
              <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', estadoInfo?.color)}>
                {estadoInfo?.label}
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loading}>
                  <MoreVertical size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {acciones.map(({ label, estado, icon: Icon }) => (
                  <DropdownMenuItem key={estado} onClick={() => handleCambiarEstado(estado)}>
                    <Icon size={14} className="mr-2" /> {label}
                  </DropdownMenuItem>
                ))}
                {acciones.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={handleEliminar} className="text-destructive focus:text-destructive">
                  <Trash2 size={14} className="mr-2" /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Footer — método + notas */}
        <div className="flex items-center gap-2 pt-3 border-t border-border/60">
          <span className="text-base">{metodoInfo?.emoji}</span>
          <span className="text-xs text-muted-foreground">{metodoInfo?.label}</span>
          {pago.notas && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground truncate">{pago.notas}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

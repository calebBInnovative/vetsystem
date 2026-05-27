'use client';

import { useState } from 'react';
import { cambiarEstadoPago, eliminarPago } from '@/hooks/useFinanzas';
import { METODOS_PAGO, ESTADOS_PAGO, TIPOS_INGRESO, type EstadoPago } from '@/types/finanzas';
import type { PagoLocal } from '@/types/finanzas';
import { MoreVertical, Trash2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PagoConNombre extends PagoLocal {
  nombrePaciente?: string;
  especiePaciente?: string;
}

interface PagoCardProps {
  pago: PagoConNombre;
  compact?: boolean;
}

const ACCIONES: Partial<Record<EstadoPago, { label: string; estado: EstadoPago; icon: React.ElementType }[]>> = {
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
  const [cargando, setCargando] = useState(false);

  const estadoInfo = ESTADOS_PAGO[pago.estado];
  const metodoInfo = METODOS_PAGO[pago.metodoPago];
  const tipoInfo   = TIPOS_INGRESO[pago.tipo];
  const acciones   = ACCIONES[pago.estado] ?? [];

  async function handleCambiarEstado(estado: EstadoPago) {
    setCargando(true);
    try { await cambiarEstadoPago(pago.id, estado); }
    finally { setCargando(false); }
  }

  async function handleEliminar() {
    if (!confirm('¿Eliminar este pago?')) return;
    await eliminarPago(pago.id);
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2.5 px-1 border-b border-border last:border-0">
        <span className="text-lg w-6 text-center">{tipoInfo?.emoji ?? '💰'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{pago.concepto}</p>
          <p className="text-xs text-muted-foreground">{formatFecha(pago.fecha)} · {pago.nombrePaciente ?? 'Paciente'}</p>
        </div>
        <div className="text-right">
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

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl mt-0.5">{tipoInfo?.emoji ?? '💰'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm leading-tight">{pago.concepto}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pago.nombrePaciente ?? 'Paciente'} · {formatFecha(pago.fecha)}
              </p>
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
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={cargando}>
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

        {/* Footer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
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

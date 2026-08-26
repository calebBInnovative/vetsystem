'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePaymentStatus, deletePayment, correctPayment } from '@/hooks/useFinances';
import { PAYMENT_METHODS, PAYMENT_STATUSES, INCOME_TYPES, type PaymentStatus, type PaymentMethod } from '@/types/finances';
import type { PaymentLocal } from '@/types/finances';
import { MoreVertical, Trash2, CheckCircle, XCircle, RefreshCw, Receipt, Stethoscope, Pencil, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { db, getClinicaId } from '@/lib/db/database';

interface PagoConNombre extends PaymentLocal {
  patientName?: string;
  patientSpecies?: string;
}

interface PagoCardProps {
  pago: PagoConNombre;
  compact?: boolean;
}

const ACCIONES: Partial<Record<PaymentStatus, { label: string; estado: PaymentStatus; icon: React.ElementType }[]>> = {
  pending:   [{ label: 'Marcar pagado',     estado: 'paid',       icon: CheckCircle },
              { label: 'Cancelar',          estado: 'cancelled',  icon: XCircle     }],
  paid:      [{ label: 'Marcar pendiente',  estado: 'pending',    icon: RefreshCw   },
              { label: 'Reembolsar',        estado: 'refunded',   icon: RefreshCw   }],
  cancelled: [{ label: 'Reactivar',         estado: 'pending',    icon: RefreshCw   }],
  refunded:  [{ label: 'Reactivar',         estado: 'paid',       icon: RefreshCw   }],
};

function formatMonto(monto: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(monto);
}

function formatFecha(fecha: string) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export function PagoCard({ pago, compact = false }: PagoCardProps) {
  const [loading,       setLoading]       = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [newAmount,     setNewAmount]     = useState(String(pago.amount));
  const [newMethod,     setNewMethod]     = useState<PaymentMethod>(pago.paymentMethod);
  const [newNotes,      setNewNotes]      = useState(pago.notes ?? '');
  const [saving,        setSaving]        = useState(false);
  // undefined = not checked yet, null = no invoice, object = invoice found
  const [linkedInvoice, setLinkedInvoice] = useState<{ id: string; status: string; number: string } | null | undefined>(undefined);
  const [rectResult,    setRectResult]    = useState<{ rectId: string; rectNumber: string } | null>(null);

  const router = useRouter();

  const estadoInfo = PAYMENT_STATUSES[pago.status];
  const metodoInfo = PAYMENT_METHODS[pago.paymentMethod];
  const tipoInfo   = INCOME_TYPES[pago.type];
  const acciones   = ACCIONES[pago.status] ?? [];

  const hoy       = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const esPendienteHistorico = pago.status === 'pending' && pago.date.slice(0, 7) < mesActual;

  const clienteLabel = pago.patientName && pago.patientName !== 'Patient'
    ? pago.patientName
    : pago.type === 'product'
    ? 'Sale directa'
    : 'Sin paciente';

  const matchFac   = pago.concept?.match(/^(FAC-\d{4}-\d{4})/);
  const numFactura = matchFac?.[1];

  const conceptoLimpio = numFactura
    ? pago.concept.replace(`${numFactura} — `, '')
    : pago.concept;

  async function handleCambiarEstado(estado: PaymentStatus) {
    setLoading(true);
    try { await updatePaymentStatus(pago.id, estado); }
    finally { setLoading(false); }
  }

  async function handleEliminar() {
    if (!confirm('¿Eliminar este pago?')) return;
    await deletePayment(pago.id);
  }

  async function openEdit() {
    setNewAmount(String(pago.amount));
    setNewMethod(pago.paymentMethod);
    setNewNotes(pago.notes ?? '');
    setRectResult(null);
    setLinkedInvoice(undefined);
    setEditOpen(true);

    // Async lookup of linked invoice
    const clinicId = await getClinicaId();
    let invoiceId: string | undefined;
    if (pago.consultationId) {
      const consult = await db.consultations.get(pago.consultationId);
      invoiceId = consult?.invoiceId;
    }
    if (!invoiceId) {
      const inv = await db.invoices
        .where('clinicId').equals(clinicId)
        .filter((i) => !i.deletedAt && i.paymentId === pago.id)
        .first();
      invoiceId = inv?.id;
    }
    if (invoiceId) {
      const inv = await db.invoices.get(invoiceId);
      setLinkedInvoice(inv ? { id: inv.id, status: inv.status, number: inv.number } : null);
    } else {
      setLinkedInvoice(null);
    }
  }

  async function handleGuardar() {
    const parsed = parseFloat(newAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      const result = await correctPayment(pago.id, {
        amount: parsed,
        paymentMethod: newMethod !== pago.paymentMethod ? newMethod : undefined,
        notes: newNotes !== (pago.notes ?? '') ? newNotes : undefined,
      });
      if (result.rectificationId) {
        const rectInv = await db.invoices.get(result.rectificationId);
        setRectResult({ rectId: result.rectificationId, rectNumber: rectInv?.number ?? '' });
      } else {
        setEditOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2.5 px-1 border-b border-border last:border-0">
        <span className="text-lg w-6 text-center shrink-0">{tipoInfo?.emoji ?? '💰'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{conceptoLimpio}</p>
          <p className="text-xs text-muted-foreground">
            {clienteLabel} · {formatFecha(pago.date)}
            {numFactura && <span className="ml-1 font-mono opacity-60">{numFactura}</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatMonto(pago.amount)}</p>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', estadoInfo?.color)}>
            {estadoInfo?.label}
          </span>
        </div>
      </div>
    );
  }

  const invoicePaid = linkedInvoice?.status === 'paid';

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
              <p className="font-semibold text-sm leading-snug">{conceptoLimpio}</p>

              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs text-muted-foreground">{clienteLabel}</span>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-xs text-muted-foreground">{formatFecha(pago.date)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                  {tipoInfo?.label ?? pago.type}
                </span>
                {esPendienteHistorico && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-medium border border-amber-500/20">
                    Mes anterior
                  </span>
                )}
              </div>

              {numFactura && (
                <button
                  type="button"
                  onClick={() => router.push('/invoices')}
                  className="mt-1 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors font-mono"
                >
                  <Receipt size={10} />
                  {numFactura}
                </button>
              )}

              {pago.consultationId && (
                <button
                  type="button"
                  onClick={() => router.push(`/consultations/${pago.consultationId}`)}
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
              <p className="text-xl font-bold">{formatMonto(pago.amount)}</p>
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
                <DropdownMenuItem onClick={openEdit}>
                  <Pencil size={14} className="mr-2" /> Corregir monto
                </DropdownMenuItem>
                {acciones.length > 0 && <DropdownMenuSeparator />}
                {acciones.map(({ label, estado, icon: Icon }) => (
                  <DropdownMenuItem key={estado} onClick={() => handleCambiarEstado(estado)}>
                    <Icon size={14} className="mr-2" /> {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
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
          {pago.notes && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground truncate">{pago.notes}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Panel de corrección ──────────────────────────────────────────────── */}
      {editOpen && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">

          {/* Resultado: rectificación creada */}
          {rectResult ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-3 py-2.5">
                <CheckCircle size={14} className="shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="text-xs text-green-700 dark:text-green-300">
                  <p className="font-medium">Corrección aplicada</p>
                  <p className="mt-0.5">
                    Factura original anulada. Se creó{' '}
                    <strong>{rectResult.rectNumber}</strong> en estado Pendiente.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditOpen(false)}>
                  Cerrar
                </Button>
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => router.push(`/invoices/${rectResult.rectId}`)}>
                  <ExternalLink size={13} /> Ver nueva factura
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">Corregir monto</p>

              {/* Invoice status hint */}
              {linkedInvoice === undefined && (
                <p className="text-xs text-muted-foreground">Verificando factura vinculada…</p>
              )}
              {invoicePaid && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5">
                  <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    La factura vinculada ya fue cobrada. Al guardar se anulará automáticamente
                    y se creará una nueva en estado <strong>Pendiente</strong> con el monto corregido.
                  </p>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium mb-1">Monto (C$)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary"
                    autoFocus
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium mb-1">Método de pago</label>
                  <select
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary"
                  >
                    {(Object.entries(PAYMENT_METHODS) as [PaymentMethod, { label: string }][]).map(([val, { label }]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1">Notas</label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Motivo de la corrección…"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={saving || !newAmount || parseFloat(newAmount) <= 0 || linkedInvoice === undefined}
                  onClick={handleGuardar}
                >
                  {saving
                    ? <><Loader2 size={13} className="mr-1.5 animate-spin" /> Guardando…</>
                    : invoicePaid ? 'Corregir y anular factura' : 'Guardar corrección'
                  }
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

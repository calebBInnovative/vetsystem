'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, MessageCircle, Smartphone, Landmark, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import {
  clinicPaymentReference, formatMoney, reportErrorMessage, reportManualPayment, whatsappReportLink,
  type PaymentMethodConfig, type ReportPaymentResult,
} from '@/lib/billing/manual-payments';
import { cn } from '@/lib/utils';

function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
      }}
      className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold hover:text-primary"
      aria-label={`Copiar ${label}`}
    >
      {value}
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} className="opacity-50" />}
    </button>
  );
}

/**
 * Pay by bank transfer or Kash, then report it. The clinic keeps working
 * (provisional grace) while the platform owner confirms the money arrived.
 */
export function ManualPaymentPanel({ onDone }: { onDone?: () => void }) {
  const { session } = useAuth();
  const config = useBillingConfig();
  const methods = useMemo(
    () => (config?.methods ?? []).filter((m) => m.enabled && m.account && config?.prices[m.currency]),
    [config],
  );

  const [methodId, setMethodId] = useState<string>('');
  const [payerReference, setPayerReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayLocal);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReportPaymentResult | null>(null);

  useEffect(() => {
    if (!methodId && methods.length > 0) setMethodId(methods[0].id);
  }, [methods, methodId]);

  if (!session) return null;
  if (config === null) {
    return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }
  if (methods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Los pagos por transferencia aún no están configurados. Contacta a soporte de VetSystem.
      </p>
    );
  }

  const method: PaymentMethodConfig = methods.find((m) => m.id === methodId) ?? methods[0];
  const amount = config.prices[method.currency] ?? 0;
  const reference = clinicPaymentReference(session.clinicId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await reportManualPayment({ methodId: method.id, payerReference: payerReference.trim(), paidOn, note: note.trim() || undefined });
      setResult(res);
      toast.success('Pago reportado. Tu acceso sigue activo mientras lo confirmamos.');
    } catch (err) {
      toast.error(reportErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (result) {
    const whatsapp = whatsappReportLink(config.ownerWhatsapp, {
      clinicName: session.clinicName, number: result.number, methodLabel: method.label,
      amount: result.amount, currency: result.currency, payerReference,
    });
    return (
      <div className="space-y-4 text-center py-2">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center mx-auto">
          <Check size={22} className="text-green-600" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">Pago reportado · {result.number}</p>
          <p className="text-sm text-muted-foreground">
            {result.graceUntil
              ? `Tu acceso queda activo hasta el ${new Date(result.graceUntil).toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })} mientras confirmamos la transferencia.`
              : 'Confirmaremos la transferencia y activaremos tu suscripción.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90">
              <MessageCircle size={15} /> Avisar por WhatsApp
            </a>
          )}
          {onDone && <Button variant="outline" onClick={onDone}>Listo</Button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* 1 · How to pay */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Elige cómo pagar</p>
        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => (
            <button key={m.id} type="button" onClick={() => setMethodId(m.id)}
              className={cn('rounded-xl border px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors',
                m.id === method.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
              {m.type === 'kash' ? <Smartphone size={14} /> : <Landmark size={14} />} {m.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Monto</span>
            <span className="font-semibold">{formatMoney(amount, method.currency)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">{method.type === 'kash' ? 'Celular Kash' : `Cuenta ${method.label} (${method.currency})`}</span>
            <CopyValue value={method.account} label="cuenta" /></div>
          {method.holder && (
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Titular</span>
              <span className="font-medium text-right">{method.holder}</span></div>
          )}
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Descripción / concepto</span>
            <CopyValue value={reference} label="referencia" /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          Escribe <strong>{reference}</strong> en la descripción de la transferencia para identificar tu pago.
        </p>
      </div>

      {/* 2 · Report it */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Reporta tu pago</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">N.º de comprobante</span>
            <input required value={payerReference} onChange={(e) => setPayerReference(e.target.value)} maxLength={64}
              placeholder="Ej: 12345678"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Fecha del pago</span>
            <input required type="date" value={paidOn} max={todayLocal()} onChange={(e) => setPaidOn(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">Nota <span className="text-muted-foreground font-normal">(opcional)</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>
      </div>

      <Button type="submit" disabled={sending || !payerReference.trim()} className="w-full gap-2">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Ya pagué — reportar pago
      </Button>
    </form>
  );
}

/** Full-screen modal for the panel. Sits above the license lock screen (z-[99999]). */
export function ManualPaymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-background rounded-t-2xl sm:rounded-2xl border border-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pagar por transferencia o Kash">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Pagar por transferencia o Kash</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sin comisiones. Confirmamos tu pago manualmente.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <ManualPaymentPanel onDone={onClose} />
      </div>
    </div>
  );
}

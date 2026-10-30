'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Bell, BellRing, Check, Clock, Landmark, Loader2, Save, Smartphone, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import {
  PUSH_SETUP_MESSAGES, PUSH_SUPPORTED_KEY, enableOwnerPush, formatMoney, needsHomeScreenInstall, reviewManualPayment, sendOwnerTestPush,
  saveBillingConfig, subscribeBillingConfig, subscribeInvoicesByStatus,
  type BillingConfig, type InvoiceStatus, type PaymentCurrency, type SubscriptionInvoice,
} from '@/lib/billing/manual-payments';
import { cn } from '@/lib/utils';

type Tab = InvoiceStatus | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending',   label: 'Por confirmar' },
  { key: 'confirmed', label: 'Confirmados'   },
  { key: 'rejected',  label: 'Rechazados'    },
  { key: 'config',    label: 'Configuración' },
];

function when(ms: number) {
  return new Date(ms).toLocaleString('es-NI', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function PaymentsAdminPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const platformOwner = isPlatformOwner(session?.email);

  const [tab, setTab] = useState<Tab>('pending');
  const [invoices, setInvoices] = useState<SubscriptionInvoice[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !platformOwner) router.replace('/admin');
  }, [loading, platformOwner, router]);

  // Pending count for the tab badge, always live
  useEffect(() => {
    if (!platformOwner) return;
    return subscribeInvoicesByStatus('pending', (list) => setPendingCount(list.length));
  }, [platformOwner]);

  useEffect(() => {
    if (!platformOwner || tab === 'config') return;
    setInvoices(null);
    return subscribeInvoicesByStatus(tab, setInvoices);
  }, [platformOwner, tab]);

  if (loading || !platformOwner) return null;

  async function decide(invoice: SubscriptionInvoice, decision: 'confirm' | 'reject') {
    let reason: string | undefined;
    if (decision === 'confirm') {
      if (!confirm(`¿Confirmar ${invoice.number} de ${invoice.clinicName} por ${formatMoney(invoice.amount, invoice.currency)}?\n\nSe activarán ${invoice.periodDays} días de suscripción.`)) return;
    } else {
      const answer = prompt(`¿Por qué rechazas ${invoice.number}? (la clínica verá este motivo)`, 'No encontramos la transferencia');
      if (answer === null) return;
      reason = answer;
    }
    setBusyId(invoice.id);
    try {
      const result = await reviewManualPayment(invoice.id, decision, reason);
      toast.success(decision === 'confirm'
        ? `Pago confirmado. ${invoice.clinicName} vence el ${result.newExpirationDate}.`
        : 'Pago rechazado.');
    } catch (err) {
      console.error('[payments] review failed:', err);
      toast.error((err as { message?: string })?.message ?? 'No se pudo guardar la decisión');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push('/admin')} className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Pagos de clínicas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Transferencias y Kash reportados. Revisa tu banca y confirma: la licencia se activa al instante.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PushButton />
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/billing')} className="gap-1.5">
            <BellRing size={14} /> Avisos de cobro
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
            {key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px]">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'config' ? <ConfigForm /> : !invoices ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {tab === 'pending' ? 'No hay pagos por confirmar.' : 'Sin registros.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => (
            <li key={inv.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{inv.clinicName}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{inv.number} · {inv.clinicId}</p>
                </div>
                <p className="text-lg font-bold shrink-0">{formatMoney(inv.amount, inv.currency)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Método</dt>
                <dd className="flex items-center gap-1 font-medium">
                  {inv.methodId === 'kash' ? <Smartphone size={11} /> : <Landmark size={11} />} {inv.methodLabel}
                </dd>
                <dt className="text-muted-foreground">Comprobante</dt><dd className="font-mono font-medium">{inv.payerReference}</dd>
                <dt className="text-muted-foreground">Referencia</dt><dd className="font-mono">{inv.reference}</dd>
                <dt className="text-muted-foreground">Fecha del pago</dt><dd>{inv.paidOn}</dd>
                <dt className="text-muted-foreground">Reportado</dt>
                <dd className="truncate">{when(inv.createdAt)} · {inv.reportedBy.name ?? inv.reportedBy.email ?? '—'}</dd>
                {inv.status === 'pending' && inv.graceUntil && (
                  <><dt className="text-muted-foreground">Acceso provisional</dt>
                    <dd className={cn(inv.graceUntil < Date.now() && 'text-destructive')}>hasta {when(inv.graceUntil)}</dd></>
                )}
                {inv.status === 'confirmed' && (
                  <><dt className="text-muted-foreground">Nuevo vencimiento</dt><dd className="font-medium">{inv.newExpirationDate}</dd></>
                )}
                {inv.status === 'rejected' && (
                  <><dt className="text-muted-foreground">Motivo</dt><dd>{inv.rejectReason ?? '—'}</dd></>
                )}
                {inv.reviewedAt && (
                  <><dt className="text-muted-foreground">Revisado</dt><dd>{when(inv.reviewedAt)}</dd></>
                )}
              </dl>
              {inv.note && <p className="text-xs bg-muted/50 rounded-lg px-3 py-2">“{inv.note}”</p>}
              {inv.status === 'pending' && (
                <div className="flex gap-2">
                  <Button onClick={() => decide(inv, 'confirm')} disabled={busyId === inv.id} className="flex-1 gap-1.5">
                    {busyId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirmar
                  </Button>
                  <Button onClick={() => decide(inv, 'reject')} disabled={busyId === inv.id} variant="outline"
                    className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5">
                    <X size={14} /> Rechazar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Push notifications for this device ──────────────────────────────────────

function PushButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'on'>('idle');
  const [testing, setTesting] = useState(false);

  // Permission already granted: refresh this device's token silently (tokens rotate).
  useEffect(() => {
    try {
      if (!PUSH_SUPPORTED_KEY || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      enableOwnerPush().then((r) => { if (r === 'enabled') setState('on'); }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  async function enable() {
    if (needsHomeScreenInstall()) {
      toast.info('En iPhone: toca Compartir → "Añadir a pantalla de inicio", abre VetSystem desde el ícono y activa push ahí.', { duration: 12_000 });
      return;
    }
    setState('busy');
    try {
      const result = await enableOwnerPush();
      (result === 'enabled' ? toast.success : toast.error)(PUSH_SETUP_MESSAGES[result]);
      setState(result === 'enabled' ? 'on' : 'idle');
    } catch (err) {
      console.error('[payments] push setup failed:', err);
      toast.error('No se pudieron activar las notificaciones');
      setState('idle');
    }
  }

  async function test() {
    setTesting(true);
    toast.info('Prueba enviada: cierra o minimiza la app. Llegará en unos 10 segundos.', { duration: 8000 });
    try {
      const { sent, failed } = await sendOwnerTestPush(10);
      if (sent === 0) toast.error(failed > 0 ? 'No se pudo entregar a ningún dispositivo.' : 'No hay dispositivos con push activo.');
    } catch (err) {
      console.error('[payments] test push failed:', err);
      toast.error('No se pudo enviar la prueba');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <Button variant="outline" size="sm" onClick={enable} disabled={state === 'busy'} className="gap-1.5"
        title="Recibe un aviso en este dispositivo cuando una clínica reporte un pago">
        {state === 'busy' ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
        {state === 'on' ? 'Push activo' : 'Activar push'}
      </Button>
      {state === 'on' && (
        <button type="button" onClick={test} disabled={testing}
          className="text-xs text-primary hover:underline disabled:opacity-60 inline-flex items-center gap-1">
          {testing && <Loader2 size={11} className="animate-spin" />} Enviar prueba
        </button>
      )}
    </div>
  );
}

// ─── Payment instructions shown to clinics ───────────────────────────────────

function ConfigForm() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let first = true;
    // Load once; later remote changes must not overwrite what is being typed.
    return subscribeBillingConfig((c) => { if (first) { setConfig(c); first = false; } });
  }, []);

  if (!config) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;

  const setMethod = (id: string, patch: Partial<BillingConfig['methods'][number]>) =>
    setConfig({ ...config, methods: config.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const setPrice = (currency: PaymentCurrency, value: string) => {
    const amount = Number(value);
    setConfig({ ...config, prices: { ...config.prices, [currency]: value === '' || Number.isNaN(amount) ? undefined : amount } });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    const broken = config.methods.find((m) => m.enabled && (!m.account.trim() || !config.prices[m.currency]));
    if (broken) { toast.error(`${broken.label}: falta el número de cuenta o el precio en ${broken.currency}.`); return; }
    setSaving(true);
    try {
      await saveBillingConfig({ ...config, prices: Object.fromEntries(Object.entries(config.prices).filter(([, v]) => v)) });
      toast.success('Configuración guardada. Las clínicas ya ven los nuevos datos.');
    } catch (err) {
      console.error('[payments] save config failed:', err);
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <p className="font-medium text-sm">Cuentas para recibir pagos</p>
        {config.methods.map((m) => (
          <div key={m.id} className={cn('rounded-xl border p-3 space-y-2', m.enabled ? 'border-primary/40' : 'border-border opacity-80')}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={m.enabled} onChange={(e) => setMethod(m.id, { enabled: e.target.checked })} className="size-4 accent-primary" />
              {m.type === 'kash' ? <Smartphone size={14} /> : <Landmark size={14} />} {m.label}
            </label>
            <div className="grid sm:grid-cols-[1fr_1fr_90px] gap-2">
              <input value={m.account} onChange={(e) => setMethod(m.id, { account: e.target.value })}
                placeholder={m.type === 'kash' ? 'Celular (ej. 8888-0000)' : 'Número de cuenta'} className={INPUT} />
              <input value={m.holder} onChange={(e) => setMethod(m.id, { holder: e.target.value })} placeholder="Titular" className={INPUT} />
              <select value={m.currency} onChange={(e) => setMethod(m.id, { currency: e.target.value as PaymentCurrency })} className={INPUT}>
                <option value="USD">USD</option>
                <option value="NIO">C$</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <p className="font-medium text-sm">Precio por 30 días</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-medium">Dólares (US$)</span>
            <input type="number" min="0" step="0.01" value={config.prices.USD ?? ''} onChange={(e) => setPrice('USD', e.target.value)} className={INPUT} /></label>
          <label className="space-y-1"><span className="text-xs font-medium">Córdobas (C$)</span>
            <input type="number" min="0" step="0.01" value={config.prices.NIO ?? ''} onChange={(e) => setPrice('NIO', e.target.value)} className={INPUT} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Cada cuenta cobra en su moneda. Deja vacío el precio de una moneda que no uses.</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <p className="font-medium text-sm">Confirmación</p>
        <label className="space-y-1 block"><span className="text-xs font-medium flex items-center gap-1"><Clock size={11} /> Días de acceso provisional al reportar</span>
          <input type="number" min="0" max="7" value={config.graceDays} onChange={(e) => setConfig({ ...config, graceDays: Number(e.target.value) })} className={INPUT} /></label>
        <label className="space-y-1 block"><span className="text-xs font-medium">Tu WhatsApp para avisos (con código de país, ej. 50588880000)</span>
          <input value={config.ownerWhatsapp} onChange={(e) => setConfig({ ...config, ownerWhatsapp: e.target.value })} className={INPUT} /></label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={config.cardEnabled} onChange={(e) => setConfig({ ...config, cardEnabled: e.target.checked })} className="size-4 accent-primary" />
          Mostrar también pago con tarjeta (Recurrente)
        </label>
      </div>

      <Button type="submit" disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar configuración
      </Button>
    </form>
  );
}

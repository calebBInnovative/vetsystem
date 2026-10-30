'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, BellRing, CalendarClock, Loader2, Lock, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import {
  listClinicBilling, scheduleBillingNotice, clearBillingNotice, setLicenseExpiration, sendExpiryReminderNow,
  type ClinicBillingRow,
} from '@/lib/billing/billing-notice.service';
import { cn } from '@/lib/utils';

type When = 'now' | 'in5' | 'custom';

function formatAt(at: number) {
  return new Date(at).toLocaleString('es-NI', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Value for <input type="datetime-local"> in the browser's local time. */
function toLocalInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export default function BillingNoticePage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  // The screen is a convenience; firestore.rules is what restricts the writes.
  const platformOwner = isPlatformOwner(session?.email);

  const [rows,     setRows]     = useState<ClinicBillingRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [when,     setWhen]     = useState<When>('in5');
  const [custom,   setCustom]   = useState(() => toLocalInput(Date.now() + 60 * 60_000));
  const [blocking, setBlocking] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [expiry,   setExpiry]   = useState(() => toLocalInput(Date.now() + 86_400_000).slice(0, 10));
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!loading && !platformOwner) router.replace('/admin');
  }, [loading, platformOwner, router]);

  const load = useCallback(async () => {
    try {
      setRows(await listClinicBilling());
    } catch (err) {
      console.error('[billing] load failed:', err);
      toast.error('No se pudieron cargar las clínicas');
    }
  }, []);

  useEffect(() => { if (platformOwner) void load(); }, [platformOwner, load]);

  // Re-render every 30 s so "programado" turns into "activo" on screen
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading || !platformOwner) return null;

  const ownClinicId = session?.clinicId;
  const ids = [...selected];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function resolveAt(): number | null {
    if (when === 'now') return Date.now();
    if (when === 'in5') return Date.now() + 5 * 60_000;
    const ms = new Date(custom).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  async function handleSchedule() {
    const at = resolveAt();
    if (at === null) { toast.error('Fecha y hora no válidas'); return; }
    const kind = blocking ? 'BLOQUEO (deberán pagar para seguir)' : 'aviso (podrán cerrarlo)';
    if (!confirm(`¿Programar ${kind} para ${ids.length} clínica(s) el ${formatAt(at)}?`)) return;
    setBusy(true);
    try {
      await scheduleBillingNotice(ids, { at, blocking });
      toast.success(`Cobro programado para ${ids.length} clínica(s) — ${formatAt(at)}`);
      setSelected(new Set());
      await load();
    } catch (err) {
      console.error('[billing] schedule failed:', err);
      toast.error('No se pudo programar el cobro');
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!confirm(`¿Quitar el aviso de cobro de ${ids.length} clínica(s)?`)) return;
    setBusy(true);
    try {
      await clearBillingNotice(ids);
      toast.success('Aviso quitado');
      setSelected(new Set());
      await load();
    } catch (err) {
      console.error('[billing] clear failed:', err);
      toast.error('No se pudo quitar el aviso');
    } finally {
      setBusy(false);
    }
  }

  async function handleExpiry() {
    if (!confirm(`¿Cambiar el vencimiento de ${ids.length} clínica(s) al ${expiry}?`)) return;
    setBusy(true);
    try {
      await setLicenseExpiration(ids, expiry);
      toast.success(`Vencimiento cambiado al ${expiry} para ${ids.length} clínica(s)`);
      await load();
    } catch (err) {
      console.error('[billing] expiry change failed:', err);
      toast.error('No se pudo cambiar el vencimiento');
    } finally {
      setBusy(false);
    }
  }

  async function handleReminder() {
    setBusy(true);
    try {
      const results = await sendExpiryReminderNow(ids);
      const sent = results.reduce((n, r) => n + r.sent, 0);
      const noDevice = results.filter((r) => !r.skipped && r.sent === 0).length;
      const notDue = results.filter((r) => r.skipped === 'no-reminder').length;
      if (sent > 0) toast.success(`Recordatorio enviado a ${sent} dispositivo(s).`);
      if (noDevice > 0) toast.info(`${noDevice} clínica(s) no tienen avisos activados en ningún dispositivo.`);
      if (notDue > 0) toast.info(`${notDue} clínica(s) no vencen en los próximos 3 días: no se envió nada.`);
    } catch (err) {
      console.error('[billing] reminder failed:', err);
      toast.error('No se pudo enviar el recordatorio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push('/admin')}
          className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Avisos de cobro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Decide cuándo cada clínica ve el cobro. Les llega en vivo, sin recargar, y desaparece
            solo cuando pagan.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
          <RefreshCw size={13} /> Actualizar
        </Button>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">¿Cuándo?</p>
          <div className="flex flex-wrap gap-2">
            {([['now', 'Ahora'], ['in5', 'En 5 minutos'], ['custom', 'Fecha y hora']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setWhen(key)}
                className={cn('px-3 py-1.5 rounded-xl border text-sm transition-colors',
                  when === key ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
          {when === 'custom' && (
            <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">¿Qué verán?</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => setBlocking(false)}
              className={cn('text-left rounded-xl border p-3 transition-colors',
                !blocking ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
              <span className="flex items-center gap-1.5 text-sm font-medium"><BellRing size={14} /> Aviso</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Banner con botón de pago. Pueden cerrarlo y seguir trabajando.</span>
            </button>
            <button type="button" onClick={() => setBlocking(true)}
              className={cn('text-left rounded-xl border p-3 transition-colors',
                blocking ? 'border-destructive bg-destructive/10' : 'border-border hover:bg-muted')}>
              <span className="flex items-center gap-1.5 text-sm font-medium"><Lock size={14} /> Bloqueo</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Pantalla de pago. No pueden usar la app hasta pagar.</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleSchedule} disabled={busy || ids.length === 0} className="gap-2 flex-1">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
            Programar cobro ({ids.length})
          </Button>
          <Button onClick={handleClear} variant="outline" disabled={busy || ids.length === 0} className="gap-2">
            <X size={14} /> Quitar aviso ({ids.length})
          </Button>
        </div>
      </div>

      {/* ── Expiration and reminders ─────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5"><CalendarClock size={14} /> Vencimiento y recordatorios</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Las clínicas reciben un recordatorio automático 3 días antes, un día antes y el día que vencen
            (9:00 a. m.), en los dispositivos donde activaron los avisos.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button onClick={handleExpiry} variant="outline" disabled={busy || ids.length === 0} className="gap-2 flex-1">
            <CalendarClock size={14} /> Cambiar vencimiento ({ids.length})
          </Button>
          <Button onClick={handleReminder} variant="outline" disabled={busy || ids.length === 0} className="gap-2 flex-1">
            <Send size={14} /> Enviar recordatorio ahora ({ids.length})
          </Button>
        </div>
      </div>

      {/* ── Clinics ──────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40 text-xs">
          <span className="text-muted-foreground">{rows ? `${rows.length} clínicas` : 'Cargando…'}</span>
          {rows && (
            <button type="button" className="font-medium text-primary hover:underline"
              onClick={() => setSelected(new Set(rows.filter((r) => r.id !== ownClinicId).map((r) => r.id)))}>
              Seleccionar todas menos la mía
            </button>
          )}
        </div>

        {!rows ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No hay clínicas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const due = row.notice !== null && row.notice.at <= Date.now();
              return (
                <li key={row.id}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                      className="size-4 accent-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {row.name}
                        {row.id === ownClinicId && <span className="ml-1.5 text-xs text-muted-foreground">(tu clínica)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {row.id} · {row.plan ?? 'sin licencia'} · vence {row.expirationDate ?? '—'}
                      </p>
                    </div>
                    {row.notice && (
                      <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium',
                        due
                          ? (row.notice.blocking ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300')
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400')}>
                        {row.notice.blocking ? <Lock size={10} /> : <BellRing size={10} />}
                        {due ? 'Activo' : formatAt(row.notice.at)}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

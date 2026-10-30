'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LICENSE_MESSAGES, estaBloquada } from '@/lib/license/license.service';
import { useSubscription, SUBSCRIPTION_PLAN } from '@/hooks/useSubscription';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { ManualPaymentModal } from '@/components/billing/ManualPaymentPanel';
import { EnableRemindersButton } from '@/components/billing/EnableRemindersButton';
import { nextLocalMidnight, useSnooze } from '@/hooks/useSnooze';
import { WifiOff, AlertTriangle, Lock, CreditCard, X, Loader2, Landmark, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LicenseMode } from '@/types/license';

/** Days before expiration when the renewal notice starts showing. */
const EXPIRY_NOTICE_DAYS = 5;

/**
 * How long a closed payment banner stays away. Early on it comes back the next
 * day; on the last day (and for an owner's billing notice) every few hours, so
 * closing it once cannot hide the deadline until the app locks.
 */
const URGENT_SNOOZE_MS = 4 * 60 * 60_000;
function expirySnoozeUntil(daysLeft: number, now = Date.now()): number {
  return daysLeft <= 1 ? now + URGENT_SNOOZE_MS : nextLocalMidnight(now);
}

const ICONS: Partial<Record<LicenseMode, React.FC<{ size?: number; className?: string }> | null>> = {
  soft_warning: WifiOff,
  hard_warning: AlertTriangle,
  read_only:    Lock,
  blocked:      Lock,
  expired:      CreditCard,
  normal:       null,
};

const STRIP_BUTTON = 'shrink-0 flex items-center gap-1 px-3 py-1 rounded-lg bg-current/10 hover:bg-current/20 font-medium text-xs transition-colors disabled:opacity-60';

/**
 * Ways to pay: bank transfer / Kash (always), card checkout only when the
 * platform owner enables it in /admin/payments.
 */
function PayButtons({ variant, onTransfer }: { variant: 'strip' | 'lock'; onTransfer: () => void }) {
  const config = useBillingConfig();
  const { startCheckout, loading } = useSubscription();
  const card = config?.cardEnabled === true;

  if (variant === 'strip') {
    return (
      <>
        <button type="button" onClick={onTransfer} className={STRIP_BUTTON}>
          <Landmark size={11} /> Pagar {SUBSCRIPTION_PLAN.priceLabel}
        </button>
        {card && (
          <button type="button" onClick={startCheckout} disabled={loading} className={STRIP_BUTTON}>
            {loading ? <Loader2 size={11} className="animate-spin" /> : <CreditCard size={11} />}
            {loading ? 'Redirigiendo…' : 'Tarjeta'}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 mt-2">
      <button type="button" onClick={onTransfer}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
        <Landmark size={14} /> Pagar por transferencia o Kash
      </button>
      {card && (
        <button type="button" onClick={startCheckout} disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-70">
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Redirigiendo…</>
            : <><CreditCard size={14} /> Pagar con tarjeta</>}
        </button>
      )}
    </div>
  );
}

export function LicenseBanner() {
  const { license, session } = useAuth();
  const [closed, setClosed] = useState(false);
  const [paying, setPaying] = useState(false);

  const { mode, daysOffline, daysUntilExpiry, billingDue, inGrace } = license;

  // Keyed by the deadline: a new expiration date or notice shows again at once.
  const clinicKey = session && !session.isDemo ? session.clinicId : null;
  const [noticeSnoozed, snoozeNotice] = useSnooze(clinicKey && session?.billingNoticeAt ? `notice-${clinicKey}-${session.billingNoticeAt}` : null);
  const [expirySnoozed, snoozeExpiry] = useSnooze(clinicKey ? `expiry-${clinicKey}-${session?.expirationDate}` : null);
  const modal = <ManualPaymentModal open={paying} onClose={() => setPaying(false)} />;
  const openTransfer = () => setPaying(true);

  // Payment reported, waiting for the owner to confirm it: access is provisional
  if (inGrace && mode !== 'blocked') {
    const until = session?.graceUntil
      ? new Date(session.graceUntil).toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })
      : '';
    // The modal stays mounted: reporting a payment flips the license into this
    // state live, and the clinic must still see the confirmation it opened.
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b text-sm bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
          <Clock size={14} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">Pago en revisión</span>
            <span className="opacity-80"> — confirmaremos tu transferencia pronto. Tu acceso sigue activo{until ? ` hasta el ${until}` : ''}.</span>
          </div>
        </div>
        {modal}
      </>
    );
  }

  // Billing notice scheduled by the platform owner (non-blocking variant).
  // Closing it snoozes it for a few hours (see URGENT_SNOOZE_MS), never for good.
  if (billingDue && mode !== 'expired' && mode !== 'blocked') {
    if (noticeSnoozed) return modal;
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b text-sm bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
          <CreditCard size={14} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">Activa tu suscripción</span>
            <span className="opacity-80"> — {SUBSCRIPTION_PLAN.priceLabel} por {SUBSCRIPTION_PLAN.durationDays} días para seguir usando VetSystem.</span>
          </div>
          <PayButtons variant="strip" onTransfer={openTransfer} />
          <button type="button" onClick={() => snoozeNotice(Date.now() + URGENT_SNOOZE_MS)} title="Ocultar por 4 horas"
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
        {modal}
      </>
    );
  }

  // Expiring soon — the only banner a healthy, online clinic ever sees
  if (mode === 'normal') {
    if (expirySnoozed || daysUntilExpiry === null || daysUntilExpiry > EXPIRY_NOTICE_DAYS) return modal;
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b text-sm bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
          <CreditCard size={14} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">
              {session?.plan === 'Trial' ? 'Tu prueba gratis vence' : 'Tu suscripción vence'}{' '}
              {daysUntilExpiry === 0 ? 'hoy' : daysUntilExpiry === 1 ? 'mañana' : `en ${daysUntilExpiry} días`}
            </span>
            <span className="opacity-80">
              {session?.plan === 'Trial'
                ? ` — activa tu plan (${SUBSCRIPTION_PLAN.priceLabel} por ${SUBSCRIPTION_PLAN.durationDays} días) para seguir usando VetSystem.`
                : ' — renueva para no perder el acceso. Los días se suman a tu fecha actual.'}
            </span>
          </div>
          <EnableRemindersButton variant="strip" />
          <PayButtons variant="strip" onTransfer={openTransfer} />
          <button type="button" onClick={() => snoozeExpiry(expirySnoozeUntil(daysUntilExpiry))}
            title={daysUntilExpiry <= 1 ? 'Ocultar por 4 horas' : 'Ocultar hasta mañana'}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
        {modal}
      </>
    );
  }
  if (closed && (mode === 'soft_warning' || mode === 'hard_warning')) return modal;

  // A blocking billing notice reuses the expired lock screen with its own wording
  const info = mode === 'expired' && billingDue
    ? { ...LICENSE_MESSAGES.expired, titulo: 'Activa tu suscripción', desc: `Para seguir usando VetSystem, activa tu plan: ${SUBSCRIPTION_PLAN.priceLabel} por ${SUBSCRIPTION_PLAN.durationDays} días.` }
    : LICENSE_MESSAGES[mode];
  const Icon   = ICONS[mode] ?? null;
  const blocked = estaBloquada(mode);

  const colors: Record<string, string> = {
    amber:  'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300',
    orange: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-700 dark:text-orange-300',
    red:    'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300',
  };

  // Blocking banner — covers the entire screen
  if (blocked) {
    return (
      <>
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="max-w-sm mx-4 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              {Icon && <Icon size={28} className="text-destructive" />}
            </div>
            <h2 className="text-xl font-bold">{info.titulo}</h2>
            <p className="text-muted-foreground text-sm">{info.desc}</p>
            {daysOffline === -1 && (
              <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                Se detectó una modificación en la fecha del sistema.
              </p>
            )}
            {mode === 'expired'
              ? <PayButtons variant="lock" onTransfer={openTransfer} />
              : <p className="text-xs text-muted-foreground">Conéctate a internet para continuar.</p>}
          </div>
        </div>
        {modal}
      </>
    );
  }

  // Warning banner — top strip
  const showCheckout = mode === 'read_only' || mode === 'hard_warning';

  return (
    <>
      <div className={cn(
        'flex items-center gap-3 px-4 py-2.5 border-b text-sm',
        colors[info.color],
      )}>
        {Icon && <Icon size={14} className="shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-medium">{info.titulo}</span>
          {' — '}
          <span className="opacity-80">{info.desc}</span>
          {daysOffline > 0 && (
            <span className="ml-2 text-xs opacity-60">({daysOffline} días offline)</span>
          )}
        </div>
        {showCheckout && <PayButtons variant="strip" onTransfer={openTransfer} />}
        <button
          type="button"
          onClick={() => setClosed(true)}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      {modal}
    </>
  );
}

/**
 * Wrapper that disables interactions when mode is read_only.
 * Use around forms or action buttons.
 */
export function ReadOnlyGuard({ children }: { children: React.ReactNode }) {
  const { license } = useAuth();

  if (license.mode !== 'read_only') return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-50">{children}</div>
      <div className="absolute inset-0 cursor-not-allowed" title="Modo solo lectura activo" />
    </div>
  );
}

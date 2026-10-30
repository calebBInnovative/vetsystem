'use client';

import { CreditCard, Landmark } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_PLAN } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

/** Days before expiration when the header starts warning. */
export const HEADER_NOTICE_DAYS = 3;

export interface SubscriptionExpiry {
  /** Whole days left: 0 = expires today */
  days:          number;
  isTrial:       boolean;
  expirationDate: string;
  lastPaymentAt?: number;
  /** Only clinic managers can report a payment (reportManualPayment checks the role) */
  canPay:        boolean;
}

/**
 * Expiry state for the header, derived from the session cached in Dexie — so it
 * keeps counting down offline, including in the offline-warning modes where the
 * top banner shows the connection warning instead.
 */
export function useSubscriptionExpiry(): SubscriptionExpiry | null {
  const { session, license } = useAuth();
  if (!session || session.isDemo) return null;
  // Payment reported and awaiting review, or already locked: other UI covers these.
  if (license.inGrace || license.mode === 'expired' || license.mode === 'blocked') return null;
  const days = license.daysUntilExpiry;
  if (days === null || days < 0 || days > HEADER_NOTICE_DAYS) return null;
  return {
    days,
    isTrial:        session.plan === 'Trial',
    expirationDate: session.expirationDate,
    lastPaymentAt:  session.lastPaymentAt,
    canPay:         session.role === 'master' || session.role === 'admin',
  };
}

function whenLabel(days: number): string {
  return days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
}

function formatDate(value: string | number): string {
  // A YYYY-MM-DD string is a calendar date: parse it as local, not UTC midnight.
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tone(days: number): string {
  return days <= 1
    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
}

/** Always-visible pill next to the bell. Managers open the payment modal from it. */
export function SubscriptionExpiryChip({ expiry, onPay }: { expiry: SubscriptionExpiry; onPay: () => void }) {
  const label = `${expiry.isTrial ? 'Prueba' : 'Plan'} vence ${whenLabel(expiry.days)}`;
  return (
    <button
      type="button"
      onClick={expiry.canPay ? onPay : undefined}
      disabled={!expiry.canPay}
      title={expiry.canPay ? 'Pagar suscripción' : 'Avisa al administrador de la clínica para renovar'}
      className={cn(
        'flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-opacity',
        expiry.canPay ? 'hover:opacity-80' : 'cursor-default',
        tone(expiry.days),
      )}
    >
      <CreditCard size={12} className="shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{expiry.days === 0 ? 'Hoy' : `${expiry.days}d`}</span>
    </button>
  );
}

/** Section at the top of the bell popover, with the details and the pay action. */
export function SubscriptionExpiryBellItem({ expiry, onPay }: { expiry: SubscriptionExpiry; onPay: () => void }) {
  return (
    <>
      <li className="px-4 py-1.5 bg-muted/40">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Suscripción</p>
      </li>
      <li className="px-4 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {expiry.isTrial ? 'Tu prueba gratis vence' : 'Tu suscripción vence'} {whenLabel(expiry.days)}
          </p>
          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0', tone(expiry.days))}>
            {expiry.days === 0 ? 'Hoy' : `${expiry.days}d`}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Vence el {formatDate(expiry.expirationDate)}
          {expiry.lastPaymentAt ? ` · Último pago: ${formatDate(expiry.lastPaymentAt)}` : ''}
        </p>
        {expiry.canPay ? (
          <button type="button" onClick={onPay}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
            <Landmark size={11} /> Pagar {SUBSCRIPTION_PLAN.priceLabel} →
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground">Avisa al administrador de la clínica para renovar.</p>
        )}
      </li>
    </>
  );
}

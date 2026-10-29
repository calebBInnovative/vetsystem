'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import { formatMoney, subscribeInvoicesByStatus } from '@/lib/billing/manual-payments';

/**
 * While the platform owner has the app open, every newly reported payment pops
 * a toast (and a system notification if the tab is in the background). Web push
 * covers the case where the app is closed — see enableOwnerPush().
 */
export function OwnerPaymentAlerts() {
  const router = useRouter();
  const { session } = useAuth();
  const owner = isPlatformOwner(session?.email);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!owner) return;
    return subscribeInvoicesByStatus('pending', (invoices) => {
      // First snapshot: remember what already existed, alert only on what comes after.
      if (seen.current === null) {
        seen.current = new Set(invoices.map((i) => i.id));
        return;
      }
      for (const inv of invoices) {
        if (seen.current.has(inv.id)) continue;
        seen.current.add(inv.id);
        const body = `${inv.clinicName} · ${formatMoney(inv.amount, inv.currency)} · ${inv.methodLabel}`;
        toast.info('Nuevo pago por confirmar', {
          description: body,
          action: { label: 'Ver', onClick: () => router.push('/admin/payments') },
          duration: 15_000,
        });
        try {
          if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Nuevo pago por confirmar', { body, tag: `invoice-${inv.id}` });
          }
        } catch { /* some browsers only allow notifications from the service worker */ }
      }
    }, 20);
  }, [owner, router]);

  return null;
}

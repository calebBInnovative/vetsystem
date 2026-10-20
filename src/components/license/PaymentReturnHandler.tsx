'use client';

import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { getFirebaseFunctions } from '@/lib/firebase/firebase.config';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentStatusResult {
  status: 'created' | 'pending' | 'paid' | 'failed' | 'cancelled';
  mode: 'mock' | 'live';
}

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 3000;

/**
 * Recurrente sends the buyer back to /dashboard/?suscripcion=ok|cancelada&pago=<id>.
 * The webhook is what renews the license; this only tells the user how it went,
 * asks the server to reconcile a payment still marked pending, and reloads the
 * session once it is paid so the lock screen goes away without a re-login.
 */
export function PaymentReturnHandler() {
  const { firebaseUser, retrySession } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !firebaseUser) return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('suscripcion');
    const paymentId = params.get('pago');
    if (!outcome || !paymentId) return;
    handled.current = true;

    // Drop the query so a reload does not repeat the check.
    params.delete('suscripcion');
    params.delete('pago');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));

    if (outcome !== 'ok') {
      toast.info('Pago cancelado. No se realizó ningún cobro.');
      return;
    }

    const getStatus = httpsCallable<{ paymentId: string; refresh: boolean }, PaymentStatusResult>(
      getFirebaseFunctions(),
      'getRecurrentePaymentStatus',
    );
    const toastId = toast.loading('Confirmando tu pago…');

    // Not cancelled on cleanup: under StrictMode the effect runs twice and the
    // `handled` guard would leave nobody polling. It lives as long as the shell.

    (async () => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        try {
          const { data } = await getStatus({ paymentId, refresh: true });
          if (data.status === 'paid') {
            if (data.mode === 'mock') {
              toast.success('Pago de prueba confirmado. En modo de prueba la licencia no cambia.', { id: toastId });
            } else {
              retrySession();
              toast.success('¡Pago confirmado! Tu suscripción fue renovada.', { id: toastId });
            }
            return;
          }
          if (data.status === 'failed' || data.status === 'cancelled') {
            toast.error('El pago no se completó. No se realizó ningún cobro.', { id: toastId });
            return;
          }
        } catch (err) {
          console.error('[PaymentReturnHandler] status check failed:', err);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      toast.info('Tu pago se está procesando. La suscripción se actualizará en unos minutos.', { id: toastId });
    })();
  }, [firebaseUser, retrySession]);

  return null;
}

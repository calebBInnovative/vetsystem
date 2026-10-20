'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '@/lib/firebase/firebase.config';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * What the UI shows about the plan. The amount actually charged comes only from
 * functions/src/payments/recurrente/recurrente.plans.ts — keep this label in step.
 */
export const SUBSCRIPTION_PLAN = {
  id:           'monthly',
  name:         'Plan Mensual',
  priceLabel:   'US$20',
  durationDays: 30,
} as const;

// The price is decided by the server from planId — the client never sends an amount.
interface CreateCheckoutData {
  planId: 'monthly';
  returnOrigin: string;
}

interface CreateCheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  mode: 'mock' | 'live';
  status: string;
  reused: boolean;
}

export function useSubscription() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (session?.isDemo) {
      toast.info('En el modo demo no se realizan pagos.');
      return;
    }
    if (!session?.clinicId) {
      toast.error('No se pudo identificar la clínica. Inicia sesión nuevamente.');
      return;
    }

    setLoading(true);
    try {
      const fn = httpsCallable<CreateCheckoutData, CreateCheckoutResult>(
        getFirebaseFunctions(),
        'createRecurrenteCheckout',
      );

      // Clinic and amount are resolved server-side from the signed-in user.
      const result = await fn({ planId: 'monthly', returnOrigin: window.location.origin });

      if (result.data.mode === 'mock') {
        toast.info('Modo de prueba: no se realizará ningún cobro real.');
      }

      // Redirect to Recurrente hosted checkout (or back to the app in mock mode)
      window.location.href = result.data.checkoutUrl;
    } catch (err) {
      console.error('[useSubscription] createCheckout error:', err);
      toast.error('No se pudo iniciar el pago. Intenta de nuevo.');
      setLoading(false);
    }
    // Note: setLoading(false) is intentionally omitted on success
    // because the page will redirect away.
  }

  return { startCheckout, loading };
}

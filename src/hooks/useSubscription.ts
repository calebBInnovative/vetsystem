'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '@/lib/firebase/firebase.config';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CreateCheckoutData {
  clinicId: string;
  successUrl: string;
  cancelUrl: string;
}

interface CreateCheckoutResult {
  checkoutUrl: string;
}

export function useSubscription() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (!session?.clinicId) {
      toast.error('No se pudo identificar la clínica. Inicia sesión nuevamente.');
      return;
    }

    setLoading(true);
    try {
      const fn = httpsCallable<CreateCheckoutData, CreateCheckoutResult>(
        getFirebaseFunctions(),
        'createCheckout',
      );

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const result = await fn({
        clinicId:   session.clinicId,
        successUrl: `${origin}/dashboard?suscripcion=ok`,
        cancelUrl:  `${origin}/dashboard?suscripcion=cancelada`,
      });

      // Redirect to Recurrente hosted checkout
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

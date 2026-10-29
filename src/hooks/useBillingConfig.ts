'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeBillingConfig, type BillingConfig } from '@/lib/billing/manual-payments';

/** Live payment instructions (platform/billing). `config` is null while loading or offline. */
export function useBillingConfig(): BillingConfig | null {
  const { firebaseUser, session } = useAuth();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const enabled = !!firebaseUser && session?.isDemo !== true;

  useEffect(() => {
    if (!enabled) return;
    return subscribeBillingConfig(setConfig);
  }, [enabled]);

  return enabled ? config : null;
}

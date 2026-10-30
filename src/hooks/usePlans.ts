'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribePlans, type PlanCatalog } from '@/lib/billing/plans';

/** Live plan catalog (platform/plans). null while loading, offline, or in demo mode. */
export function usePlans(): PlanCatalog | null {
  const { firebaseUser, session } = useAuth();
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const enabled = !!firebaseUser && session?.isDemo !== true;

  useEffect(() => {
    if (!enabled) return;
    return subscribePlans(setCatalog);
  }, [enabled]);

  return enabled ? catalog : null;
}

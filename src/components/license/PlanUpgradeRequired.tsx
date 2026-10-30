'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_MODULE_LABELS } from '@/lib/billing/plans';
import { PLAN_TAB_HREF } from '@/components/license/SubscriptionExpiryAlert';
import type { AppModule } from '@/types/license';

/** Shown instead of a page whose module the clinic's plan does not include. */
export function PlanUpgradeRequired({ module }: { module: AppModule }) {
  const { session } = useAuth();
  const canChange = session?.role === 'master' || session?.role === 'admin';
  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Lock size={24} className="text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">{PLAN_MODULE_LABELS[module]} no está en tu plan</h1>
      <p className="text-sm text-muted-foreground">
        Tus datos siguen guardados. Cambia a un plan que incluya este módulo para volver a usarlo.
      </p>
      {canChange ? (
        <Link href={PLAN_TAB_HREF}
          className="inline-flex items-center justify-center px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
          Ver planes
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Pide al administrador de la clínica que cambie el plan.</p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PLANS, PLAN_IDS, canPreviewPlans, planIdOf, type PlanId } from '@/lib/billing/plans';
import { setPlanPreview } from '@/lib/billing/planPreview';
import { cn } from '@/lib/utils';

/**
 * "See it as" plan picker. In the demo it lives in the demo banner and lets a
 * visitor try each plan; for the platform owner it is a bar shown while a
 * preview is on. It only changes what this device shows, never the license.
 */
export function PlanPreviewSwitcher({ variant }: { variant: 'demo' | 'owner' }) {
  const { session, refreshFromDexie } = useAuth();
  const [busy, setBusy] = useState<PlanId | 'off' | null>(null);
  if (!session || !canPreviewPlans(session)) return null;

  const preview = session.planPreview;
  if (variant === 'owner' && (!preview || session.isDemo)) return null;
  const current: PlanId = preview?.planId ?? (session.isDemo ? 'clinic' : planIdOf(session.plan));

  async function choose(planId: PlanId | null) {
    setBusy(planId ?? 'off');
    try {
      await setPlanPreview(planId);
      await refreshFromDexie();
      if (planId === null) toast.success('Volviste a tu plan');
      else toast.success(`Ahora ves el sistema como plan ${DEFAULT_PLANS[planId].name}`);
    } catch (err) {
      console.error('[billing] plan preview failed:', err);
      toast.error('No se pudo cambiar la vista del plan');
    } finally {
      setBusy(null);
    }
  }

  const pills = (
    <div className="inline-flex rounded-lg bg-background/70 p-0.5 ring-1 ring-border" role="radiogroup" aria-label="Plan">
      {PLAN_IDS.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={current === id} disabled={busy !== null}
          onClick={() => current !== id && choose(id)}
          className={cn('flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors',
            current === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {busy === id && <Loader2 size={11} className="animate-spin" />}
          {preview?.planId === id ? preview.name : DEFAULT_PLANS[id].name}
        </button>
      ))}
    </div>
  );

  if (variant === 'demo') {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-xs text-amber-700 dark:text-amber-400">Ver como plan</span>
        {pills}
        <Link href="/register" className="hidden md:inline text-xs font-semibold text-primary hover:underline">
          Quiero este plan
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-violet-500/10 border-b border-violet-500/20 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <span className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-300">
        <Eye size={13} />
        Vista previa del plan {preview?.name}: así ve el sistema una clínica con este plan. Tu licencia no cambia.
      </span>
      <div className="flex items-center gap-3">
        {pills}
        <button type="button" disabled={busy !== null} onClick={() => choose(null)}
          className="flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:underline">
          {busy === 'off' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Volver a mi plan
        </button>
      </div>
    </div>
  );
}

/** Owner menu entry: starts a preview (Básico first, the most limited). */
export function StartPlanPreviewItem({ className, onDone }: { className?: string; onDone?: () => void }) {
  const { refreshFromDexie } = useAuth();
  return (
    <button type="button" className={className}
      onClick={async () => { await setPlanPreview('basic'); await refreshFromDexie(); onDone?.(); }}>
      <Eye size={14} />
      Ver como otro plan
    </button>
  );
}

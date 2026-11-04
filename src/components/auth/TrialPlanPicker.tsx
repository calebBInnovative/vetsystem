'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PLANS, PLAN_IDS, fetchPlans, type PlanCatalog, type PlanId } from '@/lib/billing/plans';
import { rememberChosenPlan } from '@/lib/billing/chosenPlan';
import { cn } from '@/lib/utils';

function summary(plan: PlanCatalog[PlanId]): string {
  const users = plan.maxUsers === null ? 'usuarios ilimitados' : `${plan.maxUsers} usuarios`;
  const branches = plan.maxBranches === null || plan.maxBranches > 1
    ? `${plan.maxBranches ?? 'varias'} sucursales` : '1 sucursal';
  return `${users} · ${branches}`;
}

/**
 * Which plan the 7-day trial is of. Nothing is charged: at the end the clinic
 * pays for whichever plan it wants, keeping its data.
 */
export function TrialPlanPicker({ value, onChange }: { value: PlanId; onChange: (id: PlanId) => void }) {
  const [catalog, setCatalog] = useState<PlanCatalog>(DEFAULT_PLANS);
  useEffect(() => {
    fetchPlans().then(setCatalog).catch(() => { /* offline: defaults */ });
  }, []);
  const plans = PLAN_IDS.map((id) => catalog[id]).filter((p) => p.active);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Prueba 7 días gratis del plan</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Plan de la prueba">
        {plans.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={value === p.id}
            onClick={() => { rememberChosenPlan(p.id); onChange(p.id); }}
            className={cn('rounded-xl border px-2 py-2 text-left transition-colors',
              value === p.id ? 'border-primary bg-primary/8 ring-2 ring-primary/30' : 'border-border hover:bg-muted')}>
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className="block text-[10px] leading-tight text-muted-foreground mt-0.5">{summary(p)}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Sin tarjeta. Al terminar eliges el plan que quieras y conservas tus datos.</p>
    </div>
  );
}

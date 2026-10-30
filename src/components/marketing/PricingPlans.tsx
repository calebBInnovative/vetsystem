'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_PLANS, PLAN_IDS, PLAN_MODULE_LABELS, fetchPlans,
  type PlanCatalog, type PlanConfig,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

/**
 * Landing pricing section, read from platform/plans — the same catalog the
 * platform owner edits at /admin/plans and clinics pay from, so a price changed
 * there shows here on the next visit. Self-contained: drop <PricingPlans /> in.
 */

/** Plan shown as the recommended one (the plan most clinics pick). */
const FEATURED = 'professional';

/** Promises true of every plan, listed after its limits and modules. */
const ALWAYS_INCLUDED = ['Funciona sin internet', 'Actualizaciones incluidas', 'Soporte por WhatsApp'];

function money(amount: number): string {
  return amount.toLocaleString('es-NI', { maximumFractionDigits: 2 });
}

function features(plan: PlanConfig): string[] {
  return [
    plan.maxUsers === null ? 'Usuarios ilimitados' : `Hasta ${plan.maxUsers} usuarios`,
    plan.maxPatients === null ? 'Pacientes ilimitados' : `Hasta ${plan.maxPatients} pacientes`,
    ...plan.modules.map((m) => PLAN_MODULE_LABELS[m]),
    ...ALWAYS_INCLUDED,
  ];
}

function PlanCard({ plan, annual }: { plan: PlanConfig; annual: boolean }) {
  const monthly = plan.prices.USD.monthly;
  const yearly = plan.prices.USD.annual;
  // Annual is shown as its monthly equivalent; a plan without an annual price keeps its monthly one.
  const showAnnual = annual && !!yearly;
  const price = showAnnual ? yearly! / 12 : monthly;
  const nio = plan.prices.NIO[showAnnual ? 'annual' : 'monthly'];
  const featured = plan.id === FEATURED;

  return (
    <div className={cn(
      'bg-card rounded-2xl overflow-hidden flex flex-col',
      featured ? 'border-2 border-primary shadow-xl md:-translate-y-2' : 'border border-border shadow-sm',
    )}>
      <div className={cn('px-6 py-5 text-center', featured ? 'bg-primary text-primary-foreground' : 'bg-muted/40')}>
        <div className="flex items-center justify-center gap-2">
          <p className={cn('text-sm font-semibold', featured ? 'opacity-90' : 'text-muted-foreground')}>{plan.name}</p>
          {featured && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">Más popular</span>
          )}
        </div>
        {price ? (
          <>
            <div className="flex items-baseline justify-center gap-1 mt-1">
              <span className="text-4xl font-extrabold">${money(price)}</span>
              <span className={cn('text-sm', featured ? 'opacity-70' : 'text-muted-foreground')}>USD / mes</span>
            </div>
            <p className={cn('text-xs mt-1 min-h-4', featured ? 'opacity-70' : 'text-muted-foreground')}>
              {showAnnual ? `Facturado como $${money(yearly!)}/año` : nio ? `o C$${money(nio)} al mes` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm mt-3 mb-2">Consulta el precio</p>
        )}
      </div>

      <div className="p-6 space-y-3 flex-1 flex flex-col">
        <div className="space-y-2.5 flex-1">
          {features(plan).map((item) => (
            <div key={item} className="flex items-center gap-2.5 text-sm">
              <Check size={16} className="text-primary shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <div className="pt-3">
          <Button className="w-full h-11 text-base" variant={featured ? 'default' : 'outline'} asChild>
            <Link href="/register">Comenzar 7 días gratis</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PricingPlans() {
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlans()
      .then((c) => { if (!cancelled) setCatalog(c); })
      // Offline or Firestore unreachable: the published defaults beat an empty section.
      .catch(() => { if (!cancelled) setCatalog(DEFAULT_PLANS); });
    return () => { cancelled = true; };
  }, []);

  const plans = catalog ? PLAN_IDS.map((id) => catalog[id]).filter((p) => p.active) : [];
  const anyAnnual = plans.some((p) => p.prices.USD.annual);
  const bestSaving = Math.max(0, ...plans.map((p) => {
    const m = p.prices.USD.monthly, y = p.prices.USD.annual;
    return m && y ? Math.round((1 - y / (m * 12)) * 100) : 0;
  }));

  return (
    <section id="precios" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Precios</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Simple y sin sorpresas</h2>
          <p className="text-muted-foreground">Elige el plan del tamaño de tu clínica. Cambia cuando quieras.</p>

          {anyAnnual && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <span className={cn('text-sm font-medium', annual ? 'text-muted-foreground' : 'text-foreground')}>Mensual</span>
              <button
                type="button"
                onClick={() => setAnnual(!annual)}
                aria-label="Cambiar entre precio mensual y anual"
                className={cn('relative w-11 h-6 rounded-full transition-colors', annual ? 'bg-primary' : 'bg-muted-foreground/30')}
              >
                <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', annual ? 'translate-x-6' : 'translate-x-1')} />
              </button>
              <span className={cn('text-sm font-medium', annual ? 'text-foreground' : 'text-muted-foreground')}>
                Anual
                {bestSaving > 0 && (
                  <span className="ml-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                    ahorra hasta {bestSaving}%
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {!catalog ? (
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-[30rem] rounded-2xl bg-muted/50 animate-pulse" />)}
          </div>
        ) : (
          <div className={cn('grid gap-6 mx-auto items-start',
            plans.length >= 3 ? 'md:grid-cols-3 max-w-5xl' : plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' : 'max-w-sm')}>
            {plans.map((plan) => <PlanCard key={plan.id} plan={plan} annual={annual} />)}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          7 días gratis con todo incluido. Sin tarjeta. Pagas por transferencia o Kash; cancela cuando quieras.
        </p>
      </div>
    </section>
  );
}

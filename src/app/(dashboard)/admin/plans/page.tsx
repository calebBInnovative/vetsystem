'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/admin/LoadError';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import {
  PLAN_IDS, PLAN_MODULE_LABELS, savePlans, subscribePlanSettings,
  type BillingPeriod, type PlanCatalog, type PlanConfig, type PlanCurrency, type PlanId, type PlanModule,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** '' ↔ undefined/null for number inputs: an empty box means "not sold" (price) or "unlimited" (limit). */
function numberOrEmpty(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export default function PlansPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  // The screen is a convenience; firestore.rules is what restricts the write.
  const platformOwner = isPlatformOwner(session?.email);

  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [annualOn, setAnnualOn] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (!loading && !platformOwner) router.replace('/admin');
  }, [loading, platformOwner, router]);

  // Live until the first edit, so unsaved changes are never overwritten.
  useEffect(() => {
    if (!platformOwner || dirty) return;
    return subscribePlanSettings((s) => { setLoadError(null); setCatalog(s.catalog); setAnnualOn(s.annualEnabled); }, setLoadError);
  }, [platformOwner, dirty]);

  function update(id: PlanId, patch: Partial<PlanConfig>) {
    setDirty(true);
    setCatalog((c) => c && { ...c, [id]: { ...c[id], ...patch } });
  }

  function setPrice(id: PlanId, currency: PlanCurrency, period: BillingPeriod, value: string) {
    if (!catalog) return;
    const amount = Number(value);
    const prices = { ...catalog[id].prices, [currency]: { ...catalog[id].prices[currency] } };
    if (value === '' || !(amount > 0)) delete prices[currency][period];
    else prices[currency][period] = amount;
    update(id, { prices });
  }

  function setLimit(id: PlanId, field: 'maxUsers' | 'maxPatients', value: string) {
    const amount = Number(value);
    update(id, { [field]: value === '' || !(amount > 0) ? null : Math.floor(amount) });
  }

  function toggleModule(id: PlanId, module: PlanModule) {
    if (!catalog) return;
    const modules = catalog[id].modules.includes(module)
      ? catalog[id].modules.filter((m) => m !== module)
      : [...catalog[id].modules, module];
    update(id, { modules });
  }

  async function save() {
    if (!catalog) return;
    if (!PLAN_IDS.some((id) => catalog[id].active)) {
      toast.error('Deja al menos un plan activo');
      return;
    }
    setSaving(true);
    try {
      await savePlans({ catalog, annualEnabled: annualOn });
      setDirty(false);
      toast.success('Planes guardados. Los nuevos precios aplican desde el próximo pago de cada clínica.');
    } catch (err) {
      console.error('[plans] save failed:', err);
      toast.error('No se pudieron guardar los planes');
    } finally {
      setSaving(false);
    }
  }

  if (!platformOwner) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push('/admin')}
          className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Planes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Precio y límites de cada plan. Una clínica conserva lo que pagó hasta su siguiente pago;
            los cambios aplican a los pagos nuevos.
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving || !catalog} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </Button>
      </div>

      {catalog && (
        <label className="flex items-start gap-3 bg-card rounded-2xl border border-border p-5 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={annualOn}
            onChange={(e) => { setDirty(true); setAnnualOn(e.target.checked); }} />
          <span className="space-y-0.5">
            <span className="block text-sm font-semibold">Vender plan anual</span>
            <span className="block text-xs text-muted-foreground">
              Apagado, ninguna clínica ve ni puede pagar el periodo anual (landing, pantalla de pago y servidor).
              Los precios anuales quedan guardados para cuando lo vuelvas a encender.
            </span>
          </span>
        </label>
      )}

      {loadError && !catalog ? (
        <LoadError error={loadError} what="los planes" />
      ) : !catalog ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {PLAN_IDS.map((id) => {
            const plan = catalog[id];
            return (
              <section key={id} className={cn('bg-card rounded-2xl border border-border p-5 space-y-4', !plan.active && 'opacity-70')}>
                <div className="flex items-center gap-3">
                  <input value={plan.name} onChange={(e) => update(id, { name: e.target.value })} maxLength={40}
                    className={cn(INPUT, 'font-semibold max-w-xs')} aria-label="Nombre del plan" />
                  <span className="text-xs text-muted-foreground font-mono">{id}</span>
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={plan.active} onChange={(e) => update(id, { active: e.target.checked })} />
                    A la venta
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['USD', 'NIO'] as const).flatMap((currency) => (['monthly', 'annual'] as const).map((period) => (
                    <label key={`${currency}-${period}`} className={cn('space-y-1', period === 'annual' && !annualOn && 'opacity-50')}>
                      <span className="text-xs font-medium">
                        {currency === 'USD' ? 'US$' : 'C$'} {period === 'monthly' ? 'mensual' : 'anual'}
                      </span>
                      <input type="number" min="0" step="0.01" value={numberOrEmpty(plan.prices[currency][period])}
                        onChange={(e) => setPrice(id, currency, period, e.target.value)} placeholder="No se vende"
                        className={INPUT} />
                    </label>
                  )))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Usuarios máximos</span>
                    <input type="number" min="1" step="1" value={numberOrEmpty(plan.maxUsers)}
                      onChange={(e) => setLimit(id, 'maxUsers', e.target.value)} placeholder="Ilimitados" className={INPUT} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Pacientes máximos</span>
                    <input type="number" min="1" step="1" value={numberOrEmpty(plan.maxPatients)}
                      onChange={(e) => setLimit(id, 'maxPatients', e.target.value)} placeholder="Ilimitados" className={INPUT} />
                  </label>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Módulos incluidos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(PLAN_MODULE_LABELS) as PlanModule[]).map((module) => {
                      const on = plan.modules.includes(module);
                      return (
                        <button key={module} type="button" onClick={() => toggleModule(id, module)}
                          className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                            on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                          {PLAN_MODULE_LABELS[module]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Un precio vacío significa que ese plan no se vende en esa moneda o periodo. Un límite vacío es ilimitado.
            Los métodos de pago (cuentas BAC, LAFISE, Kash) se configuran en Pagos de clínicas → Configuración.
          </p>
        </div>
      )}
    </div>
  );
}

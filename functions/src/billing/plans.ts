/**
 * Subscription plans: price and limits per plan, edited by the platform owner in
 * /admin/plans and stored in platform/plans. The server is the only one that turns
 * a plan id into an amount — the client never sends a price.
 *
 * Mirrored in src/lib/billing/plans.ts (defaults and parsing) — keep both identical.
 * Strategy and reasoning: docs/pricing/pricing-strategy.md.
 */

export const PLANS_PATH = 'platform/plans';

export const PLAN_IDS = ['basic', 'professional', 'clinic'] as const;
export type PlanId = typeof PLAN_IDS[number];

export type BillingPeriod = 'monthly' | 'annual';
export const PERIOD_DAYS: Record<BillingPeriod, number> = { monthly: 30, annual: 365 };

export type PlanCurrency = 'USD' | 'NIO';

/** Modules a plan can switch off. Mirrors AppModule in src/types/license.ts. */
export const PLAN_MODULES = [
  'patients', 'schedule', 'consultations', 'sales', 'quotes', 'inventory',
  'finances', 'invoices', 'services', 'promotions', 'import',
] as const;
export type PlanModule = typeof PLAN_MODULES[number];

export interface PlanLimits {
  /** null = unlimited */
  maxUsers: number | null;
  /** Active (not deleted) patients; null = unlimited */
  maxPatients: number | null;
  modules: PlanModule[];
}

export interface PlanConfig extends PlanLimits {
  id: PlanId;
  name: string;
  /** Price per currency and period; a missing price means "not sold in that currency/period" */
  prices: Record<PlanCurrency, Partial<Record<BillingPeriod, number>>>;
  active: boolean;
}

export type PlanCatalog = Record<PlanId, PlanConfig>;

const ALL_MODULES: PlanModule[] = [...PLAN_MODULES];
const BASIC_MODULES: PlanModule[] = ['patients', 'schedule', 'consultations', 'sales', 'quotes', 'inventory', 'services'];

/** Used until the owner saves platform/plans, and for any field it lacks. */
export const DEFAULT_PLANS: PlanCatalog = {
  basic: {
    id: 'basic', name: 'Básico', active: true,
    prices: { USD: { monthly: 12, annual: 120 }, NIO: {} },
    maxUsers: 2, maxPatients: 500, modules: BASIC_MODULES,
  },
  professional: {
    id: 'professional', name: 'Profesional', active: true,
    prices: { USD: { monthly: 20, annual: 200 }, NIO: {} },
    maxUsers: 5, maxPatients: null, modules: ALL_MODULES,
  },
  clinic: {
    id: 'clinic', name: 'Clínica', active: true,
    prices: { USD: { monthly: 35, annual: 350 }, NIO: {} },
    maxUsers: 15, maxPatients: null, modules: ALL_MODULES,
  },
};

/**
 * Plan of a license.plan value. Licenses written before plans existed say
 * 'monthly' (the single US$20 plan, now Professional), and a trial tries
 * Professional — the plan we want to sell.
 */
export function planIdOf(licensePlan: unknown): PlanId {
  return (PLAN_IDS as readonly unknown[]).includes(licensePlan) ? licensePlan as PlanId : 'professional';
}

export function isPlanId(value: unknown): value is PlanId {
  return (PLAN_IDS as readonly unknown[]).includes(value);
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === 'monthly' || value === 'annual';
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function limit(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** platform/plans.annualEnabled: the owner's switch to stop selling annual periods. Default on. */
export function annualEnabled(data: Record<string, unknown> | undefined): boolean {
  return data?.annualEnabled !== false;
}

/**
 * The catalog as sold: with annual selling switched off, every annual price is
 * dropped, so nothing can show it or charge it. The stored prices are kept for
 * when the switch is turned back on (see parseStoredPlans).
 */
export function parsePlans(data: Record<string, unknown> | undefined): PlanCatalog {
  const catalog = parseStoredPlans(data);
  if (annualEnabled(data)) return catalog;
  for (const id of PLAN_IDS) {
    const plan = catalog[id];
    plan.prices = { USD: { monthly: plan.prices.USD.monthly }, NIO: { monthly: plan.prices.NIO.monthly } };
    for (const currency of ['USD', 'NIO'] as const) {
      if (plan.prices[currency].monthly === undefined) delete plan.prices[currency].monthly;
    }
  }
  return catalog;
}

/** Reads platform/plans as stored, filling every missing or invalid field from DEFAULT_PLANS. */
export function parseStoredPlans(data: Record<string, unknown> | undefined): PlanCatalog {
  const raw = (data?.plans && typeof data.plans === 'object' ? data.plans : {}) as Record<string, unknown>;
  const catalog = {} as PlanCatalog;
  for (const id of PLAN_IDS) {
    const base = DEFAULT_PLANS[id];
    const r = (raw[id] && typeof raw[id] === 'object' ? raw[id] : {}) as Record<string, unknown>;
    const rawPrices = (r.prices && typeof r.prices === 'object' ? r.prices : null) as Record<string, unknown> | null;
    const prices = {} as PlanConfig['prices'];
    for (const currency of ['USD', 'NIO'] as const) {
      const c = (rawPrices?.[currency] && typeof rawPrices[currency] === 'object' ? rawPrices[currency] : null) as Record<string, unknown> | null;
      prices[currency] = c
        ? Object.fromEntries((['monthly', 'annual'] as const).flatMap((p) => positive(c[p]) ? [[p, positive(c[p])]] : []))
        : { ...base.prices[currency] };
    }
    const modules = Array.isArray(r.modules)
      ? PLAN_MODULES.filter((m) => (r.modules as unknown[]).includes(m))
      : base.modules;
    catalog[id] = {
      id,
      name:        typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : base.name,
      active:      typeof r.active === 'boolean' ? r.active : base.active,
      prices,
      maxUsers:    'maxUsers' in r ? limit(r.maxUsers, base.maxUsers) : base.maxUsers,
      maxPatients: 'maxPatients' in r ? limit(r.maxPatients, base.maxPatients) : base.maxPatients,
      modules,
    };
  }
  return catalog;
}

export function planLimits(plan: PlanConfig): PlanLimits {
  return { maxUsers: plan.maxUsers, maxPatients: plan.maxPatients, modules: [...plan.modules] };
}

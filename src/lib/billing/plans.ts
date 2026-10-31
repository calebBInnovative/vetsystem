import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firebase.config';
import type { AppModule, SessionLocal } from '@/types/license';

/**
 * Subscription plans on the client: the catalog the platform owner edits in
 * /admin/plans (platform/plans) and the limits a clinic works under.
 *
 * Mirrors functions/src/billing/plans.ts (defaults and parsing) — keep both
 * identical. The server alone decides what a plan costs; this copy exists so
 * the app can show plans and enforce limits, including offline.
 */

export const PLAN_IDS = ['basic', 'professional', 'clinic'] as const;
export type PlanId = typeof PLAN_IDS[number];

export type BillingPeriod = 'monthly' | 'annual';
export const PERIOD_DAYS: Record<BillingPeriod, number> = { monthly: 30, annual: 365 };

export type PlanCurrency = 'USD' | 'NIO';

/**
 * What a plan can include: the app modules (also gated per user by Permissions)
 * plus plan-only features that are not per-user, like the installed mobile app.
 */
export type PlanModule = AppModule | 'mobileApp';

/** Every module a plan can switch off, with its label for the owner's editor. */
export const PLAN_MODULE_LABELS: Record<PlanModule, string> = {
  patients:      'Pacientes',
  schedule:      'Agenda',
  consultations: 'Consultas',
  sales:         'Ventas (POS)',
  quotes:        'Cotizaciones',
  inventory:     'Inventario',
  services:      'Servicios',
  invoices:      'Facturas',
  finances:      'Finanzas y egresos',
  promotions:    'Promociones',
  import:        'Importar / exportar',
  mobileApp:     'App móvil',
};
const PLAN_MODULES = Object.keys(PLAN_MODULE_LABELS) as PlanModule[];

/**
 * Version of the module list. Catalogs and licenses saved before a module
 * existed cannot list it, so modules introduced at a later set are granted
 * from the plan's defaults when the stored set is older (see withLateModules).
 * Bump it, and add the module to LATE_MODULES, whenever a plan module is added.
 */
export const MODULE_SET = 2;
const LATE_MODULES: Partial<Record<PlanModule, number>> = { mobileApp: 2 };

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

const BASIC_MODULES: PlanModule[] = ['patients', 'schedule', 'consultations', 'sales', 'quotes', 'inventory', 'services'];

export const DEFAULT_PLANS: PlanCatalog = {
  basic: {
    id: 'basic', name: 'Básico', active: true,
    prices: { USD: { monthly: 12, annual: 120 }, NIO: {} },
    maxUsers: 2, maxPatients: 500, modules: BASIC_MODULES,
  },
  professional: {
    id: 'professional', name: 'Profesional', active: true,
    prices: { USD: { monthly: 20, annual: 200 }, NIO: {} },
    maxUsers: 5, maxPatients: null, modules: PLAN_MODULES,
  },
  clinic: {
    id: 'clinic', name: 'Clínica', active: true,
    prices: { USD: { monthly: 35, annual: 350 }, NIO: {} },
    maxUsers: 15, maxPatients: null, modules: PLAN_MODULES,
  },
};

/** 'monthly' (the single plan before tiers) and a trial both mean Professional. */
export function planIdOf(licensePlan: unknown): PlanId {
  return (PLAN_IDS as readonly unknown[]).includes(licensePlan) ? licensePlan as PlanId : 'professional';
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function limit(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function moduleSetOf(record: Record<string, unknown> | null | undefined): number {
  return typeof record?.moduleSet === 'number' ? record.moduleSet : 1;
}

/** Stored module list, plus the modules it predates that the plan includes by default. */
function modulesFrom(value: unknown, fallback: PlanModule[], storedSet: number): PlanModule[] {
  if (!Array.isArray(value)) return fallback;
  const stored = value as unknown[];
  return PLAN_MODULES.filter((m) =>
    stored.includes(m) || ((LATE_MODULES[m] ?? 0) > storedSet && fallback.includes(m)));
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
    catalog[id] = {
      id,
      name:        typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : base.name,
      active:      typeof r.active === 'boolean' ? r.active : base.active,
      prices,
      maxUsers:    'maxUsers' in r ? limit(r.maxUsers, base.maxUsers) : base.maxUsers,
      maxPatients: 'maxPatients' in r ? limit(r.maxPatients, base.maxPatients) : base.maxPatients,
      modules:     modulesFrom(r.modules, base.modules, moduleSetOf(data)),
    };
  }
  return catalog;
}

/**
 * Limits a clinic works under: the ones copied to its license when it paid, or
 * the defaults of its plan for licenses that predate plans (and trials).
 */
export function limitsFromLicense(license: Record<string, unknown>): PlanLimits {
  const base = DEFAULT_PLANS[planIdOf(license.plan)];
  const l = (license.limits && typeof license.limits === 'object' ? license.limits : null) as Record<string, unknown> | null;
  if (!l) return { maxUsers: base.maxUsers, maxPatients: base.maxPatients, modules: [...base.modules] };
  return {
    maxUsers:    'maxUsers' in l ? limit(l.maxUsers, base.maxUsers) : base.maxUsers,
    maxPatients: 'maxPatients' in l ? limit(l.maxPatients, base.maxPatients) : base.maxPatients,
    modules:     modulesFrom(l.modules, base.modules, moduleSetOf(l)),
  };
}

/** Plan name for a license.plan value, as the clinic sees it. */
export function planLabel(licensePlan: string | undefined, catalog: PlanCatalog = DEFAULT_PLANS): string {
  if (licensePlan === 'Trial') return 'Prueba gratis';
  return catalog[planIdOf(licensePlan)].name;
}

/** Live plan catalog; DEFAULT_PLANS until the owner saves one. */
export function subscribePlans(onChange: (catalog: PlanCatalog) => void): Unsubscribe {
  return onSnapshot(
    doc(getFirestoreDb(), 'platform', 'plans'),
    (snap) => onChange(parsePlans(snap.data())),
    (err) => console.warn('[billing] plans listener failed:', err),
  );
}

/** One-off read for public pages (no sign-in needed: platform/plans is public in firestore.rules). */
export async function fetchPlans(): Promise<PlanCatalog> {
  return parsePlans((await getDoc(doc(getFirestoreDb(), 'platform', 'plans'))).data());
}

export interface PlanSettings {
  /** Stored prices, annual ones included even while annual selling is off. */
  catalog: PlanCatalog;
  annualEnabled: boolean;
}

/** Platform owner's editing view of platform/plans (/admin/plans). */
export function subscribePlanSettings(
  onChange: (settings: PlanSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirestoreDb(), 'platform', 'plans'),
    (snap) => onChange({ catalog: parseStoredPlans(snap.data()), annualEnabled: annualEnabled(snap.data()) }),
    (err) => { console.warn('[billing] plans listener failed:', err); onError?.(err); },
  );
}

/** Platform owner only (firestore.rules). */
export async function savePlans({ catalog, annualEnabled }: PlanSettings): Promise<void> {
  await setDoc(doc(getFirestoreDb(), 'platform', 'plans'), { plans: catalog, annualEnabled, moduleSet: MODULE_SET, updatedAt: serverTimestamp() });
}

/** Limits in force for this session, offline included. Demo and old sessions get their plan's defaults. */
export function sessionLimits(session: Pick<SessionLocal, 'plan' | 'planLimits' | 'isDemo'> | null): PlanLimits {
  if (session?.planLimits) return session.planLimits;
  return limitsFromLicense({ plan: session?.isDemo ? 'clinic' : session?.plan });
}

export function planAllowsModule(session: Pick<SessionLocal, 'plan' | 'planLimits' | 'isDemo'> | null, module: PlanModule): boolean {
  return sessionLimits(session).modules.includes(module);
}

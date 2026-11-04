import { isPlanId, type PlanId } from '@/lib/billing/plans';

/**
 * The plan a visitor picked before having an account (pricing, the demo's
 * "Quiero este plan"). Kept for the tab, so it survives the Google sign-in
 * detour through /setup; registerClinic turns it into a trial of that plan.
 */
const KEY = 'vetsys-chosen-plan';

export function rememberChosenPlan(planId: PlanId): void {
  try { sessionStorage.setItem(KEY, planId); } catch { /* private mode: the URL still carries it */ }
}

export function readChosenPlan(): PlanId | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('plan');
    if (isPlanId(fromUrl)) { rememberChosenPlan(fromUrl); return fromUrl; }
    const stored = sessionStorage.getItem(KEY);
    return isPlanId(stored) ? stored : null;
  } catch {
    return null;
  }
}

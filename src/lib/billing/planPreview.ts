import { db } from '@/lib/db/database';
import { DEFAULT_PLANS, canPreviewPlans, fetchPlans, type PlanCatalog, type PlanId } from '@/lib/billing/plans';

/** The live catalog, so a preview matches /admin/plans; the defaults when it cannot be read in time. */
async function catalogOrDefaults(): Promise<PlanCatalog> {
  try {
    return await Promise.race([
      fetchPlans(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
  } catch {
    return DEFAULT_PLANS;
  }
}

/**
 * Tries a plan on this device (demo visitors and the platform owner only) or,
 * with null, goes back to the real one. Nothing reaches Firestore: the license
 * stays as it is and the preview only changes what this session shows.
 */
export async function setPlanPreview(planId: PlanId | null): Promise<void> {
  const session = await db.session.get('singleton');
  if (!session || !canPreviewPlans(session)) return;
  if (planId === null) {
    const { planPreview: _dropped, ...rest } = session;
    void _dropped;
    await db.session.put(rest);
    return;
  }
  const plan = (await catalogOrDefaults())[planId];
  await db.session.put({
    ...session,
    planPreview: {
      planId,
      name: plan.name,
      limits: { maxUsers: plan.maxUsers, maxPatients: plan.maxPatients, maxBranches: plan.maxBranches, modules: [...plan.modules] },
    },
  });
}

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { backfillBranchIds } from './backfill';

// ─── backfillBranches ────────────────────────────────────────────────────────
// Keeps every branch-scoped document carrying a branchId, so staff devices can
// download just their branches. Full scan on the first run, then incremental.

export const backfillBranches = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 540 },
  async () => {
    const result = await backfillBranchIds(getFirestore());
    logger.info('[branches] backfill', result);
  },
);

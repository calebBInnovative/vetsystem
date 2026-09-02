'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';

const MAX_ATTEMPTS = 5;

/**
 * Reactive sync status derived directly from the syncQueue table.
 * Updates automatically whenever the queue changes — no polling needed.
 *
 * pending: items waiting to push (attempts < 5), currently syncing or about to
 * stuck:   items that failed 5+ times (awaiting exponential-backoff retry)
 */
export function useSyncStatus() {
  const pending = useLiveQuery(
    () => db.syncQueue.where('attempts').below(MAX_ATTEMPTS).count(),
    [],
  );
  const stuck = useLiveQuery(
    () => db.syncQueue.where('attempts').aboveOrEqual(MAX_ATTEMPTS).count(),
    [],
  );

  const loading = pending === undefined || stuck === undefined;

  return {
    pending: pending ?? 0,
    stuck:   stuck   ?? 0,
    total:   (pending ?? 0) + (stuck ?? 0),
    loading,
    healthy: !loading && (pending ?? 0) === 0 && (stuck ?? 0) === 0,
  };
}

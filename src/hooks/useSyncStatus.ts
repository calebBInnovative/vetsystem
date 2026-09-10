'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/database';

const MAX_ATTEMPTS = 5;

/**
 * Reactive sync status derived from the syncQueue table.
 * Updates automatically on any queue change — no polling.
 *
 * pending: items actively queued (attempts < 5)
 * stuck:   items that hit the attempt ceiling (will be retried with backoff)
 * healthy: nothing in the queue at all
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
  const stuckItems = useLiveQuery(
    () => db.syncQueue.where('attempts').aboveOrEqual(MAX_ATTEMPTS).toArray(),
    [],
  );

  const loading = pending === undefined || stuck === undefined;

  return {
    pending:    pending    ?? 0,
    stuck:      stuck      ?? 0,
    stuckItems: stuckItems ?? [],
    total:      (pending ?? 0) + (stuck ?? 0),
    loading,
    healthy:    !loading && (pending ?? 0) === 0 && (stuck ?? 0) === 0,
  };
}

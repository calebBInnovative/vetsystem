'use client';

import { useCallback, useEffect, useState } from 'react';
import { listUsers, type FirestoreUser } from '@/lib/auth/auth.service';

/**
 * The clinic's team, read from Firestore (user profiles are not synced to
 * Dexie). Needs a connection; offline it stays empty and `error` is set.
 */
export function useClinicUsers(clinicId: string | undefined) {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      setUsers(await listUsers(clinicId));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { void reload(); }, [reload]);

  return { users, loading, error, reload };
}

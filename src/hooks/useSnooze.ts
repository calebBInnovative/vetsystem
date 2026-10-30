'use client';

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'vetsys-snooze-';

function readUntil(key: string): number {
  try {
    return Number(localStorage.getItem(PREFIX + key)) || 0;
  } catch {
    return 0; // storage blocked: never snoozed, the notice simply shows again
  }
}

/**
 * A dismissal that survives reloads but expires: the notice comes back on its
 * own once `until` passes, even with the app left open. Stored per device in
 * localStorage — a convenience, so losing it only means seeing the notice again.
 * A null key disables it (always "not snoozed").
 */
export function useSnooze(key: string | null): [snoozed: boolean, snoozeUntil: (until: number) => void] {
  const [until, setUntil] = useState(0);

  useEffect(() => {
    setUntil(key ? readUntil(key) : 0);
  }, [key]);

  // Wake up when the snooze runs out
  useEffect(() => {
    const remaining = until - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setUntil(0), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(t);
  }, [until]);

  const snoozeUntil = useCallback((value: number) => {
    if (!key) return;
    try { localStorage.setItem(PREFIX + key, String(value)); } catch { /* ignore */ }
    setUntil(value);
  }, [key]);

  return [until > Date.now(), snoozeUntil];
}

/** Next local midnight, as a ms timestamp. */
export function nextLocalMidnight(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
